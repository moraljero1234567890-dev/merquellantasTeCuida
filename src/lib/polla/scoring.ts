import "server-only";
import type { KnockoutPick, MatchDoc, PredictionDoc } from "./types";

export const POINTS = {
  GROUP_OUTCOME: 10,
  GROUP_EXACT: 20,
  GROUP_UNIQUE_EXACT: 40,
  R16_WINNER: 20,
  QF_WINNER: 30,
  SF_WINNER: 40,
  RUNNER_UP: 50,
  CHAMPION: 60,
} as const;

export type ScoreBreakdown = {
  group: {
    outcomes: number;
    exact: number;
    uniqueExact: number;
    points: number;
  };
  knockout: {
    r16: number;
    qf: number;
    sf: number;
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
    group: { outcomes: 0, exact: 0, uniqueExact: 0, points: 0 },
    knockout: { r16: 0, qf: 0, sf: 0, runnerUp: 0, champion: 0, points: 0 },
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

  const exactHits = new Map<string, string[]>();
  for (const p of predictions) {
    for (const m of groupReal) {
      const pick = p.groupScores[m.id];
      if (!pick) continue;
      if (pick.home === m.home && pick.away === m.away) {
        const arr = exactHits.get(m.id) ?? [];
        arr.push(p._id);
        exactHits.set(m.id, arr);
      }
    }
  }

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
        const hits = exactHits.get(m.id) ?? [];
        if (hits.length === 1 && hits[0] === p._id) {
          br.group.uniqueExact += 1;
          br.group.points += POINTS.GROUP_UNIQUE_EXACT;
        } else {
          br.group.exact += 1;
          br.group.points += POINTS.GROUP_EXACT;
        }
      } else if (outcome(pick.home, pick.away) === outcome(m.home, m.away)) {
        br.group.outcomes += 1;
        br.group.points += POINTS.GROUP_OUTCOME;
      }
    }

    for (const pick of p.knockout.r16) {
      const w = pickedWinnerCode(pick);
      if (w && knockReal.r16.has(w)) {
        br.knockout.r16 += 1;
        br.knockout.points += POINTS.R16_WINNER;
      }
    }
    for (const pick of p.knockout.qf) {
      const w = pickedWinnerCode(pick);
      if (w && knockReal.qf.has(w)) {
        br.knockout.qf += 1;
        br.knockout.points += POINTS.QF_WINNER;
      }
    }
    for (const pick of p.knockout.sf) {
      const w = pickedWinnerCode(pick);
      if (w && knockReal.sf.has(w)) {
        br.knockout.sf += 1;
        br.knockout.points += POINTS.SF_WINNER;
      }
    }

    if (knockReal.champion && p.champion?.code === knockReal.champion) {
      br.knockout.champion = 1;
      br.knockout.points += POINTS.CHAMPION;
    }
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
        br.knockout.runnerUp = 1;
        br.knockout.points += POINTS.RUNNER_UP;
      }
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
