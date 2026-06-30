import "server-only";
import type { KnockoutPick, MatchDoc, PredictionDoc } from "./types";
import { groupMatchResult } from "./group-points";

export const POINTS = {
  GROUP_OUTCOME: 30,
  GROUP_EXACT: 50,
  GROUP_GOAL_DIFF: 20,
  KO_R32: 25,
  KO_R16: 50,
  KO_QF: 75,
  KO_SF: 100,
  KO_THIRD: 50,
  CHAMPION: 300,
  RUNNER_UP: 250,
  CHAMPION_AND_RUNNER_UP: 350,
} as const;

export type ScoreBreakdown = {
  group: {
    outcomes: number;
    exact: number;
    goalDiff: number;
    points: number;
  };
  knockout: {
    r32: number;
    r16: number;
    qf: number;
    sf: number;
    third: number;
    runnerUp: number;
    champion: number;
    points: number;
  };
  bonus: number;
  total: number;
};

// Live point mirror for specific users: their non-source attempts inherit
// (source attempt's total + offset) as a bonus ON TOP of their own earned
// points, recomputed every time the leaderboard is built. Set up for
// tiremaster22 (Angel Gomez), whose unfilled attempts mirror his filled
// attempt 1 minus 100.
const POINT_MIRROR: Record<string, { sourceAttempt: number; offset: number }> = {
  "tiremaster22@aol.com": { sourceAttempt: 1, offset: -100 },
};

export type LeaderboardRow = {
  email: string;
  name: string;
  attempt: number;
  attemptsAllowed: number;
  totalAttempts: number;
  breakdown: ScoreBreakdown;
};

type FinishedGroupMatch = {
  id: string;
  home: number;
  away: number;
};

function finishedGroupMatches(matches: MatchDoc[]): FinishedGroupMatch[] {
  const out: FinishedGroupMatch[] = [];
  for (const m of matches) {
    if (m.stage !== "GROUP_STAGE") continue;
    if (m.status !== "FINISHED") continue;
    const ft = m.score?.fullTime;
    if (!ft) continue;
    out.push({ id: m._id, home: ft.home, away: ft.away });
  }
  return out;
}

function knockoutWinnersByStage(matches: MatchDoc[]): {
  r32: Set<string>;
  r16: Set<string>;
  qf: Set<string>;
  sf: Set<string>;
  third: string | null;
  champion: string | null;
  runnerUp: string | null;
} {
  const r32 = new Set<string>();
  const r16 = new Set<string>();
  const qf = new Set<string>();
  const sf = new Set<string>();
  let third: string | null = null;
  let champion: string | null = null;
  let runnerUp: string | null = null;

  for (const m of matches) {
    if (m.status !== "FINISHED") continue;
    const ft = m.score?.fullTime;
    const pens = m.score?.penalties;
    if (!ft) continue;
    let winnerCode: string | null = null;
    if (ft.home > ft.away) winnerCode = m.home.code;
    else if (ft.away > ft.home) winnerCode = m.away.code;
    else if (pens) {
      if (pens.home > pens.away) winnerCode = m.home.code;
      else if (pens.away > pens.home) winnerCode = m.away.code;
    }
    if (!winnerCode) continue;
    const loserCode = winnerCode === m.home.code ? m.away.code : m.home.code;

    switch (m.stage) {
      case "ROUND_OF_32":
        r32.add(winnerCode);
        break;
      case "ROUND_OF_16":
        r16.add(winnerCode);
        break;
      case "QUARTER_FINALS":
        qf.add(winnerCode);
        break;
      case "SEMI_FINALS":
        sf.add(winnerCode);
        break;
      case "THIRD_PLACE":
        third = winnerCode;
        break;
      case "FINAL":
        champion = winnerCode;
        runnerUp = loserCode;
        break;
      default:
        break;
    }
  }

  return { r32, r16, qf, sf, third, champion, runnerUp };
}

function pickedWinnerCode(p: KnockoutPick): string | null {
  if (p.home == null || p.away == null) return null;
  if (p.home > p.away) return p.homeTeamCode;
  if (p.away > p.home) return p.awayTeamCode;
  if (p.penaltyWinner === "home") return p.homeTeamCode;
  if (p.penaltyWinner === "away") return p.awayTeamCode;
  return null;
}

function emptyBreakdown(): ScoreBreakdown {
  return {
    group: { outcomes: 0, exact: 0, goalDiff: 0, points: 0 },
    knockout: { r32: 0, r16: 0, qf: 0, sf: 0, third: 0, runnerUp: 0, champion: 0, points: 0 },
    bonus: 0,
    total: 0,
  };
}

export function computeLeaderboard(
  matches: MatchDoc[],
  predictions: PredictionDoc[],
  users: { email: string; name: string; attemptsAllowed: number }[],
): LeaderboardRow[] {
  const groupReal = finishedGroupMatches(matches);
  const realResultById = new Map<string, { home: number; away: number }>();
  for (const m of groupReal) realResultById.set(m.id, { home: m.home, away: m.away });

  const knockReal = knockoutWinnersByStage(matches);

  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const totalAttemptsByEmail = new Map<string, number>();
  for (const p of predictions) {
    totalAttemptsByEmail.set(
      p.userEmail,
      (totalAttemptsByEmail.get(p.userEmail) ?? 0) + 1,
    );
  }

  const rows: LeaderboardRow[] = [];
  for (const p of predictions) {
    const user = userByEmail.get(p.userEmail);
    if (!user) continue;
    const br = emptyBreakdown();

    for (const m of groupReal) {
      const pick = p.groupScores[m.id];
      if (!pick) continue;
      // Shared with the results comparison page so points never drift. The
      // breakdown buckets stay mutually exclusive for a readable summary while
      // `points` already accumulates every tier earned (exact=100, goal
      // diff=50, outcome=30).
      const { tier, points } = groupMatchResult(pick, {
        home: m.home,
        away: m.away,
      });
      if (tier === "exact") br.group.exact += 1;
      else if (tier === "goalDiff") br.group.goalDiff += 1;
      else if (tier === "outcome") br.group.outcomes += 1;
      br.group.points += points;
    }

    // Per-round knockout scoring: award points for each team the user correctly
    // predicted to advance from that round. userPredictedWinner is captured before
    // applyActual overwrites the pick scores, so it always reflects the user's
    // original prediction even for already-finished matches.
    const allKnockoutPicks = [
      ...p.knockout.r32,
      ...p.knockout.r16,
      ...p.knockout.qf,
      ...p.knockout.sf,
      ...(p.knockout.third ? [p.knockout.third] : []),
    ];
    for (const pick of allKnockoutPicks) {
      // Prefer the captured userPredictedWinner; fall back to live pick scores
      // for matches not yet overwritten (i.e. not yet finished).
      const upw =
        pick.userPredictedWinner !== undefined
          ? pick.userPredictedWinner
          : pickedWinnerCode(pick);
      if (!upw) continue;
      switch (pick.stage) {
        case "ROUND_OF_32":
          if (knockReal.r32.has(upw)) { br.knockout.r32 += 1; br.knockout.points += POINTS.KO_R32; }
          break;
        case "ROUND_OF_16":
          if (knockReal.r16.has(upw)) { br.knockout.r16 += 1; br.knockout.points += POINTS.KO_R16; }
          break;
        case "QUARTER_FINALS":
          if (knockReal.qf.has(upw)) { br.knockout.qf += 1; br.knockout.points += POINTS.KO_QF; }
          break;
        case "SEMI_FINALS":
          if (knockReal.sf.has(upw)) { br.knockout.sf += 1; br.knockout.points += POINTS.KO_SF; }
          break;
        case "THIRD_PLACE":
          if (knockReal.third && upw === knockReal.third) { br.knockout.third += 1; br.knockout.points += POINTS.KO_THIRD; }
          break;
      }
    }

    // Champion / runner-up: use userPredictedWinner on the final pick so scoring
    // stays correct after the final is played and applyActual overwrites the scores.
    const finalPick = p.knockout.final;
    const myChampion =
      finalPick
        ? finalPick.userPredictedWinner !== undefined
          ? finalPick.userPredictedWinner
          : pickedWinnerCode(finalPick)
        : null;
    const myRunnerUp =
      myChampion && finalPick
        ? myChampion === finalPick.homeTeamCode
          ? finalPick.awayTeamCode
          : myChampion === finalPick.awayTeamCode
            ? finalPick.homeTeamCode
            : null
        : null;

    const gotChampion = !!knockReal.champion && myChampion === knockReal.champion;
    const gotRunnerUp = !!knockReal.runnerUp && !!myRunnerUp && myRunnerUp === knockReal.runnerUp;

    if (gotChampion && gotRunnerUp) {
      br.knockout.champion = 1;
      br.knockout.runnerUp = 1;
      br.knockout.points += POINTS.CHAMPION_AND_RUNNER_UP;
    } else if (gotChampion) {
      br.knockout.champion = 1;
      br.knockout.points += POINTS.CHAMPION;
    } else if (gotRunnerUp) {
      br.knockout.runnerUp = 1;
      br.knockout.points += POINTS.RUNNER_UP;
    }

    br.total = br.group.points + br.knockout.points;
    rows.push({
      email: user.email,
      name: user.name,
      attempt: p.attempt,
      attemptsAllowed: user.attemptsAllowed,
      totalAttempts: totalAttemptsByEmail.get(p.userEmail) ?? 0,
      breakdown: br,
    });
  }

  // Apply live point mirrors: a configured user's non-source attempts get
  // (source attempt total + offset) added on top of whatever they earned.
  for (const [email, cfg] of Object.entries(POINT_MIRROR)) {
    const userRows = rows.filter((r) => r.email === email);
    const source = userRows.find((r) => r.attempt === cfg.sourceAttempt);
    if (!source) continue;
    const bonus = Math.max(0, source.breakdown.total + cfg.offset);
    for (const r of userRows) {
      if (r.attempt === cfg.sourceAttempt) continue;
      r.breakdown.bonus = bonus;
      r.breakdown.total += bonus;
    }
  }

  rows.sort((a, b) => {
    if (b.breakdown.total !== a.breakdown.total) {
      return b.breakdown.total - a.breakdown.total;
    }
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.attempt - b.attempt;
  });

  return rows;
}
