import type { MatchDoc, MatchStage } from "./types";

const UA = "PollaMundialista/1.0 (info@tirepro.com.co)";

const FIFA_TO_ISO: Record<string, string> = {
  ALG: "dz",
  ARG: "ar",
  AUS: "au",
  AUT: "at",
  BEL: "be",
  BIH: "ba",
  BRA: "br",
  CAN: "ca",
  CHI: "cl",
  CIV: "ci",
  COD: "cd",
  COL: "co",
  CPV: "cv",
  CRC: "cr",
  CRO: "hr",
  CUW: "cw",
  CZE: "cz",
  DEN: "dk",
  ECU: "ec",
  EGY: "eg",
  ENG: "gb-eng",
  ESP: "es",
  FRA: "fr",
  GER: "de",
  GHA: "gh",
  HAI: "ht",
  HUN: "hu",
  IRN: "ir",
  IRQ: "iq",
  ITA: "it",
  JAM: "jm",
  JOR: "jo",
  JPN: "jp",
  KOR: "kr",
  KSA: "sa",
  MAR: "ma",
  MEX: "mx",
  NED: "nl",
  NGA: "ng",
  NOR: "no",
  NZL: "nz",
  PAN: "pa",
  PAR: "py",
  POR: "pt",
  QAT: "qa",
  ROU: "ro",
  RSA: "za",
  SCO: "gb-sct",
  SEN: "sn",
  SRB: "rs",
  SUI: "ch",
  SWE: "se",
  TUN: "tn",
  TUR: "tr",
  UAE: "ae",
  UKR: "ua",
  URU: "uy",
  USA: "us",
  UZB: "uz",
  VEN: "ve",
  WAL: "gb-wls",
};

function flagFromFifa(code: string): string {
  const iso = FIFA_TO_ISO[code.toUpperCase()] ?? code.toLowerCase();
  return `https://flagcdn.com/w80/${iso}.png`;
}

const TEAM_NAMES: Record<string, string> = {
  ALG: "Argelia",
  ARG: "Argentina",
  AUS: "Australia",
  AUT: "Austria",
  BEL: "Bélgica",
  BIH: "Bosnia y Herzegovina",
  BRA: "Brasil",
  CAN: "Canadá",
  CHI: "Chile",
  CIV: "Costa de Marfil",
  COD: "RD del Congo",
  COL: "Colombia",
  CPV: "Cabo Verde",
  CRC: "Costa Rica",
  CRO: "Croacia",
  CUW: "Curazao",
  CZE: "República Checa",
  DEN: "Dinamarca",
  ECU: "Ecuador",
  EGY: "Egipto",
  ENG: "Inglaterra",
  ESP: "España",
  FRA: "Francia",
  GER: "Alemania",
  GHA: "Ghana",
  HAI: "Haití",
  HUN: "Hungría",
  IRN: "Irán",
  IRQ: "Irak",
  ITA: "Italia",
  JAM: "Jamaica",
  JOR: "Jordania",
  JPN: "Japón",
  KOR: "Corea del Sur",
  KSA: "Arabia Saudita",
  MAR: "Marruecos",
  MEX: "México",
  NED: "Países Bajos",
  NGA: "Nigeria",
  NOR: "Noruega",
  NZL: "Nueva Zelanda",
  PAN: "Panamá",
  PAR: "Paraguay",
  POR: "Portugal",
  QAT: "Catar",
  ROU: "Rumanía",
  RSA: "Sudáfrica",
  SCO: "Escocia",
  SEN: "Senegal",
  SRB: "Serbia",
  SUI: "Suiza",
  SWE: "Suecia",
  TUN: "Túnez",
  TUR: "Turquía",
  UAE: "Emiratos Árabes Unidos",
  UKR: "Ucrania",
  URU: "Uruguay",
  USA: "Estados Unidos",
  UZB: "Uzbekistán",
  VEN: "Venezuela",
  WAL: "Gales",
};

function teamName(code: string): string {
  return TEAM_NAMES[code.toUpperCase()] ?? code;
}

async function fetchWikitext(page: string): Promise<string> {
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "parse",
      page,
      format: "json",
      prop: "wikitext",
      formatversion: "2",
    }).toString();
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Wikipedia ${page}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    error?: { info: string };
    parse?: { wikitext: string };
  };
  if (json.error) throw new Error(`Wikipedia ${page}: ${json.error.info}`);
  return json.parse?.wikitext ?? "";
}

function unwrapTemplates(input: string): string {
  let s = input;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(
    /\{\{#invoke:flag\|[^|}]+\|([A-Z]{2,4})\}\}/g,
    (_m, code) => code,
  );
  s = s.replace(/\{\{flagicon\|([^|}]+)\}\}/gi, (_m, code) => code);
  s = s.replace(
    /\{\{Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})[^}]*\}\}/g,
    (_m, y, mo, d) =>
      `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  );
  s = s.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_m, _link, label) => label);
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_m, label) => label);
  s = s.replace(/&nbsp;/g, " ");
  return s;
}

function splitTemplateArgs(body: string): Record<string, string> {
  const args: Record<string, string> = {};
  let depth = 0;
  let current = "";
  const tokens: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" && body[i + 1] === "{") {
      depth++;
      current += c;
    } else if (c === "}" && body[i + 1] === "}") {
      depth--;
      current += c;
    } else if (c === "[" && body[i + 1] === "[") {
      depth++;
      current += c;
    } else if (c === "]" && body[i + 1] === "]") {
      depth--;
      current += c;
    } else if (c === "|" && depth === 0) {
      tokens.push(current);
      current = "";
      continue;
    } else {
      current += c;
    }
  }
  tokens.push(current);
  for (const t of tokens) {
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    args[key] = value;
  }
  return args;
}

function extractFootballBoxes(wikitext: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const startRe = /\{\{#invoke:football box\|main\b/gi;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(wikitext)) !== null) {
    let i = m.index + 2;
    let depth = 1;
    let end = -1;
    while (i < wikitext.length) {
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
    if (end < 0) continue;
    const body = wikitext.slice(m.index + 2, end - 2);
    const stripped = body.replace(/^#invoke:football box\|main\|?/i, "");
    out.push(splitTemplateArgs(stripped));
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns the wikitext between `<section begin="label"/>` and the matching
// `<section end="label"/>` markers, or null when the label isn't present. Used
// to pull a single transcluded match ({{#lst:Article|label}}) out of a shared
// sub-article that holds many labelled match boxes.
function sliceLabeledSection(wikitext: string, label: string): string | null {
  const esc = escapeRegExp(label);
  const begin = new RegExp(`<section\\s+begin\\s*=\\s*"?${esc}"?\\s*/>`);
  const b = begin.exec(wikitext);
  if (!b) return null;
  const rest = wikitext.slice(b.index + b[0].length);
  const end = new RegExp(`<section\\s+end\\s*=\\s*"?${esc}"?\\s*/>`);
  const e = end.exec(rest);
  return e ? rest.slice(0, e.index) : rest;
}

function parseLocalTime(raw: string): {
  hour: number;
  minute: number;
  offsetHours: number;
} | null {
  const cleaned = raw.replace(/&nbsp;/g, " ").trim();
  const tz = /UTC[−−–—-](\d{1,2})/.exec(cleaned);
  const offsetHours = tz ? -Number(tz[1]) : 0;
  const tm = /(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.|am|pm)?/i.exec(cleaned);
  if (!tm) return null;
  let hour = Number(tm[1]);
  const minute = Number(tm[2]);
  const ampm = (tm[3] ?? "").toLowerCase();
  if (ampm.startsWith("p") && hour < 12) hour += 12;
  if (ampm.startsWith("a") && hour === 12) hour = 0;
  return { hour, minute, offsetHours };
}

function combineUtc(
  date: string,
  local: { hour: number; minute: number; offsetHours: number },
): { utcDate: string; date: string; time: string } {
  const [y, mo, d] = date.split("-").map(Number);
  const localMs = Date.UTC(y, mo - 1, d, local.hour, local.minute);
  const utcMs = localMs - local.offsetHours * 3600 * 1000;
  const utc = new Date(utcMs);
  const utcDate = utc.toISOString();
  return {
    utcDate,
    date: utcDate.slice(0, 10),
    time: utcDate.slice(11, 16),
  };
}

function parseScore(raw: string): {
  home: number;
  away: number;
  penaltyHome?: number;
  penaltyAway?: number;
  status: "FINISHED" | "SCHEDULED";
} {
  const s = unwrapTemplates(raw).trim();
  if (!s || /^score link/i.test(s)) return { home: 0, away: 0, status: "SCHEDULED" };
  const m = /(\d{1,2})\s*[–\-]\s*(\d{1,2})/.exec(s);
  if (!m) return { home: 0, away: 0, status: "SCHEDULED" };
  const pen = /\((\d+)\s*[–\-]\s*(\d+)[^)]*\)/.exec(s);
  return {
    home: Number(m[1]),
    away: Number(m[2]),
    status: "FINISHED",
    penaltyHome: pen ? Number(pen[1]) : undefined,
    penaltyAway: pen ? Number(pen[2]) : undefined,
  };
}

function teamFromField(raw: string): { code: string; name: string } | null {
  const s = unwrapTemplates(raw).trim();
  if (!s) return null;
  const code = /\b([A-Z]{3})\b/.exec(s);
  if (code) {
    const fifa = code[1];
    return { code: fifa, name: teamName(fifa) };
  }
  return { code: "", name: s };
}

function parseStadium(raw: string): { venue: string; city: string } {
  const s = unwrapTemplates(raw).trim();
  const parts = s.split(",").map((x) => x.trim());
  return {
    venue: parts[0] ?? "",
    city: parts.slice(1).join(", "),
  };
}

export type WikipediaMatchOptions = {
  groupKey?: string;
  matchday?: number;
  stage: MatchStage;
  stageLabel: string;
  externalId: string;
};

function toMatchDoc(
  fields: Record<string, string>,
  opts: WikipediaMatchOptions,
): MatchDoc | null {
  const home = teamFromField(fields.team1 ?? "");
  const away = teamFromField(fields.team2 ?? "");
  if (!home || !away) return null;
  const dateRaw = unwrapTemplates(fields.date ?? "").trim();
  const dateMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(dateRaw);
  if (!dateMatch) return null;
  const localDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const local = parseLocalTime(fields.time ?? "") ?? {
    hour: 0,
    minute: 0,
    offsetHours: 0,
  };
  const { utcDate, date, time } = combineUtc(localDate, local);
  const scoreInfo = parseScore(fields.score ?? "");
  const { venue, city } = parseStadium(fields.stadium ?? "");

  return {
    _id: `wiki-${opts.externalId}`,
    source: "wikipedia" as const,
    externalId: opts.externalId,
    utcDate,
    date,
    time,
    status: scoreInfo.status,
    stage: opts.stage,
    stageLabel: opts.stageLabel,
    group: opts.groupKey ?? null,
    matchday: opts.matchday ?? null,
    venue,
    city,
    home: {
      code: (FIFA_TO_ISO[home.code] ?? home.code).toLowerCase(),
      name: home.name,
      crest: home.code ? flagFromFifa(home.code) : "",
    },
    away: {
      code: (FIFA_TO_ISO[away.code] ?? away.code).toLowerCase(),
      name: away.name,
      crest: away.code ? flagFromFifa(away.code) : "",
    },
    score:
      scoreInfo.status === "FINISHED"
        ? {
            fullTime: { home: scoreInfo.home, away: scoreInfo.away },
            halfTime: null,
            penalties:
              scoreInfo.penaltyHome != null && scoreInfo.penaltyAway != null
                ? {
                    home: scoreInfo.penaltyHome,
                    away: scoreInfo.penaltyAway,
                  }
                : null,
          }
        : null,
  };
}

const GROUP_KEYS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
] as const;

const KNOCKOUT_STAGES: Record<string, { stage: MatchStage; stageLabel: string }> = {
  "Round of 32": { stage: "ROUND_OF_32", stageLabel: "Dieciseisavos" },
  "Round of 16": { stage: "ROUND_OF_16", stageLabel: "Octavos" },
  Quarterfinals: { stage: "QUARTER_FINALS", stageLabel: "Cuartos" },
  Semifinals: { stage: "SEMI_FINALS", stageLabel: "Semifinal" },
  "Match for third place": { stage: "THIRD_PLACE", stageLabel: "Tercer puesto" },
  Final: { stage: "FINAL", stageLabel: "Final" },
};

async function parseGroupPage(letter: string): Promise<MatchDoc[]> {
  const page = `2026_FIFA_World_Cup_Group_${letter}`;
  const wt = await fetchWikitext(page);
  const start = wt.indexOf("==Matches==");
  if (start < 0) return [];
  const sliced = wt.slice(start);

  // Each match is wrapped in a `<section begin="F3" />…<section end="F3" />`
  // marker whose number is the match's canonical, editor-maintained slot
  // (F1/F2 = matchday 1, F3/F4 = matchday 2, F5/F6 = matchday 3). We key the
  // match id + matchday off that number rather than the box's position in the
  // page, because Wikipedia sometimes formats a notable match differently —
  // e.g. transcluding it from its own article with `{{#lst:Article|F4}}`
  // instead of an inline `{{#invoke:football box}}`. Position-based numbering
  // silently shifts every later match (wrong id + wrong matchday) the moment
  // one box is missing or reordered; section numbers stay stable.
  const sectionRe = new RegExp(
    `<section\\s+begin\\s*=\\s*"?${letter}(\\d+)"?\\s*/>`,
    "g",
  );
  const markers: Array<{ num: number; index: number }> = [];
  let sm: RegExpExecArray | null;
  while ((sm = sectionRe.exec(sliced)) !== null) {
    markers.push({ num: Number(sm[1]), index: sm.index });
  }

  // No section markers (older page format): fall back to positional parsing.
  if (markers.length === 0) {
    return extractFootballBoxes(sliced)
      .map((fields, idx) =>
        toMatchDoc(fields, {
          groupKey: letter,
          matchday: Math.floor(idx / 2) + 1,
          stage: "GROUP_STAGE",
          stageLabel: "Fase de Grupos",
          externalId: `G${letter}${idx + 1}`,
        }),
      )
      .filter((d): d is MatchDoc => d != null);
  }

  const out: MatchDoc[] = [];
  for (let i = 0; i < markers.length; i++) {
    const { num, index } = markers[i];
    const segment = sliced.slice(index, markers[i + 1]?.index ?? sliced.length);

    let fields = extractFootballBoxes(segment)[0] ?? null;
    if (!fields) {
      // Match transcluded from its own article: {{#lst:Some Article|F4}}.
      const lst = /\{\{\s*#lst:\s*([^|}]+)\|/.exec(segment);
      if (lst) {
        try {
          const subWt = await fetchWikitext(lst[1].trim());
          fields = extractFootballBoxes(subWt)[0] ?? null;
        } catch {
          // Sub-article unavailable: skip. applyProviderResults preserves any
          // existing doc for this id (and never downgrades a finished result).
        }
      }
    }
    if (!fields) continue;

    const doc = toMatchDoc(fields, {
      groupKey: letter,
      matchday: Math.ceil(num / 2),
      stage: "GROUP_STAGE",
      stageLabel: "Fase de Grupos",
      externalId: `G${letter}${num}`,
    });
    if (doc) out.push(doc);
  }
  return out;
}

async function parseKnockoutPage(): Promise<MatchDoc[]> {
  const wt = await fetchWikitext("2026_FIFA_World_Cup_knockout_stage");
  const sectionRe = /^==\s*([^=]+?)\s*==\s*$/gm;
  const sections: Array<{ label: string; start: number }> = [];
  let sm: RegExpExecArray | null;
  while ((sm = sectionRe.exec(wt)) !== null) {
    sections.push({ label: sm[1].trim(), start: sm.index });
  }
  // Each transcluded sub-article (e.g. "2026 FIFA World Cup round of 32") is
  // fetched at most once even though it holds many matches.
  const subCache = new Map<string, Promise<string>>();
  const getSub = (page: string) => {
    let p = subCache.get(page);
    if (!p) {
      p = fetchWikitext(page);
      subCache.set(page, p);
    }
    return p;
  };

  const out: MatchDoc[] = [];
  for (let i = 0; i < sections.length; i++) {
    const { label, start } = sections[i];
    const cfg = KNOCKOUT_STAGES[label];
    if (!cfg) continue;
    const end = sections[i + 1]?.start ?? wt.length;
    const segment = wt.slice(start, end);

    // A round's matches are either inline ({{#invoke:football box}}) or, once
    // the teams are known, transcluded from a shared sub-article via
    // {{#lst:Article|Label}} — which is how the Round of 32 is laid out. Resolve
    // each lst ref by slicing its labelled <section>…</section> out of the
    // sub-article and reading the box inside. Index by the ref's position so a
    // single unresolvable match doesn't renumber the others.
    const lstRe = /\{\{\s*#lst:\s*([^|}]+?)\s*\|\s*([^}]+?)\s*\}\}/g;
    const lstRefs: Array<{ page: string; lbl: string }> = [];
    let lm: RegExpExecArray | null;
    while ((lm = lstRe.exec(segment)) !== null) {
      lstRefs.push({ page: lm[1].trim(), lbl: lm[2].trim() });
    }

    const entries: Array<{ fields: Record<string, string>; idx: number }> = [];
    if (lstRefs.length > 0) {
      for (let r = 0; r < lstRefs.length; r++) {
        try {
          const subWt = await getSub(lstRefs[r].page);
          const region = sliceLabeledSection(subWt, lstRefs[r].lbl);
          const fields = region ? extractFootballBoxes(region)[0] : null;
          if (fields) entries.push({ fields, idx: r });
        } catch {
          // Sub-article unavailable: skip. applyProviderResults preserves any
          // existing doc for this id (and never downgrades a finished result).
        }
      }
    } else {
      extractFootballBoxes(segment).forEach((fields, idx) =>
        entries.push({ fields, idx }),
      );
    }

    for (const { fields, idx } of entries) {
      const doc = toMatchDoc(fields, {
        stage: cfg.stage,
        stageLabel: cfg.stageLabel,
        externalId: `${cfg.stage}-${idx + 1}`,
      });
      if (doc) out.push(doc);
    }
  }
  return out;
}

async function parseFinalPage(): Promise<MatchDoc[]> {
  try {
    const wt = await fetchWikitext("2026_FIFA_World_Cup_final");
    const boxes = extractFootballBoxes(wt);
    return boxes
      .map((fields, idx) =>
        toMatchDoc(fields, {
          stage: "FINAL",
          stageLabel: "Final",
          externalId: `FINAL-${idx + 1}`,
        }),
      )
      .filter((d): d is MatchDoc => d != null);
  } catch {
    return [];
  }
}

export async function fetchMatchesFromWikipedia(): Promise<MatchDoc[]> {
  const groupResults = await Promise.all(
    GROUP_KEYS.map((letter) => parseGroupPage(letter)),
  );
  const knockout = await parseKnockoutPage();
  const final = await parseFinalPage();
  return [...groupResults.flat(), ...knockout, ...final];
}
