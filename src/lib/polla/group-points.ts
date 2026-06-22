// Single source of truth for how a single group-stage prediction scores against
// the real result. Pure + client-safe (no "server-only"), so both the leaderboard
// scoring (scoring.ts) and the results comparison page can use the exact same
// rules and never drift apart.
//
// Points accumulate across tiers — a more accurate prediction always scores more.
// Each tier implies the one below it (exact => same goal difference => same
// outcome), so we award the sum of every tier earned:
//   exact score        = 50 + 30 + 20 = 100
//   correct goal diff  =      30 + 20 =  50
//   correct outcome    =           30 =  30

export const GROUP_POINTS = {
  OUTCOME: 30,
  EXACT: 50,
  GOAL_DIFF: 20,
} as const;

export type GroupTier = "exact" | "goalDiff" | "outcome" | "none";

type Score = { home: number; away: number } | null | undefined;

function outcome(home: number, away: number): "H" | "A" | "D" {
  if (home > away) return "H";
  if (away > home) return "A";
  return "D";
}

/**
 * Score a single group-stage pick against the real full-time result.
 * Returns the (mutually-exclusive) tier reached and the total points awarded.
 * `points` is 0 when there is no pick or no real result yet.
 */
export function groupMatchResult(
  predicted: Score,
  actual: Score,
): { tier: GroupTier; points: number } {
  if (!predicted || !actual) return { tier: "none", points: 0 };

  const exact =
    predicted.home === actual.home && predicted.away === actual.away;
  if (exact) {
    return {
      tier: "exact",
      points: GROUP_POINTS.EXACT + GROUP_POINTS.OUTCOME + GROUP_POINTS.GOAL_DIFF,
    };
  }

  // sameGoalDiff implies sameOutcome (equal margin => equal winner), so it must
  // be checked before the plain-outcome tier.
  const sameGoalDiff =
    predicted.home - predicted.away === actual.home - actual.away;
  if (sameGoalDiff) {
    return {
      tier: "goalDiff",
      points: GROUP_POINTS.OUTCOME + GROUP_POINTS.GOAL_DIFF,
    };
  }

  const sameOutcome =
    outcome(predicted.home, predicted.away) === outcome(actual.home, actual.away);
  if (sameOutcome) {
    return { tier: "outcome", points: GROUP_POINTS.OUTCOME };
  }

  return { tier: "none", points: 0 };
}
