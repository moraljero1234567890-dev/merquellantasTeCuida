import { countryByCode, type CountryInfo } from "./country-info";

const UA = "PollaMundialista/1.0 (info@tirepro.com.co)";

export type CountrySummary = {
  extract: string;
  thumbnail: string | null;
  url: string;
};

export type CountryFacts = {
  association: string | null;
  confederation: string | null;
  nickname: string | null;
  homeStadium: string | null;
  headCoach: string | null;
  captain: string | null;
  mostCaps: string | null;
  topScorer: string | null;
  fifaRanking: string | null;
  firstGame: string | null;
  largestWin: string | null;
  worstDefeat: string | null;
};

export type WorldCupMatchStats = {
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
};

export type CountryWorldCup = {
  appearances: string | null;
  firstAppearance: string | null;
  bestResult: string | null;
  summary: string | null;
  url: string | null;
  matchStats: WorldCupMatchStats;
};

export type CountryPayload = {
  iso: string;
  fifa: string;
  es: string;
  en: string;
  flag: string;
  wikiUrl: string;
  summary: CountrySummary | null;
  facts: CountryFacts;
  worldCup: CountryWorldCup;
  recentSquad: string[];
};

type Infobox = Record<string, string>;

function flagUrl(iso: string): string {
  return `https://flagcdn.com/w320/${iso.toLowerCase()}.png`;
}

function encodeTitle(title: string): string {
  return encodeURIComponent(title).replace(/%20/g, "_");
}

async function resolveSpanishTitle(
  englishTitle: string,
): Promise<string | null> {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        titles: englishTitle.replace(/_/g, " "),
        prop: "langlinks",
        lllang: "es",
        format: "json",
        formatversion: "2",
        redirects: "1",
      }).toString();
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      next: { revalidate: 604800 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { pages?: Array<{ langlinks?: Array<{ title?: string }> }> };
    };
    const title = data.query?.pages?.[0]?.langlinks?.[0]?.title;
    return title ? title.replace(/ /g, "_") : null;
  } catch {
    return null;
  }
}

async function fetchSummary(title: string): Promise<CountrySummary | null> {
  try {
    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeTitle(title)}`;
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      extract?: string;
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    return {
      extract: data.extract ?? "",
      thumbnail: data.thumbnail?.source ?? null,
      url:
        data.content_urls?.desktop?.page ??
        `https://es.wikipedia.org/wiki/${encodeTitle(title)}`,
    };
  } catch {
    return null;
  }
}

async function pageExists(title: string): Promise<boolean> {
  try {
    const url =
      "https://es.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        titles: title.replace(/_/g, " "),
        format: "json",
        formatversion: "2",
        redirects: "1",
      }).toString();
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      next: { revalidate: 604800 },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      query?: { pages?: Array<{ missing?: boolean }> };
    };
    const page = data.query?.pages?.[0];
    return !!(page && !page.missing);
  } catch {
    return false;
  }
}

async function fetchWikitext(title: string): Promise<string> {
  try {
    const url =
      "https://es.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "parse",
        page: title,
        format: "json",
        prop: "wikitext",
        formatversion: "2",
        redirects: "1",
      }).toString();
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { parse?: { wikitext: string } };
    return json.parse?.wikitext ?? "";
  } catch {
    return "";
  }
}

function evalExpr(input: string): string {
  return input.replace(
    /\{\{\s*#expr:\s*([0-9.+\-*/() ]+?)(?:\s+round\s+(\d+))?\s*\}\}/gi,
    (_m, expr: string, round: string | undefined) => {
      try {
        const fn = new Function(`return (${expr})`);
        const v = Number(fn());
        if (!Number.isFinite(v)) return "";
        return round !== undefined ? v.toFixed(Number(round)) : String(v);
      } catch {
        return "";
      }
    },
  );
}

function stripWiki(input: string): string {
  let s = input;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<ref[^>]*?\/>/gi, "");
  s = s.replace(/<ref[\s\S]*?<\/ref>/gi, "");
  // Pre-evaluate parser functions like {{#expr:...}}
  s = evalExpr(s);
  // Country / flag templates: keep just the country code or label
  s = s.replace(
    /\{\{\s*(?:fb|fb-rt|fbu|fbw|fbw-rt|fba|fb-big|bandera|bandera2)\s*\|\s*([^|}]+)(?:\|[^}]*)?\}\}/gi,
    (_m, code) => String(code).trim(),
  );
  s = s.replace(/\{\{flagicon\|[^|}]+(?:\|[^}]+)?\}\}/gi, "");
  s = s.replace(/\{\{flagu?\|[^|}]+(?:\|[^}]+)?\}\}/gi, "");
  s = s.replace(/\{\{lang\|[^|}]+\|([^}]+)\}\}/gi, (_m, body) => String(body));
  s = s.replace(/\{\{nowrap\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{sort\|[^|]+\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{nts\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{cnote\|[^}]+\}\}/gi, "");
  s = s.replace(/\{\{small\|([^}]+)\}\}/gi, "$1");
  // Spanish date template: {{Fecha|d|m|y}} → d/m/y
  s = s.replace(
    /\{\{\s*[Ff]echa\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})\s*\|\s*(\d{4})[^}]*\}\}/g,
    (_m, d, m, y) =>
      `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`,
  );
  s = s.replace(/\{\{ubl\|([^}]+)\}\}/gi, (_m, body: string) =>
    body
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean)
      .join(", "),
  );
  // Strip remaining unknown templates iteratively (handles nesting)
  for (let i = 0; i < 4; i++) {
    s = s.replace(/\{\{[^{}]*\}\}/g, "");
  }
  s = s.replace(/\[\[(?:File|Image|Archivo):[^\]]+\]\]/gi, "");
  s = s.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_m, _l, label) => label);
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_m, label) => label);
  s = s.replace(/'''([^']+)'''/g, "$1");
  s = s.replace(/''([^']+)''/g, "$1");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&hairsp;/g, "");
  s = s.replace(/<br\s*\/?>/gi, " · ");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[·,;\s]+$/g, "").trim();
  return s;
}

function extractTemplate(
  wikitext: string,
  namePattern: RegExp,
): string | null {
  const start = wikitext.search(namePattern);
  if (start < 0) return null;
  // Walk back to find the opening {{
  let openAt = start;
  while (openAt > 0 && !(wikitext[openAt - 1] === "{" && wikitext[openAt - 2] === "{")) {
    openAt--;
    if (start - openAt > 80) break;
  }
  openAt -= 2;
  if (openAt < 0 || wikitext[openAt] !== "{" || wikitext[openAt + 1] !== "{") {
    // Fallback: assume name starts immediately after the {{
    openAt = wikitext.lastIndexOf("{{", start);
    if (openAt < 0) return null;
  }
  let i = openAt;
  let depth = 0;
  let end = -1;
  while (i < wikitext.length - 1) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
      depth++;
      i += 2;
    } else if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
      depth--;
      i += 2;
      if (depth === 0) {
        end = i;
        break;
      }
    } else {
      i++;
    }
  }
  if (end < 0) return null;
  return wikitext.slice(openAt + 2, end - 2);
}

function parseTemplateArgs(body: string): Infobox {
  // Drop the template name (everything up to the first top-level |)
  let depth = 0;
  let nameEnd = body.length;
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    const next = body[j + 1];
    if ((c === "{" && next === "{") || (c === "[" && next === "[")) {
      depth++;
      j++;
    } else if ((c === "}" && next === "}") || (c === "]" && next === "]")) {
      depth--;
      j++;
    } else if (c === "|" && depth === 0) {
      nameEnd = j;
      break;
    }
  }
  const stripped = body.slice(nameEnd + 1);

  const args: Infobox = {};
  let d = 0;
  let current = "";
  const tokens: string[] = [];
  let i = 0;
  while (i < stripped.length) {
    const c = stripped[i];
    const next = stripped[i + 1];
    if ((c === "{" && next === "{") || (c === "[" && next === "[")) {
      d++;
      current += c + next;
      i += 2;
      continue;
    }
    if ((c === "}" && next === "}") || (c === "]" && next === "]")) {
      d--;
      if (d < 0) d = 0;
      current += c + next;
      i += 2;
      continue;
    }
    if (c === "|" && d === 0) {
      tokens.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += c;
    i += 1;
  }
  tokens.push(current);
  for (const t of tokens) {
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t
      .slice(0, eq)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const value = t.slice(eq + 1).trim();
    if (key) args[key] = value;
  }
  return args;
}

function extractInfobox(wikitext: string): Infobox | null {
  const body =
    extractTemplate(wikitext, /\{\{\s*Ficha\s+de\s+selecci[oó]n\s+de\s+f[uú]tbol/i) ??
    extractTemplate(wikitext, /\{\{\s*Infobox\s+national\s+football\s+team/i);
  if (!body) return null;
  return parseTemplateArgs(body);
}

function clean(field: string | undefined | null): string | null {
  if (!field) return null;
  const s = stripWiki(field);
  return s.length ? s : null;
}

function joinIfBoth(a: string | null, b: string | null, sep: string): string | null {
  if (a && b) return `${a} ${sep} ${b}`;
  return a ?? b;
}

function buildMatchLine(
  infobox: Infobox,
  prefix: "ppi" | "mri" | "pri",
): string | null {
  const c1 = clean(infobox[`${prefix}_país1`]);
  const c2 = clean(infobox[`${prefix}_país2`]);
  const score = clean(infobox[`${prefix}_marcador`]);
  const place = clean(infobox[`${prefix}_lugar`]);
  const date = clean(infobox[`${prefix}_fecha`]);
  const teams = joinIfBoth(c1, c2, score ?? "vs.");
  if (!teams) return null;
  const tail = [place, date].filter(Boolean).join(", ");
  return tail ? `${teams} (${tail})` : teams;
}

function buildFifaRanking(infobox: Infobox): string | null {
  return (
    clean(infobox.ranking_fifa) ??
    clean(infobox.fifa_ranking) ??
    clean(infobox.fifa_rank)
  );
}

function buildTopScorer(infobox: Infobox): string | null {
  const name = clean(infobox.mayor_goleador) ?? clean(infobox.top_scorer);
  const goals = clean(infobox.mayor_goleador_goles);
  if (!name) return null;
  return goals ? `${name} (${goals})` : name;
}

function buildMostCaps(infobox: Infobox): string | null {
  const name =
    clean(infobox.más_participaciones) ??
    clean(infobox.mas_participaciones) ??
    clean(infobox.most_caps);
  const caps = clean(infobox.mayor_partidos);
  if (!name && !caps) return null;
  if (name && caps) return `${name} (${caps})`;
  return name ?? caps;
}

function buildCoach(infobox: Infobox): string | null {
  return (
    clean(infobox.director_técnico) ??
    clean(infobox.director_tecnico) ??
    clean(infobox.entrenador) ??
    clean(infobox.coach) ??
    clean(infobox.manager)
  );
}

function buildNickname(infobox: Infobox): string | null {
  return (
    clean(infobox.seudónimo) ??
    clean(infobox.seudonimo) ??
    clean(infobox.apodo) ??
    clean(infobox.nickname)
  );
}

function extractMatchStats(wikitext: string): WorldCupMatchStats {
  const result: WorldCupMatchStats = {
    played: null,
    won: null,
    drawn: null,
    lost: null,
    goalsFor: null,
    goalsAgainst: null,
  };
  const labels: Array<{ key: keyof WorldCupMatchStats; label: string }> = [
    { key: "played", label: "Partidos" },
    { key: "won", label: "Partidos ganados" },
    { key: "drawn", label: "Partidos empatados" },
    { key: "lost", label: "Partidos perdidos" },
    { key: "goalsFor", label: "Goles anotados" },
    { key: "goalsAgainst", label: "Goles recibidos" },
  ];
  for (const { key, label } of labels) {
    const escaped = label.replace(/\s+/g, "\\s+");
    // Accept inline (|| value) or newline-then-pipe (\n| value)
    const re = new RegExp(
      `'''\\s*${escaped}\\s*'''\\s*(?:\\|\\||[\\r\\n]+\\s*\\|)\\s*([^|\\n\\r]+)`,
      "i",
    );
    const m = re.exec(wikitext);
    if (!m) continue;
    const cleaned = stripWiki(m[1]);
    const num = parseInt(cleaned.replace(/[^0-9-]/g, ""), 10);
    if (Number.isFinite(num)) result[key] = num;
  }
  return result;
}

function extractRecentSquad(wikitext: string, limit = 26): string[] {
  const startRe =
    /==+\s*(Última convocatoria|Convocatoria(?:s)? actual|Plantel actual|Jugadores convocados|Plantilla actual|Plantel|Plantilla|Jugadores)\s*==+/i;
  const m = startRe.exec(wikitext);
  if (!m) return [];
  let segment = wikitext.slice(m.index, m.index + 25000);
  segment = segment.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
  segment = segment.replace(/\[\[([^\]]+)\]\]/g, "$1");
  const bodies = extractBalancedTemplates(
    segment,
    /^\s*(?:nat\s*fs\s*g\s*player|jugador\s+de\s+selecci[oó]n)\b/i,
  );
  const names: string[] = [];
  const seen = new Set<string>();
  for (const body of bodies) {
    if (names.length >= limit) break;
    const nameMatch =
      /\|\s*(?:nombre|name|jugador|player)\s*=\s*([^|}\n]+)/i.exec(body);
    if (!nameMatch) continue;
    const name = stripWiki(nameMatch[1]);
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

function extractBalancedTemplates(text: string, namePattern: RegExp): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length - 1) {
    if (text[i] === "{" && text[i + 1] === "{") {
      const head = text.slice(i + 2, i + 80);
      if (!namePattern.test(head)) {
        i++;
        continue;
      }
      let depth = 1;
      let j = i + 2;
      while (j < text.length - 1 && depth > 0) {
        if (text[j] === "{" && text[j + 1] === "{") {
          depth++;
          j += 2;
        } else if (text[j] === "}" && text[j + 1] === "}") {
          depth--;
          j += 2;
        } else {
          j++;
        }
      }
      out.push(text.slice(i + 2, j - 2));
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

async function resolveWcTitle(info: CountryInfo): Promise<string | null> {
  const fromLangLinks = await resolveSpanishTitle(info.wikiWorldCup);
  if (fromLangLinks) return fromLangLinks;
  // Heuristic fallbacks based on the Spanish country name
  const base = info.es.replace(/ /g, "_");
  const candidates = [
    `${base}_en_la_Copa_Mundial_de_Fútbol`,
    `Selección_de_fútbol_de_${base}_en_la_Copa_Mundial_de_Fútbol`,
    `Selección_de_fútbol_de_los_${base}_en_la_Copa_Mundial_de_Fútbol`,
    `Selección_de_fútbol_de_las_${base}_en_la_Copa_Mundial_de_Fútbol`,
  ];
  for (const c of candidates) {
    if (await pageExists(c)) return c;
  }
  return null;
}

export async function buildCountryPayload(
  info: CountryInfo,
): Promise<CountryPayload> {
  const [esTeamTitle, esWcTitle] = await Promise.all([
    resolveSpanishTitle(info.wikiTeam),
    resolveWcTitle(info),
  ]);

  const [summary, teamWiki, wcSummary, wcWiki] = await Promise.all([
    esTeamTitle ? fetchSummary(esTeamTitle) : Promise.resolve(null),
    esTeamTitle ? fetchWikitext(esTeamTitle) : Promise.resolve(""),
    esWcTitle ? fetchSummary(esWcTitle) : Promise.resolve(null),
    esWcTitle ? fetchWikitext(esWcTitle) : Promise.resolve(""),
  ]);

  const infobox = teamWiki ? extractInfobox(teamWiki) ?? {} : {};
  const matchStats = wcWiki
    ? extractMatchStats(wcWiki)
    : {
        played: null,
        won: null,
        drawn: null,
        lost: null,
        goalsFor: null,
        goalsAgainst: null,
      };

  const wikiUrl = esTeamTitle
    ? `https://es.wikipedia.org/wiki/${encodeTitle(esTeamTitle)}`
    : `https://en.wikipedia.org/wiki/${encodeTitle(info.wikiTeam)}`;

  return {
    iso: info.iso,
    fifa: info.fifa,
    es: info.es,
    en: info.en,
    flag: flagUrl(info.iso),
    wikiUrl,
    summary,
    facts: {
      association: clean(infobox.asociación) ?? clean(infobox.asociacion) ?? clean(infobox.association),
      confederation:
        clean(infobox.confederación) ??
        clean(infobox.confederacion) ??
        clean(infobox.confederation),
      nickname: buildNickname(infobox),
      homeStadium:
        clean(infobox.estadio) ?? clean(infobox.home_stadium) ?? clean(infobox.stadium),
      headCoach: buildCoach(infobox),
      captain: clean(infobox.capitán) ?? clean(infobox.capitan) ?? clean(infobox.captain),
      mostCaps: buildMostCaps(infobox),
      topScorer: buildTopScorer(infobox),
      fifaRanking: buildFifaRanking(infobox),
      firstGame: buildMatchLine(infobox, "ppi") ?? clean(infobox.first_game),
      largestWin: buildMatchLine(infobox, "mri") ?? clean(infobox.largest_win),
      worstDefeat:
        buildMatchLine(infobox, "pri") ??
        clean(infobox.largest_loss) ??
        clean(infobox.worst_defeat),
    },
    worldCup: {
      appearances:
        clean(infobox.participación_mundial) ??
        clean(infobox.participacion_mundial) ??
        clean(infobox.world_cup_apps),
      firstAppearance:
        clean(infobox.primer_mundial) ?? clean(infobox.world_cup_first),
      bestResult:
        clean(infobox.mejor_mundial) ?? clean(infobox.world_cup_best),
      summary: wcSummary?.extract ?? null,
      url: esWcTitle
        ? `https://es.wikipedia.org/wiki/${encodeTitle(esWcTitle)}`
        : wcSummary?.url ?? null,
      matchStats,
    },
    recentSquad: teamWiki ? extractRecentSquad(teamWiki) : [],
  };
}

export async function loadCountry(
  code: string,
): Promise<CountryPayload | null> {
  const info = countryByCode(decodeURIComponent(code));
  if (!info) return null;
  return buildCountryPayload(info);
}
