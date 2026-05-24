import { matches as staticMatches, flagSrc } from "@/data/polla/worldcup2026";
import type { MatchDoc } from "./types";

export function buildMatchSeed(): MatchDoc[] {
  return staticMatches.map((m) => {
    const utcDate = `${m.date}T${m.time}:00Z`;
    return {
      _id: m.id,
      source: "dummy",
      utcDate,
      date: m.date,
      time: m.time,
      status: "SCHEDULED",
      stage: "GROUP_STAGE",
      stageLabel: "Fase de Grupos",
      group: m.group,
      matchday: m.matchday,
      venue: m.venue,
      city: m.city,
      home: { code: m.home.code, name: m.home.name, crest: flagSrc(m.home.code, 80) },
      away: { code: m.away.code, name: m.away.name, crest: flagSrc(m.away.code, 80) },
      score: null,
    };
  });
}
