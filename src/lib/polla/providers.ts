import { fetchMatchesFromWikipedia } from "./wikipedia";
import type { MatchDoc, MatchStage } from "./types";

const STAGE_LABELS: Record<MatchStage, string> = {
  GROUP_STAGE: "Fase de Grupos",
  ROUND_OF_32: "Dieciseisavos",
  ROUND_OF_16: "Octavos",
  QUARTER_FINALS: "Cuartos",
  SEMI_FINALS: "Semifinal",
  THIRD_PLACE: "Tercer puesto",
  FINAL: "Final",
};

function flagFromCode(code: string | undefined): string {
  if (!code) return "";
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

function mapFootballDataStage(stage: string): MatchStage {
  switch (stage) {
    case "GROUP_STAGE":
      return "GROUP_STAGE";
    case "LAST_16":
    case "ROUND_OF_16":
      return "ROUND_OF_16";
    case "QUARTER_FINALS":
      return "QUARTER_FINALS";
    case "SEMI_FINALS":
      return "SEMI_FINALS";
    case "THIRD_PLACE":
      return "THIRD_PLACE";
    case "FINAL":
      return "FINAL";
    default:
      return "GROUP_STAGE";
  }
}

function mapApiSportsStage(round: string): MatchStage {
  const r = round.toLowerCase();
  if (r.includes("group")) return "GROUP_STAGE";
  if (r.includes("32")) return "ROUND_OF_32";
  if (r.includes("16") || r.includes("eighth")) return "ROUND_OF_16";
  if (r.includes("quarter")) return "QUARTER_FINALS";
  if (r.includes("semi")) return "SEMI_FINALS";
  if (r.includes("3rd") || r.includes("third")) return "THIRD_PLACE";
  if (r.includes("final")) return "FINAL";
  return "GROUP_STAGE";
}

function mapStatus(input: string): MatchDoc["status"] {
  const s = input.toUpperCase();
  if (
    s === "FT" ||
    s === "AET" ||
    s === "PEN" ||
    s === "FINISHED"
  )
    return "FINISHED";
  if (
    s === "1H" ||
    s === "2H" ||
    s === "HT" ||
    s === "ET" ||
    s === "BT" ||
    s === "P" ||
    s === "LIVE" ||
    s === "IN_PLAY"
  )
    return "IN_PLAY";
  if (s === "PST" || s === "POSTPONED") return "POSTPONED";
  return "SCHEDULED";
}

export async function fetchFromApiSports(apiKey: string): Promise<MatchDoc[]> {
  const res = await fetch(
    "https://v3.football.api-sports.io/fixtures?league=1&season=2026",
    { headers: { "x-apisports-key": apiKey } },
  );
  if (!res.ok) {
    throw new Error(
      `api-sports.io responded ${res.status}: ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    errors?: Record<string, string> | unknown[];
    response?: Array<{
      fixture: {
        id: number;
        date: string;
        status: { short: string };
        venue?: { name?: string; city?: string };
      };
      league: { round: string };
      teams: {
        home: { id: number; name: string; logo: string };
        away: { id: number; name: string; logo: string };
      };
      goals: { home: number | null; away: number | null };
      score: {
        halftime: { home: number | null; away: number | null };
        fulltime: { home: number | null; away: number | null };
        penalty: { home: number | null; away: number | null };
      };
    }>;
  };
  if (
    json.errors &&
    !Array.isArray(json.errors) &&
    Object.keys(json.errors).length > 0
  ) {
    const msg = Object.entries(json.errors)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    throw new Error(`api-sports.io: ${msg}`);
  }
  return (json.response ?? []).map((f) => {
    const stage = mapApiSportsStage(f.league.round);
    const utc = new Date(f.fixture.date);
    return {
      _id: `api-${f.fixture.id}`,
      source: "api-sports",
      externalId: String(f.fixture.id),
      utcDate: utc.toISOString(),
      date: utc.toISOString().slice(0, 10),
      time: utc.toISOString().slice(11, 16),
      status: mapStatus(f.fixture.status.short),
      stage,
      stageLabel: STAGE_LABELS[stage],
      group: null,
      matchday: null,
      venue: f.fixture.venue?.name ?? "",
      city: f.fixture.venue?.city ?? "",
      home: {
        code: "",
        name: f.teams.home.name,
        crest: f.teams.home.logo,
      },
      away: {
        code: "",
        name: f.teams.away.name,
        crest: f.teams.away.logo,
      },
      score:
        f.goals.home != null && f.goals.away != null
          ? {
              fullTime:
                f.score.fulltime.home != null && f.score.fulltime.away != null
                  ? {
                      home: f.score.fulltime.home,
                      away: f.score.fulltime.away,
                    }
                  : { home: f.goals.home, away: f.goals.away },
              halfTime:
                f.score.halftime.home != null && f.score.halftime.away != null
                  ? {
                      home: f.score.halftime.home,
                      away: f.score.halftime.away,
                    }
                  : null,
              penalties:
                f.score.penalty.home != null && f.score.penalty.away != null
                  ? {
                      home: f.score.penalty.home,
                      away: f.score.penalty.away,
                    }
                  : null,
            }
          : null,
    };
  });
}

export async function fetchFromFootballData(
  apiKey: string,
): Promise<MatchDoc[]> {
  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches",
    { headers: { "X-Auth-Token": apiKey } },
  );
  if (!res.ok) {
    throw new Error(
      `football-data.org responded ${res.status}: ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    matches?: Array<{
      id: number;
      utcDate: string;
      status: string;
      stage: string;
      group: string | null;
      matchday: number | null;
      venue: string;
      homeTeam: { name: string; tla: string; crest: string };
      awayTeam: { name: string; tla: string; crest: string };
      score?: {
        fullTime: { home: number | null; away: number | null };
        halfTime: { home: number | null; away: number | null };
        penalties?: { home: number | null; away: number | null };
      };
    }>;
  };
  return (json.matches ?? []).map((m) => {
    const utc = new Date(m.utcDate);
    const stage = mapFootballDataStage(m.stage);
    return {
      _id: `fd-${m.id}`,
      source: "football-data",
      externalId: String(m.id),
      utcDate: m.utcDate,
      date: utc.toISOString().slice(0, 10),
      time: utc.toISOString().slice(11, 16),
      status: mapStatus(m.status),
      stage,
      stageLabel: STAGE_LABELS[stage],
      group: m.group ? m.group.replace(/^GROUP_/, "") : null,
      matchday: m.matchday,
      venue: m.venue ?? "",
      city: "",
      home: {
        code: (m.homeTeam.tla ?? "").toLowerCase(),
        name: m.homeTeam.name,
        crest: m.homeTeam.crest || flagFromCode(m.homeTeam.tla),
      },
      away: {
        code: (m.awayTeam.tla ?? "").toLowerCase(),
        name: m.awayTeam.name,
        crest: m.awayTeam.crest || flagFromCode(m.awayTeam.tla),
      },
      score: m.score
        ? {
            fullTime:
              m.score.fullTime.home != null && m.score.fullTime.away != null
                ? {
                    home: m.score.fullTime.home,
                    away: m.score.fullTime.away,
                  }
                : null,
            halfTime:
              m.score.halfTime.home != null && m.score.halfTime.away != null
                ? {
                    home: m.score.halfTime.home,
                    away: m.score.halfTime.away,
                  }
                : null,
            penalties:
              m.score.penalties &&
              m.score.penalties.home != null &&
              m.score.penalties.away != null
                ? {
                    home: m.score.penalties.home,
                    away: m.score.penalties.away,
                  }
                : null,
          }
        : null,
    };
  });
}

export type ProviderResult = {
  source: "api-sports" | "football-data" | "wikipedia";
  docs: MatchDoc[];
};

export async function fetchLatestFromConfiguredProvider(): Promise<ProviderResult> {
  const apiSports = process.env.API_FOOTBALL_KEY;
  if (apiSports) {
    try {
      const docs = await fetchFromApiSports(apiSports);
      if (docs.length > 0) return { source: "api-sports", docs };
    } catch (err) {
      console.warn("api-sports failed, falling back:", err);
    }
  }
  const fd = process.env.FOOTBALL_DATA_API_KEY;
  if (fd) {
    try {
      const docs = await fetchFromFootballData(fd);
      if (docs.length > 0) return { source: "football-data", docs };
    } catch (err) {
      console.warn("football-data failed, falling back:", err);
    }
  }
  const docs = await fetchMatchesFromWikipedia();
  return { source: "wikipedia", docs };
}
