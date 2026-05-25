import "server-only";
import type { KnockoutPick, MatchDoc, PredictionDoc } from "./types";

export const POINTS = {
  GROUP_OUTCOME: 30,
  GROUP_EXACT: 50,
  GROUP_GOAL_DIFF: 20,
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
    runnerUp: number;
    champion: number;
    points: number;
  };
  total: number;
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

function outcome(home: number, away: number): "H" | "A" | "D" {
  if (home > away) return "H";
  if (away > home) return "A";
  return "D";
}

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
  r16: Set<string>;
  qf: Set<string>;
  sf: Set<string>;
  champion: string | null;
  runnerUp: string | null;
} {
  const r16 = new Set<string>();
  const qf = new Set<string>();
  const sf = new Set<string>();
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
      case "ROUND_OF_16":
        r16.add(winnerCode);
        break;
      case "QUARTER_FINALS":
        qf.add(winnerCode);
        break;
      case "SEMI_FINALS":
        sf.add(winnerCode);
        break;
      case "FINAL":
        champion = winnerCode;
        runnerUp = loserCode;
        break;
      default:
        break;
    }
  }

  return { r16, qf, sf, champion, runnerUp };
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
    knockout: { runnerUp: 0, champion: 0, points: 0 },
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
      if (pick.home === m.home && pick.away === m.away) {
        br.group.exact += 1;
        br.group.points += POINTS.GROUP_EXACT;
      } else if (outcome(pick.home, pick.away) === outcome(m.home, m.away)) {
        if ((pick.home - pick.away) === (m.home - m.away)) {
          br.group.goalDiff += 1;
          br.group.points += POINTS.GROUP_GOAL_DIFF;
        } else {
          br.group.outcomes += 1;
          br.group.points += POINTS.GROUP_OUTCOME;
        }
      } else if ((pick.home - pick.away) === (m.home - m.away)) {
        br.group.goalDiff += 1;
        br.group.points += POINTS.GROUP_GOAL_DIFF;
      }
    }

    const gotChampion = knockReal.champion && p.champion?.code === knockReal.champion;
    let gotRunnerUp = false;
    if (knockReal.runnerUp && p.knockout.final) {
      const finalPick = p.knockout.final;
      const winner = pickedWinnerCode(finalPick);
      const loser =
        winner === finalPick.homeTeamCode
          ? finalPick.awayTeamCode
          : winner === finalPick.awayTeamCode
            ? finalPick.homeTeamCode
            : null;
      if (loser && loser === knockReal.runnerUp) {
        gotRunnerUp = true;
      }
    }

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

  rows.sort((a, b) => {
    if (b.breakdown.total !== a.breakdown.total) {
      return b.breakdown.total - a.breakdown.total;
    }
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.attempt - b.attempt;
  });

  return rows;
}
