import "server-only";
import type { GroupScore, KnockoutPick, MatchDoc, PredictionDoc } from "./types";
import { groupMatchResult } from "./group-points";
import { buildKnockoutFromGroup, buildR32SeedsFromActual, computeGroupStandings } from "./bracket";

export const POINTS = {
  GROUP_OUTCOME: 30,
  GROUP_EXACT: 50,
  GROUP_GOAL_DIFF: 20,
  // Flat knockout per-match scoring: exact FT score = 100, correct winner/draw = 50, wrong = 0.
  // For ties: if real FT was a draw and user predicted a draw, penalty winner is irrelevant.
  KO_EXACT_WIN: 100,
  KO_WIN: 50,
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
    exact: number;    // picks with exact FT score (100 pts each)
    winner: number;   // picks with correct winner/draw only (50 pts each)
    runnerUp: number; // 0 or 1
    champion: number; // 0 or 1
    points: number;
  };
  bonus: number;
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

// Returns champion and runner-up from the Final. These are the only round-level
// outcomes still needed after the move to flat per-match scoring (100/50/0).
function knockoutFinalResult(matches: MatchDoc[]): {
  champion: string | null;
  runnerUp: string | null;
} {
  for (const m of matches) {
    if (m.stage !== "FINAL" || m.status !== "FINISHED") continue;
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
    return {
      champion: winnerCode,
      runnerUp: winnerCode === m.home.code ? m.away.code : m.home.code,
    };
  }
  return { champion: null, runnerUp: null };
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
    knockout: { exact: 0, winner: 0, runnerUp: 0, champion: 0, points: 0 },
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

  const knockReal = knockoutFinalResult(matches);

  // Map "STAGE|codeA|codeB" (sorted) → real FT score + which team was home, for
  // awarding exact-score and goal-difference bonuses on knockout picks.
  const realFTMap = new Map<string, { homeCode: string; ft: { home: number; away: number } }>();
  for (const m of matches) {
    if (m.stage === "GROUP_STAGE" || m.status !== "FINISHED") continue;
    const ft = m.score?.fullTime;
    if (!ft || !m.home?.code || !m.away?.code) continue;
    realFTMap.set(`${m.stage}|${[m.home.code, m.away.code].sort().join("|")}`, { homeCode: m.home.code, ft });
  }

  // Recompute knockout brackets from actual group standings so team codes in
  // stored predictions (which may have been built from the user's predicted
  // standings) always match the real fixtures. Without this, users who haven't
  // reloaded their bracket page since the group stage ended get 0 knockout pts
  // because their stored team codes never got updated.
  const groupMatchesList = matches.filter((m) => m.stage === "GROUP_STAGE" && m.group);
  const actualGroupScores: Record<string, GroupScore> = {};
  for (const m of matches) {
    if (m.stage === "GROUP_STAGE" && m.status === "FINISHED" && m.score?.fullTime) {
      actualGroupScores[m._id] = { home: m.score.fullTime.home, away: m.score.fullTime.away };
    }
  }
  const actualStandings = computeGroupStandings(groupMatchesList, actualGroupScores);

  const actualR32Fixtures = matches
    .filter((m) => m.stage === "ROUND_OF_32")
    .map((m) => ({ home: { code: m.home.code, name: m.home.name }, away: { code: m.away.code, name: m.away.name } }));
  const r32Override = buildR32SeedsFromActual(actualStandings, actualR32Fixtures) ?? undefined;

  // actualByPair: keyed by sorted team codes, for applyActual inside buildKnockoutFromGroup.
  const actualByPair = new Map<string, { winnerCode: string | null; byCode: Record<string, number> }>();
  for (const m of matches) {
    if (m.stage === "GROUP_STAGE" || m.status !== "FINISHED") continue;
    const ft = m.score?.fullTime;
    if (!ft || !m.home?.code || !m.away?.code) continue;
    const pens = m.score?.penalties;
    const winnerCode =
      ft.home > ft.away ? m.home.code
      : ft.away > ft.home ? m.away.code
      : pens && pens.home > pens.away ? m.home.code
      : pens && pens.away > pens.home ? m.away.code
      : null;
    actualByPair.set([m.home.code, m.away.code].sort().join("|"), {
      winnerCode,
      byCode: { [m.home.code]: ft.home, [m.away.code]: ft.away },
    });
  }
  // Infer winners from next-round fixtures when penalty data is missing.
  const NEXT_STAGE: Partial<Record<string, string>> = {
    ROUND_OF_32: "ROUND_OF_16", ROUND_OF_16: "QUARTER_FINALS",
    QUARTER_FINALS: "SEMI_FINALS", SEMI_FINALS: "FINAL",
  };
  const teamsPerStage = new Map<string, Set<string>>();
  for (const m of matches) {
    if (m.home?.code && m.away?.code) {
      const s = teamsPerStage.get(m.stage) ?? new Set<string>();
      s.add(m.home.code); s.add(m.away.code);
      teamsPerStage.set(m.stage, s);
    }
  }
  for (const [key, entry] of actualByPair) {
    if (entry.winnerCode !== null) continue;
    const codes = Object.keys(entry.byCode);
    if (codes.length !== 2) continue;
    const pairMatch = matches.find(
      (m) => m.status === "FINISHED" && m.home?.code && m.away?.code &&
        [m.home.code, m.away.code].sort().join("|") === key,
    );
    if (!pairMatch) continue;
    const nextStage = NEXT_STAGE[pairMatch.stage];
    if (!nextStage) continue;
    const nextTeams = teamsPerStage.get(nextStage) ?? new Set<string>();
    const [codeA, codeB] = codes;
    if (nextTeams.has(codeA) && !nextTeams.has(codeB)) entry.winnerCode = codeA;
    else if (nextTeams.has(codeB) && !nextTeams.has(codeA)) entry.winnerCode = codeB;
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
    // Flat 2000-pt group bonus for tiremaster22 attempts with no group entries.
    if (p.userEmail === "tiremaster22@aol.com" && Object.keys(p.groupScores ?? {}).length === 0) {
      br.group.points += 2000;
    }

    // Recompute this prediction's knockout bracket from actual standings so that
    // team codes match the real fixtures even for users who haven't reloaded
    // their bracket page since the group stage ended.
    const ko = buildKnockoutFromGroup(actualStandings, p.knockout, r32Override, actualByPair);

    // Flat knockout scoring: each pick earns 100 pts for an exact FT score,
    // 50 pts for the correct winner or a correctly predicted draw (FT tie),
    // or 0 pts. For draws: the penalty winner is irrelevant — only the FT
    // score matters. Applies to all rounds including the final.
    const allKnockoutPicks = [
      ...ko.r32,
      ...ko.r16,
      ...ko.qf,
      ...ko.sf,
      ...(ko.third ? [ko.third] : []),
      ...(ko.final ? [ko.final] : []),
    ];
    for (const pick of allKnockoutPicks) {
      if (!pick.homeTeamCode || !pick.awayTeamCode) continue;
      const key = `${pick.stage}|${[pick.homeTeamCode, pick.awayTeamCode].sort().join("|")}`;
      const entry = realFTMap.get(key);
      if (!entry) continue;

      const realHome = entry.homeCode === pick.homeTeamCode ? entry.ft.home : entry.ft.away;
      const realAway = entry.homeCode === pick.homeTeamCode ? entry.ft.away : entry.ft.home;
      const userHome = pick.userPredictedHome !== undefined ? pick.userPredictedHome : pick.home;
      const userAway = pick.userPredictedAway !== undefined ? pick.userPredictedAway : pick.away;
      const hasScore = userHome != null && userAway != null;

      // Exact score (requires both predicted scores).
      // R32 excluded: phantom bug corrupted all R32 exact picks — cap at winner credit (50 pts).
      if (hasScore && userHome === realHome && userAway === realAway && pick.stage !== "ROUND_OF_32") {
        br.knockout.exact += 1;
        br.knockout.points += POINTS.KO_EXACT_WIN;
        continue;
      }

      const realIsDraw = realHome === realAway;

      if (hasScore) {
        // Full score prediction: award winner/draw points if applicable.
        const predictedDraw =
          pick.userPredictedDraw === true
            ? true
            : userHome === userAway;
        if (realIsDraw && predictedDraw) {
          br.knockout.winner += 1;
          br.knockout.points += POINTS.KO_WIN;
        } else if (!realIsDraw && !predictedDraw) {
          const realWinnerCode = realHome > realAway ? pick.homeTeamCode : pick.awayTeamCode;
          const upw = pick.userPredictedWinner !== undefined
            ? pick.userPredictedWinner
            : pickedWinnerCode(pick);
          if (upw === realWinnerCode) {
            br.knockout.winner += 1;
            br.knockout.points += POINTS.KO_WIN;
          }
        }
      } else if (!realIsDraw && pick.userPredictedWinner != null) {
        // No captured score (e.g. user had wrong 3rd-place opponent in this slot)
        // but an explicit winner was captured — award winner points if correct.
        const realWinnerCode = realHome > realAway ? pick.homeTeamCode : pick.awayTeamCode;
        if (pick.userPredictedWinner === realWinnerCode) {
          br.knockout.winner += 1;
          br.knockout.points += POINTS.KO_WIN;
        }
      }
    }

    // Champion / runner-up: use userPredictedWinner on the final pick so scoring
    // stays correct after the final is played and applyActual overwrites the scores.
    const finalPick = ko.final;
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

  rows.sort((a, b) => {
    if (b.breakdown.total !== a.breakdown.total) {
      return b.breakdown.total - a.breakdown.total;
    }
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.attempt - b.attempt;
  });

  return rows;
}
