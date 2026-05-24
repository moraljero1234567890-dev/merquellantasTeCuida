import { matches as staticMatches, flagSrc } from "@/data/polla/worldcup2026";

export type ApiMatch = {
  _id: string;
  date: string;
  time: string;
  venue: string;
  city?: string;
  group: string | null;
  matchday: number | null;
  stage: string;
  stageLabel: string;
  status?: string;
  home: { code: string; name: string; crest: string };
  away: { code: string; name: string; crest: string };
};

export function staticFallback(): ApiMatch[] {
  return staticMatches.map((m) => ({
    _id: m.id,
    date: m.date,
    time: m.time,
    venue: m.venue,
    city: m.city,
    group: m.group,
    matchday: m.matchday,
    stage: "GROUP_STAGE",
    stageLabel: "Fase de Grupos",
    home: { code: m.home.code, name: m.home.name, crest: flagSrc(m.home.code, 80) },
    away: { code: m.away.code, name: m.away.name, crest: flagSrc(m.away.code, 80) },
  }));
}
