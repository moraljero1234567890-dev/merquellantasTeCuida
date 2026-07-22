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

// Accepts any match shape carrying the fields we read (MatchDoc on the
// server, ApiMatch on the client) and tolerates partially-filled drafts
// where home/away may still be null.
type StandingsMatch = Pick<MatchDoc, "_id" | "group" | "home" | "away">;

export function computeGroupStandings(
  groupMatches: StandingsMatch[],
  predictedScores: Record<
    string,
    GroupScore | { home: number | null; away: number | null }
  >,
): Record<string, StandingRow[]> {
  const byGroup: Record<string, StandingsMatch[]> = {};
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

// Official 2026 FIFA World Cup Round of 32 bracket (Annex C of the competition
// regulations). 12 groups (A-L): both group winners and runners-up qualify,
// plus the 8 best third-placed teams. Each third-place slot can only be filled
// by a third-placed team from a fixed set of 5 groups, and which exact group
// lands in each slot depends on which 8 groups produce the best thirds.
//
// The 16 matches below are listed in BRACKET DISPLAY ORDER (top-to-bottom of the
// bracket tree), NOT in FIFA match-number order. This is deliberate: with this
// ordering the Round of 16 is simply winners of R32-(2i-1) vs R32-(2i), the
// quarters are winners of R16-(2i-1) vs R16-(2i), and so on — i.e. the natural
// sequential pairing used by buildKnockoutFromGroup below. The FIFA match number
// is noted in a comment on each line for traceability.
type SeedSlot =
  | { kind: "W"; group: string }
  | { kind: "R"; group: string }
  | { kind: "T"; allowed: string[] };

const R32_TEMPLATE: Array<{ home: SeedSlot; away: SeedSlot }> = [
  // R32-1  (M74)  Winner E   vs  3rd A/B/C/D/F
  { home: { kind: "W", group: "E" }, away: { kind: "T", allowed: ["A", "B", "C", "D", "F"] } },
  // R32-2  (M77)  Winner I   vs  3rd C/D/F/G/H
  { home: { kind: "W", group: "I" }, away: { kind: "T", allowed: ["C", "D", "F", "G", "H"] } },
  // R32-3  (M73)  Runner-up A vs  Runner-up B
  { home: { kind: "R", group: "A" }, away: { kind: "R", group: "B" } },
  // R32-4  (M75)  Winner F   vs  Runner-up C
  { home: { kind: "W", group: "F" }, away: { kind: "R", group: "C" } },
  // R32-5  (M83)  Runner-up K vs  Runner-up L
  { home: { kind: "R", group: "K" }, away: { kind: "R", group: "L" } },
  // R32-6  (M84)  Winner H   vs  Runner-up J
  { home: { kind: "W", group: "H" }, away: { kind: "R", group: "J" } },
  // R32-7  (M81)  Winner D   vs  3rd B/E/F/I/J
  { home: { kind: "W", group: "D" }, away: { kind: "T", allowed: ["B", "E", "F", "I", "J"] } },
  // R32-8  (M82)  Winner G   vs  3rd A/E/H/I/J
  { home: { kind: "W", group: "G" }, away: { kind: "T", allowed: ["A", "E", "H", "I", "J"] } },
  // R32-9  (M76)  Winner C   vs  Runner-up F
  { home: { kind: "W", group: "C" }, away: { kind: "R", group: "F" } },
  // R32-10 (M78)  Runner-up E vs  Runner-up I
  { home: { kind: "R", group: "E" }, away: { kind: "R", group: "I" } },
  // R32-11 (M79)  Winner A   vs  3rd C/E/F/H/I
  { home: { kind: "W", group: "A" }, away: { kind: "T", allowed: ["C", "E", "F", "H", "I"] } },
  // R32-12 (M80)  Winner L   vs  3rd E/H/I/J/K
  { home: { kind: "W", group: "L" }, away: { kind: "T", allowed: ["E", "H", "I", "J", "K"] } },
  // R32-13 (M86)  Winner J   vs  Runner-up H
  { home: { kind: "W", group: "J" }, away: { kind: "R", group: "H" } },
  // R32-14 (M88)  Runner-up D vs  Runner-up G
  { home: { kind: "R", group: "D" }, away: { kind: "R", group: "G" } },
  // R32-15 (M85)  Winner B   vs  3rd E/F/G/I/J
  { home: { kind: "W", group: "B" }, away: { kind: "T", allowed: ["E", "F", "G", "I", "J"] } },
  // R32-16 (M87)  Winner K   vs  3rd D/E/I/J/L
  { home: { kind: "W", group: "K" }, away: { kind: "T", allowed: ["D", "E", "I", "J", "L"] } },
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

// Assigns the qualifying third-placed groups to the third-place bracket slots,
// honouring each slot's allowed-groups constraint. Modelled as a maximum
// bipartite matching (group -> slot) so that the result is always a valid
// assignment when one exists — which, per Annex C, it does for all 495 possible
// combinations of 8 qualifying groups. Deterministic given the input order.
function assignThirdsToSlots(
  groups: string[],
  slots: Array<{ index: number; allowed: string[] }>,
): Map<number, string> {
  const slotToGroup: (string | null)[] = slots.map(() => null);

  const augment = (group: string, visited: boolean[]): boolean => {
    for (let s = 0; s < slots.length; s++) {
      if (visited[s]) continue;
      if (!slots[s].allowed.includes(group)) continue;
      visited[s] = true;
      const current = slotToGroup[s];
      if (current === null || augment(current, visited)) {
        slotToGroup[s] = group;
        return true;
      }
    }
    return false;
  };

  for (const g of groups) {
    augment(g, slots.map(() => false));
  }

  const result = new Map<number, string>();
  slots.forEach((slot, s) => {
    const g = slotToGroup[s];
    if (g) result.set(slot.index, g);
  });
  return result;
}

export type R32SeedTeam = { code: string; name: string } | null;

export function buildR32Seeds(
  standings: Record<string, StandingRow[]>,
): Array<{ home: R32SeedTeam; away: R32SeedTeam }> {
  const thirds = topThirdPlaced(standings);
  const qualifyingGroups = thirds.map((r) => r.group);

  // Gather the third-place slots (one per "T" template entry) and match the
  // qualifying groups into them respecting each slot's allowed set.
  const slots: Array<{ index: number; allowed: string[] }> = [];
  R32_TEMPLATE.forEach((t, i) => {
    if (t.home.kind === "T") slots.push({ index: i, allowed: t.home.allowed });
    if (t.away.kind === "T") slots.push({ index: i, allowed: t.away.allowed });
  });
  const slotGroup = assignThirdsToSlots(qualifyingGroups, slots);

  const seedFromRow = (row: StandingRow | undefined): R32SeedTeam =>
    row ? { code: row.teamCode, name: row.teamName } : null;

  const pick = (slot: SeedSlot, templateIndex: number): R32SeedTeam => {
    if (slot.kind === "W") return seedFromRow(standings[slot.group]?.[0]);
    if (slot.kind === "R") return seedFromRow(standings[slot.group]?.[1]);
    // Third place: resolved via the bracket-slot matching above.
    const g = slotGroup.get(templateIndex);
    return g ? seedFromRow(standings[g]?.[2]) : null;
  };

  return R32_TEMPLATE.map((t, i) => ({
    home: pick(t.home, i),
    away: pick(t.away, i),
  }));
}

export type ActualKnockoutMatch = {
  home: { code: string; name: string };
  away: { code: string; name: string };
};

// Seeds the Round of 32 from the REAL, already-decided knockout fixtures
// (parsed from Wikipedia into polla_matches) instead of computing the
// third-place slot assignment ourselves. FIFA's official third-place
// allocation is a fixed table that our generic bipartite matching can't
// reproduce when more than one valid assignment exists; the real fixtures
// are authoritative, so once they're known we use them directly.
//
// Each R32 template slot has at least one "anchor" side (a group winner or
// runner-up), whose team we know from the actual standings. We find the real
// fixture containing that anchor team and read off its opponent — including
// the third-placed team — placing both onto the templated home/away sides so
// the downstream bracket tree pairs them exactly as the official bracket does.
//
// Returns null (caller falls back to buildR32Seeds) whenever the real fixtures
// aren't fully available yet or don't line up with our standings — e.g. before
// the bracket is set, or if the data sources use mismatched team codes.
export function buildR32SeedsFromActual(
  standings: Record<string, StandingRow[]>,
  actualR32: ActualKnockoutMatch[],
): Array<{ home: R32SeedTeam; away: R32SeedTeam }> | null {
  const fixtures = actualR32.filter((m) => m?.home?.code && m?.away?.code);
  if (fixtures.length < R32_TEMPLATE.length) return null;

  const anchorCodeForSlot = (slot: SeedSlot): string | null => {
    if (slot.kind === "W") return standings[slot.group]?.[0]?.teamCode ?? null;
    if (slot.kind === "R") return standings[slot.group]?.[1]?.teamCode ?? null;
    return null;
  };

  // anchor team code -> which R32 slot it belongs to and on which side
  const anchors = new Map<string, { index: number; side: "home" | "away" }>();
  for (let i = 0; i < R32_TEMPLATE.length; i++) {
    const hc = anchorCodeForSlot(R32_TEMPLATE[i].home);
    const ac = anchorCodeForSlot(R32_TEMPLATE[i].away);
    if (hc) anchors.set(hc, { index: i, side: "home" });
    if (ac) anchors.set(ac, { index: i, side: "away" });
  }

  const seeds: Array<{ home: R32SeedTeam; away: R32SeedTeam } | null> =
    R32_TEMPLATE.map(() => null);

  for (const fx of fixtures) {
    const homeAnchor = anchors.get(fx.home.code);
    const awayAnchor = anchors.get(fx.away.code);
    const anchor = homeAnchor ?? awayAnchor;
    if (!anchor) return null; // a fixture we can't place -> bail to fallback
    if (seeds[anchor.index]) return null; // duplicate/conflicting fixture

    const anchorTeam = homeAnchor ? fx.home : fx.away;
    const otherTeam = homeAnchor ? fx.away : fx.home;
    const anchorSeed: R32SeedTeam = { code: anchorTeam.code, name: anchorTeam.name };
    const otherSeed: R32SeedTeam = { code: otherTeam.code, name: otherTeam.name };

    seeds[anchor.index] =
      anchor.side === "home"
        ? { home: anchorSeed, away: otherSeed }
        : { home: otherSeed, away: anchorSeed };
  }

  if (seeds.some((s) => s === null)) return null;
  return seeds as Array<{ home: R32SeedTeam; away: R32SeedTeam }>;
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

export type ActualKnockoutResult = {
  winnerCode: string | null;
  byCode: Record<string, number>;
};

// Derives the winner code from a pick's user-entered scores (before any real
// result overwrites them). Used to capture userPredictedWinner in applyActual.
function userPickWinner(pick: KnockoutPick): string | null {
  if (pick.home == null || pick.away == null) return null;
  if (pick.home > pick.away) return pick.homeTeamCode;
  if (pick.away > pick.home) return pick.awayTeamCode;
  if (pick.penaltyWinner === "home") return pick.homeTeamCode;
  if (pick.penaltyWinner === "away") return pick.awayTeamCode;
  return null;
}

// Returns the champion derived from the user's ORIGINAL final pick prediction,
// using the captured userPredictedWinner if available, otherwise falling back
// to the user's current scores (pre-overwrite). Used in recomputeKnockout so
// that prediction.champion stays the user's pick even after the final is played.
export function userPickedChampionFromFinal(
  final: KnockoutPick | null,
): { code: string; name: string } | null {
  if (!final) return null;
  if (final.userPredictedWinner !== undefined) {
    const code = final.userPredictedWinner;
    if (!code) return null;
    const name =
      code === final.homeTeamCode ? final.homeTeamName
      : code === final.awayTeamCode ? final.awayTeamName
      : "";
    return { code, name };
  }
  return championFromFinal(final);
}

export function buildKnockoutFromGroup(
  standings: Record<string, StandingRow[]>,
  existing?: PredictionDoc["knockout"],
  r32SeedsOverride?: Array<{ home: R32SeedTeam; away: R32SeedTeam }>,
  actualByPair?: Map<string, ActualKnockoutResult>,
): PredictionDoc["knockout"] {
  // A knockout game that has already FINISHED in real life is fixed: its actual
  // result is written into the pick (oriented to the pick's home/away) so the
  // real winner propagates up the bracket. This lets every user's bracket flow
  // past games they couldn't predict (already played), all the way to a champion.
  const applyActual = (pick: KnockoutPick): KnockoutPick => {
    if (!actualByPair || !pick.homeTeamCode || !pick.awayTeamCode) return pick;
    const key = [pick.homeTeamCode, pick.awayTeamCode].sort().join("|");
    const r = actualByPair.get(key);
    if (!r) return pick;
    const home = r.byCode[pick.homeTeamCode] ?? 0;
    const away = r.byCode[pick.awayTeamCode] ?? 0;
    let penaltyWinner: KnockoutPick["penaltyWinner"] = null;
    if (home === away && r.winnerCode) {
      penaltyWinner = r.winnerCode === pick.homeTeamCode ? "home" : "away";
    } else if (home === away && !r.winnerCode) {
      // Real match ended in FT draw but penalty winner unknown (data missing).
      // Preserve the user's original penalty-winner choice rather than nulling it.
      penaltyWinner = pick.penaltyWinner;
    }
    // True only on the FIRST call for this pick (userPredictedWinner not yet set).
    // For pre-deploy picks that were already overwritten by a previous applyActual
    // run, pick.home/away now contain REAL scores, not the user's prediction —
    // guard every capture below so those picks can't receive free draw/exact bonuses.
    const isFirstOverwrite = pick.userPredictedWinner === undefined;
    // Capture the user's predicted winner the first time a real result overwrites
    // this pick. Once set (not undefined), we never change it so the original
    // prediction is preserved for scoring even after scores are overwritten.
    const userPredictedWinner =
      pick.userPredictedWinner !== undefined
        ? pick.userPredictedWinner
        : userPickWinner(pick);
    // Capture whether the user predicted a draw (equal scores) before overwriting.
    const userPredictedDraw =
      pick.userPredictedDraw !== undefined
        ? pick.userPredictedDraw
        : isFirstOverwrite
          ? (pick.home != null && pick.away != null && pick.home === pick.away)
          : false;
    // Capture the user's exact predicted FT score before overwriting.
    const userPredictedHome =
      pick.userPredictedHome !== undefined ? pick.userPredictedHome
      : isFirstOverwrite ? pick.home
      : null;
    const userPredictedAway =
      pick.userPredictedAway !== undefined ? pick.userPredictedAway
      : isFirstOverwrite ? pick.away
      : null;
    return { ...pick, home, away, penaltyWinner, userPredictedWinner, userPredictedDraw, userPredictedHome, userPredictedAway };
  };

  const r32Seeds = r32SeedsOverride ?? buildR32Seeds(standings);
  const r32: KnockoutPick[] = r32Seeds.map((seed, i) => {
    const id = `R32-${i + 1}`;
    const prev = existing?.r32?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "ROUND_OF_32", seed.home, seed.away);
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      return applyActual({
        ...fresh,
        home: prev.home,
        away: prev.away,
        penaltyWinner: prev.penaltyWinner,
        userPredictedWinner: prev.userPredictedWinner,
        userPredictedDraw: prev.userPredictedDraw,
        userPredictedHome: prev.userPredictedHome,
        userPredictedAway: prev.userPredictedAway,
      });
    }
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      fresh.homeTeamCode !== ""
    ) {
      // Home (anchor group winner/runner-up) matches but the away slot changed —
      // this is a 3rd-place opponent mismatch: our buildR32Seeds assigned a
      // different valid 3rd-place team than FIFA's official bracket. The user
      // still has a meaningful prediction: infer who they backed from their
      // original scores and carry that forward so they can earn R32 points if
      // the anchor team they backed actually won.
      const prevWinner = userPickWinner(prev);
      // Map winner to real team codes: home-anchor is unchanged; away slot
      // changed (different 3rd-place qualifier), but the user's "away team wins"
      // pick maps directly to the real away team — the scores they entered
      // (home X, away Y) still represent CIV's and the opponent's goals.
      const capturedWinner =
        prevWinner === prev.homeTeamCode ? fresh.homeTeamCode :
        prevWinner === prev.awayTeamCode ? fresh.awayTeamCode :
        null;
      // Preserve the user's predicted scores so exact-score points work.
      return applyActual({
        ...fresh,
        userPredictedWinner: capturedWinner,
        userPredictedHome: prev.home,
        userPredictedAway: prev.away,
      });
    }
    return applyActual(fresh);
  });

  // Helper: preserve a user's scores for a bracket slot even when the team codes
  // changed (e.g. a new R32 result shifted which teams appear in R16/QF/SF).
  // When teams are the same, carry everything forward unchanged.
  // When teams changed, remap scores by team code so a home/away orientation
  // flip or a different opponent doesn't scramble whose score belongs to whom.
  // If a real bracket team (e.g. ARG) wasn't in the user's pick at all, that
  // slot gets null — hasScore stays false and applyActual gets 0 pts, which is
  // correct because the user never predicted that team in this matchup.
  function preservePrev(fresh: KnockoutPick, prev: KnockoutPick): KnockoutPick {
    const sameTeams =
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode;

    if (sameTeams) {
      return {
        ...fresh,
        home: prev.home,
        away: prev.away,
        penaltyWinner: prev.penaltyWinner,
        userPredictedWinner: prev.userPredictedWinner,
        userPredictedDraw: prev.userPredictedDraw,
        userPredictedHome: prev.userPredictedHome,
        userPredictedAway: prev.userPredictedAway,
      };
    }

    // Teams changed: build a code→score map from prev and look up each fresh team.
    const prevByCode: Partial<Record<string, number | null>> = {};
    if (prev.homeTeamCode) prevByCode[prev.homeTeamCode] = prev.home;
    if (prev.awayTeamCode) prevByCode[prev.awayTeamCode] = prev.away;

    const newHome = fresh.homeTeamCode ? (prevByCode[fresh.homeTeamCode] ?? null) : null;
    const newAway = fresh.awayTeamCode ? (prevByCode[fresh.awayTeamCode] ?? null) : null;

    // Remap penalty winner by team identity, not position.
    let newPenaltyWinner: KnockoutPick["penaltyWinner"] = null;
    if (prev.penaltyWinner === "home") {
      if (fresh.homeTeamCode === prev.homeTeamCode) newPenaltyWinner = "home";
      else if (fresh.awayTeamCode === prev.homeTeamCode) newPenaltyWinner = "away";
    } else if (prev.penaltyWinner === "away") {
      if (fresh.awayTeamCode === prev.awayTeamCode) newPenaltyWinner = "away";
      else if (fresh.homeTeamCode === prev.awayTeamCode) newPenaltyWinner = "home";
    }

    // Derive the user's originally-predicted winner by team code from prev.
    const prevWinner: string | null =
      prev.userPredictedWinner !== undefined
        ? prev.userPredictedWinner
        : prev.home != null && prev.away != null
          ? prev.home > prev.away
            ? prev.homeTeamCode
            : prev.away > prev.home
              ? prev.awayTeamCode
              : prev.penaltyWinner === "home"
                ? prev.homeTeamCode
                : prev.penaltyWinner === "away"
                  ? prev.awayTeamCode
                  : null
          : null;

    // Remap the winner to fresh team codes. null = user didn't predict either team.
    const remappedWinner: string | null =
      prevWinner === null
        ? null
        : prevWinner === prev.homeTeamCode
          ? fresh.homeTeamCode === prev.homeTeamCode
            ? fresh.homeTeamCode
            : fresh.awayTeamCode === prev.homeTeamCode
              ? fresh.awayTeamCode
              : null
          : prevWinner === prev.awayTeamCode
            ? fresh.awayTeamCode === prev.awayTeamCode
              ? fresh.awayTeamCode
              : fresh.homeTeamCode === prev.awayTeamCode
                ? fresh.homeTeamCode
                : null
            : null;

    // Remap the user's exact predicted scores by team code.
    const predHome = prev.userPredictedHome !== undefined ? prev.userPredictedHome : prev.home;
    const predAway = prev.userPredictedAway !== undefined ? prev.userPredictedAway : prev.away;
    const prevPredByCode: Partial<Record<string, number | null>> = {};
    if (prev.homeTeamCode) prevPredByCode[prev.homeTeamCode] = predHome;
    if (prev.awayTeamCode) prevPredByCode[prev.awayTeamCode] = predAway;

    const newPredHome = fresh.homeTeamCode ? (prevPredByCode[fresh.homeTeamCode] ?? null) : null;
    const newPredAway = fresh.awayTeamCode ? (prevPredByCode[fresh.awayTeamCode] ?? null) : null;

    return {
      ...fresh,
      home: newHome,
      away: newAway,
      penaltyWinner: newPenaltyWinner,
      // Explicitly null (not undefined) so applyActual's isFirstOverwrite guard
      // stays false and never re-captures from positionally-mismatched scores.
      userPredictedWinner: remappedWinner,
      userPredictedHome: newPredHome,
      userPredictedAway: newPredAway,
      ...(newPredHome != null && newPredAway != null
        ? { userPredictedDraw: newPredHome === newPredAway }
        : {}),
    };
  }

  const r16: KnockoutPick[] = [];
  for (let i = 0; i < 8; i++) {
    const winA = winnerOf(r32[i * 2]);
    const winB = winnerOf(r32[i * 2 + 1]);
    const id = `R16-${i + 1}`;
    const prev = existing?.r16?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "ROUND_OF_16", winA, winB);
    r16.push(applyActual(prev ? preservePrev(fresh, prev) : fresh));
  }

  const qf: KnockoutPick[] = [];
  for (let i = 0; i < 4; i++) {
    const winA = winnerOf(r16[i * 2]);
    const winB = winnerOf(r16[i * 2 + 1]);
    const id = `QF-${i + 1}`;
    const prev = existing?.qf?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "QUARTER_FINALS", winA, winB);
    qf.push(applyActual(prev ? preservePrev(fresh, prev) : fresh));
  }

  const sf: KnockoutPick[] = [];
  for (let i = 0; i < 2; i++) {
    const winA = winnerOf(qf[i * 2]);
    const winB = winnerOf(qf[i * 2 + 1]);
    const id = `SF-${i + 1}`;
    const prev = existing?.sf?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "SEMI_FINALS", winA, winB);
    sf.push(applyActual(prev ? preservePrev(fresh, prev) : fresh));
  }

  const sfLoserA = loserOf(sf[0]);
  const sfLoserB = loserOf(sf[1]);
  const thirdFresh = emptyPick("THIRD-1", "THIRD_PLACE", sfLoserA, sfLoserB);
  const thirdPrev = existing?.third;
  const third: KnockoutPick = applyActual(
    thirdPrev ? preservePrev(thirdFresh, thirdPrev) : thirdFresh,
  );

  const sfWinA = winnerOf(sf[0]);
  const sfWinB = winnerOf(sf[1]);
  const finalFresh = emptyPick("FINAL-1", "FINAL", sfWinA, sfWinB);
  const finalPrev = existing?.final;
  const final: KnockoutPick = applyActual(
    finalPrev ? preservePrev(finalFresh, finalPrev) : finalFresh,
  );

  return { r32, r16, qf, sf, third, final };
}

export function championFromFinal(
  final: KnockoutPick | null,
): { code: string; name: string } | null {
  if (!final) return null;
  const winner = winnerOf(final);
  return winner;
}
