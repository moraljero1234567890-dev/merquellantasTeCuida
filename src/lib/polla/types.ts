export type TeamRef = {
  code: string;
  name: string;
  crest: string;
};

export type Score = {
  home: number;
  away: number;
};

export type MatchStage =
  | "GROUP_STAGE"
  | "ROUND_OF_32"
  | "ROUND_OF_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

export type MatchDoc = {
  _id: string;
  source: "dummy" | "football-data" | "api-sports" | "wikipedia";
  externalId?: string;
  utcDate: string;
  date: string;
  time: string;
  status: "SCHEDULED" | "IN_PLAY" | "FINISHED" | "POSTPONED";
  stage: MatchStage;
  stageLabel: string;
  group: string | null;
  matchday: number | null;
  venue: string;
  city: string;
  home: TeamRef;
  away: TeamRef;
  score: {
    fullTime: Score | null;
    halfTime: Score | null;
    penalties: Score | null;
  } | null;
};

export type UserDoc = {
  _id: string;
  email: string;
  nit: string;
  name: string;
  attemptsAllowed: number;
  createdAt: Date;
};

export type GroupScore = {
  home: number;
  away: number;
};

export type KnockoutPick = {
  matchId: string;
  stage: Exclude<MatchStage, "GROUP_STAGE">;
  homeTeamCode: string;
  homeTeamName: string;
  awayTeamCode: string;
  awayTeamName: string;
  home: number | null;
  away: number | null;
  penaltyWinner: "home" | "away" | null;
  // Captured the first time a real result overwrites this pick. Once set, never
  // changed — preserves the user's original prediction for scoring/display.
  userPredictedWinner?: string | null;
  // True if the user originally predicted equal home/away scores (a draw).
  userPredictedDraw?: boolean;
  // User's originally predicted FT score (captured before applyActual overwrites
  // home/away with the real result). Used for exact-score / goal-diff bonuses.
  userPredictedHome?: number | null;
  userPredictedAway?: number | null;
};

// Explicit knockout scores entered by the user via POST, stored as a flat
// matchId→score map — identical pattern to groupScores. This is the ONLY
// authoritative source for scoring knockout picks; the home/away fields inside
// the KnockoutPick bracket tree are ALWAYS overwritten by applyActual with real
// results and must never be used for scoring.
export type KoPickEntry = {
  home: number;
  away: number;
  penaltyWinner: "home" | "away" | null;
};

export type PredictionDoc = {
  _id: string;
  userEmail: string;
  attempt: number;
  status: "draft" | "complete" | "locked";
  groupScores: Record<string, GroupScore>;
  // User's explicit knockout score entries (written only by POST, never by applyActual).
  knockoutPicks?: Record<string, KoPickEntry>;
  knockout: {
    r32: KnockoutPick[];
    r16: KnockoutPick[];
    qf: KnockoutPick[];
    sf: KnockoutPick[];
    third: KnockoutPick | null;
    final: KnockoutPick | null;
  };
  champion: { code: string; name: string } | null;
  updatedAt: Date;
  completedAt: Date | null;
};
