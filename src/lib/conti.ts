/* eslint-disable @typescript-eslint/no-explicit-any */
// Most `any`s here live inside page.evaluate() browser-context code where we
// poke at the ContiLink AngularJS scopes — there are no types for those.
import puppeteer, { Browser, Page, HTTPRequest } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { promises as fs } from "node:fs";
import path from "node:path";

const CONTI_URL = process.env.CONTI_URL!;
const USER = process.env.CONTI_USERNAME!;
const PASS = process.env.CONTI_PASSWORD!;
const HEADLESS = process.env.CONTI_HEADLESS !== "false";
const DEBUG_DIR = "/tmp/conti-debug";

// Required for Vercel: disable graphics mode to avoid GPU-related crashes
chromium.setGraphicsMode = false;

export interface ContiError {
  message: string;
  url?: string;
  screenshot?: string;
  at: number;
}

export interface AvailabilityItem {
  articleNum: string;
  brand: string;
  description: string;
  available: string;
  warehouse: string;
}

declare global {
  // eslint-disable-next-line no-var
  var _contiBrowser: Browser | undefined;
  // eslint-disable-next-line no-var
  var _contiPage: Page | undefined;
  // eslint-disable-next-line no-var
  var _contiQueue: Promise<unknown> | undefined;
  // eslint-disable-next-line no-var
  var _contiLastError: ContiError | undefined;
}

async function getBrowser(): Promise<Browser> {
  // On Vercel, globals don't survive between cold starts, but we still
  // cache within a single warm invocation to avoid re-launching Chromium.
  if (global._contiBrowser?.connected) return global._contiBrowser;

  const executablePath = await chromium.executablePath();

  const browser = await puppeteer.launch({
  executablePath,
  headless: HEADLESS ? true : false,
  args: [
    ...chromium.args,
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--window-size=1366,900",
    "--single-process",
    "--no-zygote",
  ],
  defaultViewport: {
    width: 1366,
    height: 900,
  },
  ignoreHTTPSErrors: true,
} as any);

  global._contiBrowser = browser;
  global._contiPage = undefined;

  // Clean up stale references if the browser crashes or is closed
  browser.on("disconnected", () => {
    global._contiBrowser = undefined;
    global._contiPage = undefined;
  });

  return browser;
}

async function getPage(): Promise<Page> {
  if (global._contiPage && !global._contiPage.isClosed()) return global._contiPage;
  const browser = await getBrowser();
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(20000);
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
  );
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  await page.setRequestInterception(true);
  page.on("request", (req: HTTPRequest) => {
    const t = req.resourceType();
    if (t === "image" || t === "media" || t === "font") {
      req.abort().catch(() => {});
    } else {
      req.continue().catch(() => {});
    }
  });
  global._contiPage = page;
  return page;
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = global._contiQueue || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  global._contiQueue = next.catch(() => {});
  return next;
}

async function captureError(page: Page, label: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  let screenshot: string | undefined;
  let url: string | undefined;
  try {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(DEBUG_DIR, `${label}-${ts}.png`);
    await page.screenshot({ path: file, fullPage: true });
    screenshot = file;
    url = page.url();
  } catch {}
  global._contiLastError = { message, url, screenshot, at: Date.now() };
  console.error(
    `[conti] ${label} failed at ${url || "?"}: ${message}` +
      (screenshot ? ` (screenshot: ${screenshot})` : "")
  );
  // Reset the page (keep the browser warm). Next call gets a fresh page in
  // the same browser context — cookies are preserved, but DOM/Angular state
  // is wiped so we don't get stuck.
  try {
    if (page && !page.isClosed()) await page.close();
  } catch {}
  global._contiPage = undefined;
}

export function getLastError(): ContiError | undefined {
  return global._contiLastError;
}

async function isOnOrderPage(page: Page) {
  return (await page.$('input[ng-model="quickSearch"]')) !== null;
}

async function dismissConsent(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    // Known consent libraries
    const idCandidates = [
      "#onetrust-accept-btn-handler",
      "#accept-recommended-btn-handler",
      "#CybotCookiebotDialogBodyButtonAccept",
      "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
      "#hs-eu-confirmation-button",
      "#truste-consent-button",
    ];
    for (const sel of idCandidates) {
      const btn = document.querySelector(sel) as HTMLElement | null;
      if (btn && (btn.offsetParent !== null || btn.getClientRects().length)) {
        btn.click();
        return sel;
      }
    }
    // Generic by attribute
    const attrCandidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button[id*="accept" i], button[class*="accept" i], a[id*="accept" i], button[id*="cookie" i], a[class*="cookie" i][class*="accept" i]'
      )
    );
    for (const b of attrCandidates) {
      if (b.offsetParent !== null) {
        b.click();
        return b.id || b.className || "attr-match";
      }
    }
    // Generic by visible text
    const wanted = [
      "aceptar todas",
      "aceptar todo",
      "aceptar cookies",
      "aceptar",
      "accept all",
      "accept cookies",
      "i accept",
      "i agree",
      "continuar",
      "entendido",
      "ok",
      "got it",
    ];
    const all = Array.from(
      document.querySelectorAll<HTMLElement>("button, a, input[type='button']")
    );
    for (const el of all) {
      const t = (el.textContent || (el as HTMLInputElement).value || "")
        .trim()
        .toLowerCase();
      if (!t || t.length > 30) continue;
      if (!wanted.some((w) => t === w || t.includes(w))) continue;
      if (el.offsetParent === null) continue;
      el.click();
      return "text:" + t;
    }
    return null;
  });
}

async function performLogin(page: Page) {
  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  const userField = await page.$(
    [
      'input[name="username"]',
      'input[id="username"]',
      'input[name="j_username"]',
      'input[name="loginId"]',
      'input[name="user"]',
      'input[type="text"]:not([type="password"])',
      'input[type="email"]',
    ].join(", ")
  );
  if (userField) {
    await userField.click({ clickCount: 3 }).catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
    await userField.type(USER);
  }
  const passField = await page.$('input[type="password"]');
  if (!passField) throw new Error("Login: password field not found");
  await passField.click({ clickCount: 3 }).catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  await passField.type(PASS);
  const submit = await page.$(
    [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[id*="login" i]',
      'button[id*="signin" i]',
      'button[id*="ingresar" i]',
    ].join(", ")
  );
  await Promise.all([
    page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 })
      .catch(() => {}),
    submit ? submit.click() : page.keyboard.press("Enter"),
  ]);
}

async function ensureLoggedIn(page: Page) {
  if (await isOnOrderPage(page)) {
    await dismissConsent(page).catch(() => {});
    return;
  }
  await page.goto(CONTI_URL, { waitUntil: "domcontentloaded" });
  await dismissConsent(page).catch(() => {});
  if (await isOnOrderPage(page)) return;
  await performLogin(page);
  await dismissConsent(page).catch(() => {});
  if (!(await isOnOrderPage(page))) {
    await page.goto(CONTI_URL, { waitUntil: "domcontentloaded" });
    await dismissConsent(page).catch(() => {});
  }
  await page.waitForSelector('input[ng-model="quickSearch"]', {
    timeout: 25000,
  });
  // Cookie banners often appear ~1s after first paint — sweep again
  await new Promise((r) => setTimeout(r, 800));
  await dismissConsent(page).catch(() => {});
}

export async function ensureWarm(): Promise<{ warmed: boolean }> {
  return withLock(async () => {
    const page = await getPage();
    try {
      if (!(await isOnOrderPage(page))) {
        await ensureLoggedIn(page);
      }
      return { warmed: true };
    } catch (err) {
      await captureError(page, "warm", err);
      throw err;
    }
  });
}

async function clearCart(page: Page) {
  await page
    .evaluate(() => {
      document
        .querySelectorAll(".glyphicon-trash.quickMinus")
        .forEach((t) => (t as HTMLElement).click());
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
}

interface SearchVMSnapshot {
  triggered: boolean;
  triggerReason?: string;
  haveSearchResults?: boolean;
  searching?: boolean;
  resultCount?: number;
  tireSearchType?: string;
  freeTextSearch?: string;
}

async function runSearch(
  page: Page,
  query: string
): Promise<SearchVMSnapshot> {
  // Trigger via openSearch on the SearchController scope — this is the
  // canonical entry point (it's what Enter on the quickSearch input calls)
  // and it both opens the modal and submits the search atomically.
  const trigger = await page.evaluate((q) => {
    const w = window as any;
    if (!w.angular) return { ok: false, reason: "no-angular" };

    const quickInput = document.querySelector(
      'input[ng-model="quickSearch"]'
    ) as HTMLInputElement | null;
    if (!quickInput) return { ok: false, reason: "no-quickInput" };

    // Reflect the value in the DOM so it looks right and any ng-model digest sees it
    quickInput.value = q;
    quickInput.dispatchEvent(new Event("input", { bubbles: true }));

    let scsScope: any;
    try {
      scsScope = w.angular.element(quickInput).scope();
    } catch (e: any) {
      return { ok: false, reason: "scope-fail: " + (e?.message || e) };
    }
    if (!scsScope) return { ok: false, reason: "scope-null" };

    // Walk to the scope that owns openSearch (SearchController)
    let s: any = scsScope;
    while (s && typeof s.openSearch !== "function") s = s.$parent;
    if (!s) return { ok: false, reason: "no-openSearch" };

    s.quickSearch = q;

    // Force a "searching" marker AND clear any sticky filters so subsequent
    // searches don't inherit brand/type/speed filters from earlier ones.
    const anchors = [
      document.querySelector("#advSearchText"),
      document.querySelector("#advSearchButton"),
      document.querySelector('[ng-show="searchVM.searching"]'),
    ].filter((x: Element | null): x is Element => !!x);
    for (const a of anchors) {
      let m: any;
      try {
        m = w.angular.element(a).scope();
      } catch {
        continue;
      }
      while (m && !m.searchVM) m = m.$parent;
      if (m?.searchVM) {
        if (typeof m.searchVM.reset === "function") {
          try {
            m.searchVM.reset();
          } catch {}
        } else {
          m.searchVM.tireSearchType = undefined;
          m.searchVM.searchTypeKey = undefined;
        }
        m.searchVM.searching = true;
        m.searchVM.haveSearchResults = false;
        m.searchVM.searchResults = [];
        try {
          m.$apply();
        } catch {}
        break;
      }
    }

    try {
      s.openSearch(q);
    } catch (e: any) {
      return { ok: false, reason: "openSearch-err: " + (e?.message || e) };
    }
    try {
      s.$apply();
    } catch {}
    return { ok: true, reason: "openSearch" };
  }, query);

  let reason = trigger.reason;
  if (!trigger.ok) {
    console.error(`[conti] search trigger fallback (${trigger.reason})`);
    // DOM fallback — focus input, type, click magnifier
    const sel = 'input[ng-model="quickSearch"]';
    await page.waitForSelector(sel);
    await page.click(sel, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(sel, query);
    const clicked = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[ng-click^="openSearch"]');
      for (const a of Array.from(anchors)) {
        if (a.querySelector(".glyphicon-search")) {
          (a as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    if (!clicked) await page.keyboard.press("Enter");
    reason = "dom-fallback";
  }

  // Wait for searchVM.searching === false (we forced it true above)
  await page.waitForFunction(
    () => {
      const w = window as any;
      if (!w.angular) {
        return document.querySelectorAll(".searchEntry").length > 0;
      }
      const anchors = [
        document.querySelector("#advSearchText"),
        document.querySelector("#advSearchButton"),
        document.querySelector('input[ng-model="quickSearch"]'),
        document.querySelector('[ng-show="searchVM.searching"]'),
      ].filter((x: Element | null): x is Element => !!x);
      for (const a of anchors) {
        let s: any;
        try {
          s = w.angular.element(a).scope();
        } catch {
          continue;
        }
        while (s && !s.searchVM) s = s.$parent;
        if (s?.searchVM) return s.searchVM.searching === false;
      }
      return document.querySelectorAll(".searchEntry").length > 0;
    },
    { timeout: 30000 }
  );

  // Snapshot final state for diagnostics
  const snap = await page.evaluate(() => {
    const w = window as any;
    if (!w.angular) return null;
    const anchors = [
      document.querySelector("#advSearchText"),
      document.querySelector("#advSearchButton"),
      document.querySelector('input[ng-model="quickSearch"]'),
    ].filter((x: Element | null): x is Element => !!x);
    for (const a of anchors) {
      let s: any;
      try {
        s = w.angular.element(a).scope();
      } catch {
        continue;
      }
      while (s && !s.searchVM) s = s.$parent;
      if (s?.searchVM) {
        const sv = s.searchVM;
        return {
          haveSearchResults: !!sv.haveSearchResults,
          searching: !!sv.searching,
          resultCount: Array.isArray(sv.searchResults)
            ? sv.searchResults.length
            : 0,
          tireSearchType: String(sv.tireSearchType ?? ""),
          freeTextSearch: String(sv.freeTextSearch ?? ""),
        };
      }
    }
    return null;
  });

  return {
    triggered: true,
    triggerReason: reason,
    ...(snap || {}),
  };
}

export interface SearchOnlyResult {
  items: { articleNum: string; brand: string; description: string }[];
  debug: SearchVMSnapshot;
}

export async function searchOnly(
  query: string,
  limit = 200
): Promise<SearchOnlyResult> {
  return withLock(async () => {
    const page = await getPage();
    try {
      await ensureLoggedIn(page);
      await clearCart(page);
      const debug = await runSearch(page, query);
      console.log(
        `[conti] search "${query}" → trigger=${debug.triggerReason} ` +
          `searchVM=${JSON.stringify(debug)}`
      );

      // Bump itemsPerPage so every result row is rendered
      await page
        .evaluate(() => {
          const w = window as any;
          if (!w.angular) return;
          const anchors = [
            document.querySelector("#advSearchText"),
            document.querySelector("#advSearchButton"),
            document.querySelector(".searchEntry")?.parentElement,
            document.querySelector('input[ng-model="quickSearch"]'),
          ].filter(Boolean) as Element[];
          for (const a of anchors) {
            let s: any;
            try {
              s = w.angular.element(a).scope();
            } catch {
              continue;
            }
            while (s) {
              if (typeof s.itemsPerPage !== "undefined") {
                s.itemsPerPage = 9999;
                s.currentPage = 1;
                try {
                  s.$apply();
                } catch {}
                return;
              }
              s = s.$parent;
            }
          }
        })
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 250));

      const scopeMeta = await page.evaluate((lim) => {
        const w = window as any;
        if (!w.angular) return null;
        const anchors = [
          document.querySelector("#advSearchText"),
          document.querySelector("#advSearchButton"),
          document.querySelector('input[ng-model="quickSearch"]'),
        ].filter((x: Element | null): x is Element => !!x);
        for (const a of anchors) {
          let s: any;
          try {
            s = w.angular.element(a).scope();
          } catch {
            continue;
          }
          while (s && !s.searchVM) s = s.$parent;
          if (s?.searchVM?.searchResults) {
            const arr = s.searchVM.searchResults as any[];
            return arr
              .slice(0, lim)
              .map((r) => ({
                articleNum: String(
                  r.articleNum ?? r.articleNumber ?? ""
                ).trim(),
                brand: String(r.brand ?? "").trim(),
                description: String(r.description ?? "").trim(),
              }))
              .filter((r) => r.articleNum);
          }
        }
        return null;
      }, limit);

      let items = scopeMeta || [];
      if (items.length === 0) {
        const domMeta = await page.$$eval(
          ".searchEntry",
          (rows, lim) => {
            const text = (el: Element | null | undefined) =>
              (el?.textContent || "").trim().replace(/\s+/g, " ");
            const list: {
              articleNum: string;
              brand: string;
              description: string;
            }[] = [];
            rows.slice(0, lim).forEach((row) => {
              const cells = row.querySelectorAll(":scope > div");
              const articleNum = text(cells[0]);
              if (!/^\d{4,}$/.test(articleNum)) return;
              const brand = text(cells[2]);
              const descCell =
                cells[3]?.querySelector("div.ng-binding") || cells[3];
              const description = text(descCell);
              list.push({ articleNum, brand, description });
            });
            return list;
          },
          limit
        );
        items = domMeta;
      }

      if (items.length === 0) {
        try {
          await fs.mkdir(DEBUG_DIR, { recursive: true });
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const file = path.join(DEBUG_DIR, `empty-${ts}.png`);
          await page.screenshot({ path: file, fullPage: true });
          global._contiLastError = {
            message: `0 results for "${query}" (searchVM: ${JSON.stringify(
              debug
            )})`,
            url: page.url(),
            screenshot: file,
            at: Date.now(),
          };
        } catch {}
      }

      return { items, debug };
    } catch (err) {
      await captureError(page, "search", err);
      throw err;
    }
  });
}

export interface OneAvailability {
  articleNum: string;
  available: string;
  warehouse: string;
}

async function articleInDom(page: Page, articleNum: string): Promise<boolean> {
  return await page.evaluate((art) => {
    const rows = document.querySelectorAll(".searchEntry");
    for (const row of Array.from(rows)) {
      const cells = row.querySelectorAll(":scope > div");
      if ((cells[0]?.textContent || "").trim() === art) return true;
    }
    return false;
  }, articleNum);
}

async function fetchOneAvailability(
  page: Page,
  articleNum: string,
  originalQuery?: string
): Promise<OneAvailability> {
  await ensureLoggedIn(page);

  // 1. Make sure the article row is on screen. If a previous availability
  //    call left us with the original search results, reuse them.
  let inDom = await articleInDom(page, articleNum);
  if (!inDom) {
    await runSearch(page, articleNum);
    inDom = await articleInDom(page, articleNum);
    if (!inDom && originalQuery) {
      await runSearch(page, originalQuery);
      inDom = await articleInDom(page, articleNum);
    }
  }
  if (!inDom) throw new Error(`Article ${articleNum} not found`);

  // 2. Clear cart and put qty=1 on this article only.
  await clearCart(page);
  const setOk = await page.evaluate((art) => {
    const w = window as any;
    const rows = document.querySelectorAll(".searchEntry");
    for (const row of Array.from(rows)) {
      const cells = row.querySelectorAll(":scope > div");
      if ((cells[0]?.textContent || "").trim() !== art) continue;
      const input = row.querySelector(
        'input[ng-model="searchEntry.quantity"]'
      ) as HTMLInputElement | null;
      if (!input) return false;
      if (w.angular) {
        const scope = w.angular.element(input).scope();
        if (scope?.searchEntry) {
          scope.searchEntry.quantity = "1";
          try {
            scope.$apply();
          } catch {}
          return true;
        }
      }
      input.value = "1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }, articleNum);
  if (!setOk) throw new Error("Could not set qty on article row");

  // 3. Add to cart.
  await dismissConsent(page).catch(() => {});
  await page.click('button[ng-click="searchVM.addSearchResultsToCart()"]');

  // 4. Poll the cart line item. The row itself renders once ContiLink
  // finished checking (ng-if="!cartItem.checking"), but the traffic-light
  // number can land several seconds AFTER the row — so keep polling for a
  // real number, and only settle for "—" once the row has sat there without
  // one for a while (some articles genuinely have no stock figure for the
  // CO warehouse). Bounded so a wedged page fails here, resets, and frees
  // the queue lock instead of blocking later requests.
  const start = Date.now();
  const MAX_WAIT = 40000;
  const SETTLE_MS = 15000;
  let rowSeenAt = 0;
  for (;;) {
    const state = await page.evaluate((art) => {
      const text = (el: Element | null | undefined) =>
        (el?.textContent || "").trim().replace(/\s+/g, " ");
      const rows = Array.from(
        document.querySelectorAll(
          '[ng-repeat^="lineItem in cartItem.availabilityItemList"]'
        )
      );
      const row = rows.find((r) => (r.textContent || "").includes(art));
      if (!row) return { found: false as const, available: "", warehouse: "" };
      const availEl = row.querySelector(".trafficHeight span");
      const available = availEl ? text(availEl) : "";
      let warehouse = "";
      for (const d of Array.from(row.querySelectorAll("div"))) {
        const t = text(d);
        if (/^[A-Z]{3,5}$/.test(t)) {
          warehouse = t;
          break;
        }
      }
      return { found: true as const, available, warehouse };
    }, articleNum);

    if (state.found) {
      if (state.available) {
        return { articleNum, available: state.available, warehouse: state.warehouse };
      }
      if (!rowSeenAt) rowSeenAt = Date.now();
      if (Date.now() - rowSeenAt > SETTLE_MS) {
        // Row stable without a figure → ContiLink has none for this article.
        return { articleNum, available: "—", warehouse: state.warehouse };
      }
    }
    if (Date.now() - start > MAX_WAIT) {
      throw new Error(`Article ${articleNum}: cart row never appeared`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function getOneAvailability(
  articleNum: string,
  originalQuery?: string
): Promise<OneAvailability> {
  return withLock(async () => {
    const t0 = Date.now();
    for (let attempt = 1; ; attempt++) {
      const page = await getPage();
      try {
        return await fetchOneAvailability(page, articleNum, originalQuery);
      } catch (err) {
        await captureError(page, "availability", err);
        // One automatic retry on a fresh page — a wedged Angular page is the
        // most common transient failure, and captureError just reset it.
        // Skip the retry if we already burned a long time so the user isn't
        // left staring at a spinner past the route timeout.
        if (attempt >= 2 || Date.now() - t0 > 60000) throw err;
        console.log(`[conti] availability retry for ${articleNum}`);
      }
    }
  });
}

// ----- Unused streaming variant, kept for reference -----
export type StreamEvent =
  | {
      type: "results";
      items: { articleNum: string; brand: string; description: string }[];
      debug: SearchVMSnapshot;
    }
  | {
      type: "availability";
      articleNum: string;
      available: string;
      warehouse: string;
    }
  | { type: "error"; error: string }
  | { type: "done" };

export type StreamEmit = (event: StreamEvent) => void;

export async function searchAndStream(
  query: string,
  emit: StreamEmit,
  limit = 200
): Promise<void> {
  return withLock(async () => {
    const page = await getPage();
    try {
      await ensureLoggedIn(page);
      await clearCart(page);
      const debug = await runSearch(page, query);
      console.log(
        `[conti] search "${query}" → trigger=${debug.triggerReason} ` +
          `searchVM=${JSON.stringify(debug)}`
      );

      // Bump itemsPerPage so every result row is rendered (default cap is 30,
      // which silently drops items past the first page).
      await page
        .evaluate(() => {
          const w = window as any;
          if (!w.angular) return;
          const anchors = [
            document.querySelector("#advSearchText"),
            document.querySelector("#advSearchButton"),
            document.querySelector(".searchEntry")?.parentElement,
            document.querySelector('input[ng-model="quickSearch"]'),
          ].filter(Boolean) as Element[];
          for (const a of anchors) {
            let s: any;
            try {
              s = w.angular.element(a).scope();
            } catch {
              continue;
            }
            while (s) {
              if (typeof s.itemsPerPage !== "undefined") {
                s.itemsPerPage = 9999;
                s.currentPage = 1;
                try {
                  s.$apply();
                } catch {}
                return;
              }
              s = s.$parent;
            }
          }
        })
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 250));

      // Read full results from Angular scope (source of truth)
      const scopeMeta = await page.evaluate((lim) => {
        const w = window as any;
        if (!w.angular) return null;
        const anchors = [
          document.querySelector("#advSearchText"),
          document.querySelector("#advSearchButton"),
          document.querySelector('input[ng-model="quickSearch"]'),
        ].filter((x: Element | null): x is Element => !!x);
        for (const a of anchors) {
          let s: any;
          try {
            s = w.angular.element(a).scope();
          } catch {
            continue;
          }
          while (s && !s.searchVM) s = s.$parent;
          if (s?.searchVM?.searchResults) {
            const arr = s.searchVM.searchResults as any[];
            return arr
              .slice(0, lim)
              .map((r) => ({
                articleNum: String(
                  r.articleNum ?? r.articleNumber ?? ""
                ).trim(),
                brand: String(r.brand ?? "").trim(),
                description: String(r.description ?? "").trim(),
              }))
              .filter((r) => r.articleNum);
          }
        }
        return null;
      }, limit);

      let meta: { articleNum: string; brand: string; description: string }[] =
        scopeMeta || [];

      if (meta.length === 0) {
        // DOM fallback
        const domMeta = await page.$$eval(
          ".searchEntry",
          (rows, lim) => {
            const text = (el: Element | null | undefined) =>
              (el?.textContent || "").trim().replace(/\s+/g, " ");
            const list: {
              articleNum: string;
              brand: string;
              description: string;
            }[] = [];
            rows.slice(0, lim).forEach((row) => {
              const cells = row.querySelectorAll(":scope > div");
              const articleNum = text(cells[0]);
              if (!/^\d{4,}$/.test(articleNum)) return;
              const brand = text(cells[2]);
              const descCell =
                cells[3]?.querySelector("div.ng-binding") || cells[3];
              const description = text(descCell);
              list.push({ articleNum, brand, description });
            });
            return list;
          },
          limit
        );
        meta = domMeta;
      }

      // Emit results immediately so the UI can render the table right away.
      emit({ type: "results", items: meta, debug });

      if (meta.length === 0) {
        try {
          await fs.mkdir(DEBUG_DIR, { recursive: true });
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const file = path.join(DEBUG_DIR, `empty-${ts}.png`);
          await page.screenshot({ path: file, fullPage: true });
          global._contiLastError = {
            message: `0 results for "${query}" (searchVM: ${JSON.stringify(
              debug
            )})`,
            url: page.url(),
            screenshot: file,
            at: Date.now(),
          };
        } catch {}
        return;
      }

      const articleNums = meta.map((m) => m.articleNum);

      // Set qty=1 on every rendered row whose article matches.
      const setOk = await page.evaluate((arts) => {
        const w = window as any;
        const rows = Array.from(document.querySelectorAll(".searchEntry"));
        let any = false;
        let firstScope: any = null;
        for (const row of rows) {
          const cells = row.querySelectorAll(":scope > div");
          const articleNum = (cells[0]?.textContent || "").trim();
          if (!arts.includes(articleNum)) continue;
          const input = row.querySelector(
            'input[ng-model="searchEntry.quantity"]'
          ) as HTMLInputElement | null;
          if (!input) continue;
          if (w.angular) {
            const scope = w.angular.element(input).scope();
            if (scope?.searchEntry) {
              scope.searchEntry.quantity = "1";
              if (!firstScope) firstScope = scope;
              any = true;
              continue;
            }
          }
          input.value = "1";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          any = true;
        }
        if (firstScope) {
          try {
            firstScope.$apply();
          } catch {}
        }
        return any;
      }, articleNums);

      if (!setOk) {
        const count = await page.$$eval(".searchEntry", (rs) => rs.length);
        for (let i = 0; i < count; i++) {
          const sel = `#searchQty-${i}`;
          await page.click(sel, { clickCount: 3 }).catch(() => {});
          await page.keyboard.press("Backspace").catch(() => {});
          await page.type(sel, "1").catch(() => {});
        }
      }

      await dismissConsent(page).catch(() => {});
      await page.click('button[ng-click="searchVM.addSearchResultsToCart()"]');

      // Poll cart rows directly. The availability block is wrapped in
      // ng-if="!cartItem.checking", so the mere presence of `.trafficHeight`
      // text in the DOM is the authoritative "ready" signal — no scope check
      // needed (and trying to read scope can mis-skip rows during digest).
      const remaining = new Set(articleNums);
      const start = Date.now();
      const maxWait = 120000;
      const POLL_MS = 200;

      while (remaining.size > 0 && Date.now() - start < maxWait) {
        const ready = await page.evaluate((arts: string[]) => {
          const text = (el: Element | null | undefined) =>
            (el?.textContent || "").trim().replace(/\s+/g, " ");
          const rows = Array.from(
            document.querySelectorAll(
              '[ng-repeat^="lineItem in cartItem.availabilityItemList"]'
            )
          );
          const out: {
            articleNum: string;
            available: string;
            warehouse: string;
          }[] = [];
          for (const art of arts) {
            const row = rows.find((r) =>
              (r.textContent || "").includes(art)
            );
            if (!row) continue;
            const availEl = row.querySelector(".trafficHeight span");
            if (!availEl) continue;
            const available = text(availEl);
            let warehouse = "";
            for (const d of Array.from(row.querySelectorAll("div"))) {
              const t = text(d);
              if (/^[A-Z]{3,5}$/.test(t)) {
                warehouse = t;
                break;
              }
            }
            out.push({ articleNum: art, available, warehouse });
          }
          return out;
        }, [...remaining]);

        if (ready.length) {
          console.log(
            `[conti] +${ready.length} availability (${
              articleNums.length - remaining.size + ready.length
            }/${articleNums.length})`
          );
        }

        for (const r of ready) {
          if (!remaining.has(r.articleNum)) continue;
          remaining.delete(r.articleNum);
          emit({
            type: "availability",
            articleNum: r.articleNum,
            available: r.available,
            warehouse: r.warehouse,
          });
        }

        if (remaining.size > 0) {
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      }

      // Anything still unresolved → emit "—" so the UI can stop spinning.
      for (const art of remaining) {
        emit({
          type: "availability",
          articleNum: art,
          available: "—",
          warehouse: "",
        });
      }
    } catch (err) {
      await captureError(page, "lookup", err);
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", error: msg });
    }
  });
}

export async function shutdownConti() {
  try {
    if (global._contiPage) await global._contiPage.close();
  } catch {}
  try {
    if (global._contiBrowser) await global._contiBrowser.close();
  } catch {}
  global._contiPage = undefined;
  global._contiBrowser = undefined;
}