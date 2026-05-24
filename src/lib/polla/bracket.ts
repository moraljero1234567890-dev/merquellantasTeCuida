import type {
  GroupScore,
  KnockoutPick,
  MatchDoc,
  PredictionDoc,
} from "./types";

export type StandingRow = {
  teamCode: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  group: string;
};

export function computeGroupStandings(
  groupMatches: MatchDoc[],
  predictedScores: Record<string, GroupScore>,
): Record<string, StandingRow[]> {
  const byGroup: Record<string, MatchDoc[]> = {};
  for (const m of groupMatches) {
    if (!m.group) continue;
    (byGroup[m.group] ??= []).push(m);
  }

  const result: Record<string, StandingRow[]> = {};
  for (const [group, matches] of Object.entries(byGroup)) {
    const rows: Record<string, StandingRow> = {};
    const ensure = (code: string, name: string): StandingRow => {
      return (rows[code] ??= {
        teamCode: code,
        teamName: name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
        group,
      });
    };

    for (const m of matches) {
      const score = predictedScores[m._id];
      if (
        !score ||
        typeof score.home !== "number" ||
        typeof score.away !== "number"
      )
        continue;
      const home = ensure(m.home.code, m.home.name);
      const away = ensure(m.away.code, m.away.name);
      home.played++;
      away.played++;
      home.gf += score.home;
      home.ga += score.away;
      away.gf += score.away;
      away.ga += score.home;
      if (score.home > score.away) {
        home.won++;
        away.lost++;
        home.points += 3;
      } else if (score.home < score.away) {
        away.won++;
        home.lost++;
        away.points += 3;
      } else {
        home.drawn++;
        away.drawn++;
        home.points += 1;
        away.points += 1;
      }
    }
    for (const r of Object.values(rows)) r.gd = r.gf - r.ga;

    const list = Object.values(rows).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamName.localeCompare(b.teamName);
    });

    result[group] = list;
  }
  return result;
}

export function isGroupStageComplete(
  groupMatches: MatchDoc[],
  predictedScores: Record<string, GroupScore>,
): boolean {
  return groupMatches.every((m) => {
    const s = predictedScores[m._id];
    return s && typeof s.home === "number" && typeof s.away === "number";
  });
}

const R32_TEMPLATE: Array<
  | { home: { kind: "W" | "R"; group: string }; away: { kind: "W" | "R"; group: string } }
  | { home: { kind: "W"; group: string }; away: { kind: "T"; rank: number } }
> = [
  { home: { kind: "W", group: "A" }, away: { kind: "T", rank: 1 } },
  { home: { kind: "W", group: "B" }, away: { kind: "T", rank: 2 } },
  { home: { kind: "W", group: "C" }, away: { kind: "T", rank: 3 } },
  { home: { kind: "W", group: "D" }, away: { kind: "T", rank: 4 } },
  { home: { kind: "W", group: "E" }, away: { kind: "T", rank: 5 } },
  { home: { kind: "W", group: "F" }, away: { kind: "T", rank: 6 } },
  { home: { kind: "W", group: "G" }, away: { kind: "T", rank: 7 } },
  { home: { kind: "W", group: "H" }, away: { kind: "T", rank: 8 } },
  { home: { kind: "W", group: "I" }, away: { kind: "R", group: "L" } },
  { home: { kind: "W", group: "J" }, away: { kind: "R", group: "K" } },
  { home: { kind: "W", group: "K" }, away: { kind: "R", group: "J" } },
  { home: { kind: "W", group: "L" }, away: { kind: "R", group: "I" } },
  { home: { kind: "R", group: "A" }, away: { kind: "R", group: "D" } },
  { home: { kind: "R", group: "B" }, away: { kind: "R", group: "E" } },
  { home: { kind: "R", group: "C" }, away: { kind: "R", group: "F" } },
  { home: { kind: "R", group: "G" }, away: { kind: "R", group: "H" } },
];

function topThirdPlaced(
  standings: Record<string, StandingRow[]>,
): StandingRow[] {
  const all = Object.values(standings)
    .map((rows) => rows[2])
    .filter((r): r is StandingRow => Boolean(r));
  return all
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamName.localeCompare(b.teamName);
    })
    .slice(0, 8);
}

export type R32SeedTeam = { code: string; name: string } | null;

export function buildR32Seeds(
  standings: Record<string, StandingRow[]>,
): Array<{ home: R32SeedTeam; away: R32SeedTeam }> {
  const thirds = topThirdPlaced(standings);
  const pick = (slot: { kind: "W" | "R" | "T"; group?: string; rank?: number }): R32SeedTeam => {
    if (slot.kind === "T") {
      const row = thirds[(slot.rank ?? 1) - 1];
      return row ? { code: row.teamCode, name: row.teamName } : null;
    }
    const rows = standings[slot.group!];
    if (!rows) return null;
    const idx = slot.kind === "W" ? 0 : 1;
    const row = rows[idx];
    return row ? { code: row.teamCode, name: row.teamName } : null;
  };
  return R32_TEMPLATE.map((t) => ({
    home: pick(t.home),
    away: pick(t.away),
  }));
}

function emptyPick(
  matchId: string,
  stage: KnockoutPick["stage"],
  home: R32SeedTeam,
  away: R32SeedTeam,
): KnockoutPick {
  return {
    matchId,
    stage,
    homeTeamCode: home?.code ?? "",
    homeTeamName: home?.name ?? "",
    awayTeamCode: away?.code ?? "",
    awayTeamName: away?.name ?? "",
    home: null,
    away: null,
    penaltyWinner: null,
  };
}

function winnerOf(pick: KnockoutPick): R32SeedTeam {
  if (pick.home == null || pick.away == null) return null;
  if (pick.home > pick.away)
    return { code: pick.homeTeamCode, name: pick.homeTeamName };
  if (pick.away > pick.home)
    return { code: pick.awayTeamCode, name: pick.awayTeamName };
  if (pick.penaltyWinner === "home")
    return { code: pick.homeTeamCode, name: pick.homeTeamName };
  if (pick.penaltyWinner === "away")
    return { code: pick.awayTeamCode, name: pick.awayTeamName };
  return null;
}

function loserOf(pick: KnockoutPick): R32SeedTeam {
  if (pick.home == null || pick.away == null) return null;
  if (pick.home > pick.away)
    return { code: pick.awayTeamCode, name: pick.awayTeamName };
  if (pick.away > pick.home)
    return { code: pick.homeTeamCode, name: pick.homeTeamName };
  if (pick.penaltyWinner === "home")
    return { code: pick.awayTeamCode, name: pick.awayTeamName };
  if (pick.penaltyWinner === "away")
    return { code: pick.homeTeamCode, name: pick.homeTeamName };
  return null;
}

export function buildKnockoutFromGroup(
  standings: Record<string, StandingRow[]>,
  existing?: PredictionDoc["knockout"],
): PredictionDoc["knockout"] {
  const r32Seeds = buildR32Seeds(standings);
  const r32: KnockoutPick[] = r32Seeds.map((seed, i) => {
    const id = `R32-${i + 1}`;
    const prev = existing?.r32?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "ROUND_OF_32", seed.home, seed.away);
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      return { ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner };
    }
    return fresh;
  });

  const r16: KnockoutPick[] = [];
  for (let i = 0; i < 8; i++) {
    const winA = winnerOf(r32[i * 2]);
    const winB = winnerOf(r32[i * 2 + 1]);
    const id = `R16-${i + 1}`;
    const prev = existing?.r16?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "ROUND_OF_16", winA, winB);
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      r16.push({ ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner });
    } else {
      r16.push(fresh);
    }
  }

  const qf: KnockoutPick[] = [];
  for (let i = 0; i < 4; i++) {
    const winA = winnerOf(r16[i * 2]);
    const winB = winnerOf(r16[i * 2 + 1]);
    const id = `QF-${i + 1}`;
    const prev = existing?.qf?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "QUARTER_FINALS", winA, winB);
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      qf.push({ ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner });
    } else {
      qf.push(fresh);
    }
  }

  const sf: KnockoutPick[] = [];
  for (let i = 0; i < 2; i++) {
    const winA = winnerOf(qf[i * 2]);
    const winB = winnerOf(qf[i * 2 + 1]);
    const id = `SF-${i + 1}`;
    const prev = existing?.sf?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "SEMI_FINALS", winA, winB);
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      sf.push({ ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner });
    } else {
      sf.push(fresh);
    }
  }

  const sfLoserA = loserOf(sf[0]);
  const sfLoserB = loserOf(sf[1]);
  const thirdFresh = emptyPick("THIRD-1", "THIRD_PLACE", sfLoserA, sfLoserB);
  const thirdPrev = existing?.third;
  const third: KnockoutPick =
    thirdPrev &&
    thirdPrev.homeTeamCode === thirdFresh.homeTeamCode &&
    thirdPrev.awayTeamCode === thirdFresh.awayTeamCode
      ? { ...thirdFresh, home: thirdPrev.home, away: thirdPrev.away, penaltyWinner: thirdPrev.penaltyWinner }
      : thirdFresh;

  const sfWinA = winnerOf(sf[0]);
  const sfWinB = winnerOf(sf[1]);
  const finalFresh = emptyPick("FINAL-1", "FINAL", sfWinA, sfWinB);
  const finalPrev = existing?.final;
  const final: KnockoutPick =
    finalPrev &&
    finalPrev.homeTeamCode === finalFresh.homeTeamCode &&
    finalPrev.awayTeamCode === finalFresh.awayTeamCode
      ? { ...finalFresh, home: finalPrev.home, away: finalPrev.away, penaltyWinner: finalPrev.penaltyWinner }
      : finalFresh;

  return { r32, r16, qf, sf, third, final };
}

export function championFromFinal(
  final: KnockoutPick | null,
): { code: string; name: string } | null {
  if (!final) return null;
  const winner = winnerOf(final);
  return winner;
}
