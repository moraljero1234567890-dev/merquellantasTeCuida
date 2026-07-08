import "server-only";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { pollaMatchesCollection, pollaPredictionsCollection, pollaUsersCollection } from "./collections";
import type { MatchDoc, PredictionDoc } from "./types";
import type { PollaUserDoc } from "./collections";

type PollaLoginResult = {
  cedula: string;
  email: string;
  name: string;
  attemptsAllowed: number;
  source?: "fondo" | "polla";
};

export async function authenticatePollaUser(
  identifier: string,
  password: string,
): Promise<PollaLoginResult | null> {
  const db = await getDb();
  const isEmail = identifier.includes("@");

  if (!isEmail) {
    // Try main users collection first (fondo members) by cedula
    const mainUser = await db.collection("users").findOne({ cedula: identifier });
    if (mainUser && mainUser.passwordHash) {
      const valid = await bcrypt.compare(password, mainUser.passwordHash);
      if (valid) {
        const fondoMember = await db.collection("fondo_members").findOne({
          user_id: mainUser._id.toString(),
          activo: true,
        });
        if (fondoMember) {
          return {
            cedula: mainUser.cedula,
            email: mainUser.email ?? "",
            name: mainUser.nombre ?? mainUser.name ?? "",
            attemptsAllowed: 10,
          };
        }
      }
    }
  }

  // Check polla_users by cedula or email
  const pollaCol = await pollaUsersCollection();
  const pollaUser = isEmail
    ? await pollaCol.findOne({ email: identifier.toLowerCase() })
    : await pollaCol.findOne({ cedula: identifier });
  if (pollaUser && pollaUser.passwordHash) {
    const valid = await bcrypt.compare(password, pollaUser.passwordHash);
    if (valid) {
      return {
        cedula: pollaUser._id,
        email: pollaUser.email,
        name: pollaUser.name,
        attemptsAllowed: pollaUser.attemptsAllowed,
      };
    }
  }
  return null;
}

async function ensureMatchesSeeded(): Promise<void> {
  const col = await pollaMatchesCollection();
  const count = await col.estimatedDocumentCount();
  if (count > 0) return;
  let docs: MatchDoc[] = [];
  try {
    const { fetchLatestFromConfiguredProvider } = await import("./providers");
    const result = await fetchLatestFromConfiguredProvider();
    docs = result.docs;
  } catch (err) {
    console.warn("Failed to fetch from provider, using static seed:", err);
  }
  if (docs.length === 0) {
    const { buildMatchSeed } = await import("./seed-data");
    docs = buildMatchSeed();
  }
  if (docs.length === 0) return;
  await col.insertMany(docs);
  await col.createIndex({ utcDate: 1 });
  await col.createIndex({ stage: 1, group: 1, matchday: 1 });
}

export async function getAllMatches(): Promise<MatchDoc[]> {
  await ensureMatchesSeeded();
  const col = await pollaMatchesCollection();
  return col.find({}).sort({ utcDate: 1 }).toArray();
}

// Default minimum gap between live provider refreshes. Keeps us well under
// football-data's free-tier limit (10 req/min) even with many concurrent
// logins, while still keeping scores fresh for active users.
const REFRESH_THROTTLE_MS = Number(
  process.env.POLLA_REFRESH_THROTTLE_MS ?? 120_000,
);

/**
 * Best-effort, throttled refresh of match results from the configured live
 * provider. Safe to call on every login / page load: at most one request per
 * throttle window actually hits the provider (the winner atomically claims the
 * slot via the polla_meta doc), and any failure is swallowed so it can never
 * block auth. Upserts by `_id`, so a stable provider updates fixtures in place
 * without disturbing the predictions collection.
 */
export async function maybeRefreshMatches(): Promise<void> {
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; lastRefreshedAt: Date }>(
      "polla_meta",
    );
    const cutoff = new Date(Date.now() - REFRESH_THROTTLE_MS);

    // Atomically claim the refresh slot: only succeeds if no fresh refresh has
    // happened within the window. Concurrent callers lose the race and bail.
    const claim = await meta.updateOne(
      { _id: "matches", lastRefreshedAt: { $lte: cutoff } },
      { $set: { lastRefreshedAt: new Date() } },
    );
    if (claim.matchedCount === 0) {
      // Either fresh already, or the doc doesn't exist yet. Seed it on first
      // run; if another caller seeds concurrently the duplicate-key throws and
      // we simply bail (they own this window).
      const existing = await meta.findOne({ _id: "matches" });
      if (existing) return; // fresh within window
      try {
        await meta.insertOne({ _id: "matches", lastRefreshedAt: new Date() });
      } catch {
        return; // lost the seed race
      }
    }

    const { fetchLatestFromConfiguredProvider } = await import("./providers");
    const provider = await fetchLatestFromConfiguredProvider();
    if (!provider.docs.length) return;
    await applyProviderResults(provider.docs);
  } catch (err) {
    console.warn("maybeRefreshMatches failed (non-fatal):", err);
  }
}

/**
 * Apply freshly-fetched provider matches onto the existing fixtures, updating
 * results in place. Deliberately conservative so an automatic refresh can never
 * corrupt the board:
 *
 *  - Tries to match by `_id` first. If not found, falls back to matching by
 *    team codes + stage (handles the case where the DB was seeded from the
 *    static fallback with team-based IDs like "A1-mx-no" while Wikipedia
 *    generates "wiki-GA1" IDs — in that case we update status/score only,
 *    preserving the original _id so existing predictions still line up).
 *  - Wikipedia knockout fixtures that have no match (by id OR by teams) are
 *    inserted so they become queryable once teams are known.
 *  - Never downgrades a match that is already FINISHED with a score back to a
 *    scheduled / scoreless state, so a transient provider gap can't wipe a real
 *    result that users have already been scored against.
 */
export async function applyProviderResults(
  docs: MatchDoc[],
): Promise<{ updated: number; skipped: number; unknown: number; inserted: number }> {
  const col = await pollaMatchesCollection();
  const existing = await col.find({}).toArray();
  const byId = new Map(existing.map((m) => [m._id, m]));

  // Secondary index by stage + both team-code orderings (handles home/away swaps
  // between seed and provider, e.g. static seed has mx|no, Wikipedia has no|mx).
  const byTeams = new Map<string, MatchDoc>();
  for (const m of existing) {
    if (!m.home?.code || !m.away?.code) continue;
    byTeams.set(`${m.stage}|${m.home.code}|${m.away.code}`, m);
    byTeams.set(`${m.stage}|${m.away.code}|${m.home.code}`, m);
  }

  let updated = 0;
  let skipped = 0;
  let unknown = 0;
  let inserted = 0;

  for (const d of docs) {
    // --- Primary lookup: exact _id match ---
    const prevById = byId.get(d._id);
    if (prevById) {
      const prevHasResult = prevById.status === "FINISHED" && prevById.score?.fullTime != null;
      const nextHasResult = d.status === "FINISHED" && d.score?.fullTime != null;
      if (prevHasResult && !nextHasResult) { skipped += 1; continue; }
      await col.replaceOne({ _id: d._id }, d);
      updated += 1;
      continue;
    }

    // --- Secondary lookup: match by team codes (handles seed/provider ID mismatch) ---
    const teamKey = `${d.stage}|${d.home?.code}|${d.away?.code}`;
    const prevByTeams = d.home?.code && d.away?.code ? byTeams.get(teamKey) : undefined;
    if (prevByTeams) {
      const prevHasResult = prevByTeams.status === "FINISHED" && prevByTeams.score?.fullTime != null;
      const nextHasResult = d.status === "FINISHED" && d.score?.fullTime != null;
      if (prevHasResult && !nextHasResult) { skipped += 1; continue; }
      // Keep the original _id so predictions keyed to it stay valid.
      // Only update score/status — don't replace home/away names since the
      // existing doc was used when the user filled out their boleta.
      await col.updateOne(
        { _id: prevByTeams._id },
        { $set: { status: d.status, score: d.score } },
      );
      updated += 1;
      continue;
    }

    // --- No match found: insert Wikipedia knockout fixtures ---
    if (d.source === "wikipedia" && d.stage !== "GROUP_STAGE") {
      await col.insertOne(d);
      byId.set(d._id, d);
      byTeams.set(`${d.stage}|${d.home?.code}|${d.away?.code}`, d);
      byTeams.set(`${d.stage}|${d.away?.code}|${d.home?.code}`, d);
      inserted += 1;
    } else {
      unknown += 1;
    }
  }

  return { updated, skipped, unknown, inserted };
}

export async function getPollaUserByCedula(identifier: string): Promise<PollaLoginResult | null> {
  const db = await getDb();
  const isEmail = identifier.includes("@");

  if (!isEmail) {
    // Check main users + fondo membership by cedula
    const mainUser = await db.collection("users").findOne({ cedula: identifier });
    if (mainUser) {
      const fondoMember = await db.collection("fondo_members").findOne({
        user_id: mainUser._id.toString(),
        activo: true,
      });
      if (fondoMember) {
        return {
          cedula: mainUser.cedula,
          email: mainUser.email ?? "",
          name: mainUser.nombre ?? "",
          attemptsAllowed: 10,
        };
      }
    }
  }

  // Check polla_users by cedula or email
  const pollaCol = await pollaUsersCollection();
  const pollaUser = isEmail
    ? await pollaCol.findOne({ email: identifier.toLowerCase() })
    : await pollaCol.findOne({ cedula: identifier });
  if (pollaUser) {
    return {
      cedula: pollaUser._id,
      email: pollaUser.email,
      name: pollaUser.name,
      attemptsAllowed: pollaUser.attemptsAllowed,
    };
  }
  return null;
}

export async function getEffectiveAttempts(cedula: string): Promise<number> {
  const user = await getPollaUserByCedula(cedula);
  if (!user) return 0;
  const db = await getDb();
  const adjustments = await db.collection("polla_attempt_adjustments")
    .find({ cedula })
    .toArray();
  const totalAdj = adjustments.reduce((sum: number, a) => sum + ((a as { delta?: number }).delta ?? 0), 0);
  return user.attemptsAllowed + totalAdj;
}

export async function listPredictionsForUser(cedula: string): Promise<PredictionDoc[]> {
  const col = await pollaPredictionsCollection();
  return col.find({ userEmail: cedula }).sort({ attempt: 1 }).toArray();
}

export async function listAllPredictions(): Promise<PredictionDoc[]> {
  const col = await pollaPredictionsCollection();
  return col.find({}).toArray();
}

export async function getPrediction(cedula: string, attempt: number): Promise<PredictionDoc | null> {
  const col = await pollaPredictionsCollection();
  return col.findOne({ userEmail: cedula, attempt });
}

export async function upsertPrediction(doc: PredictionDoc): Promise<void> {
  const col = await pollaPredictionsCollection();
  await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
}

export async function isTournamentLocked(): Promise<boolean> {
  const col = await pollaMatchesCollection();
  const first = await col.find({ stage: "GROUP_STAGE" }).sort({ utcDate: 1 }).limit(1).toArray();
  if (!first.length) return false;
  return new Date(first[0].utcDate).getTime() <= Date.now();
}

export type LockStatus = {
  groupLocked: boolean;
  knockoutOpen: boolean;
  editableStages: string[];
  allGroupFinished: boolean;
  useActualStandings: boolean;
};

export async function getLockStatus(): Promise<LockStatus> {
  const matches = await getAllMatches();
  // Predictions are now CLOSED. The tournament has started, so every attempt is
  // locked and no group or knockout edits are accepted. Flip PREDICTIONS_OPEN
  // back to true (and check the deadline) only to reopen submissions.
  const PREDICTIONS_OPEN = false;
  // Original submission deadline: Fri Jun 12 2026, 2:00 PM Colombia time
  // (UTC-5) = 19:00 UTC. Kept for reference; gated behind PREDICTIONS_OPEN.
  const SUBMISSION_DEADLINE = new Date("2026-06-12T19:00:00Z");
  const now = new Date();

  if (PREDICTIONS_OPEN && now < SUBMISSION_DEADLINE) {
    return {
      groupLocked: false,
      knockoutOpen: true,
      editableStages: ["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"],
      allGroupFinished: false,
      useActualStandings: false,
    };
  }

  const groupMatches = matches.filter((m) => m.stage === "GROUP_STAGE");
  const allGroupFinished = groupMatches.length > 0 && groupMatches.every((m) => m.status === "FINISHED");

  // Kill-switch: POLLA_FREEZE=true re-freezes everything (no edits, no rebuild)
  // in case the live knockout ever needs to be paused.
  if (process.env.POLLA_FREEZE === "true") {
    return { groupLocked: true, knockoutOpen: false, editableStages: [], allGroupFinished, useActualStandings: false };
  }

  if (!allGroupFinished) {
    return { groupLocked: true, knockoutOpen: false, editableStages: [], allGroupFinished: false, useActualStandings: false };
  }

  // Between-round editing windows. Users may edit unplayed knockout picks only
  // during the break between each round. Per-match locking (getKnockoutLockInfo)
  // ensures already-played games stay locked even when a window is open.
  // Add a new entry here before each round starts.
  //
  // All times are UTC. Colombia (COT) is UTC-5:
  //   7:00 PM COT = 00:00 UTC next day
  const KNOCKOUT_WINDOWS: Array<{ from: Date; to: Date }> = [
  // R32 window: Jun 29 (first R32 kick-off) → Jul 2 00:00 UTC (7 PM COT Jul 1).
  { from: new Date("2026-06-29T00:00:00Z"), to: new Date("2026-07-02T00:00:00Z") },
  // R16 window: Jul 2 00:00 UTC → Jul 4 17:00 UTC (12 PM COT Jul 4, first R16 kick-off).
  { from: new Date("2026-07-02T00:00:00Z"), to: new Date("2026-07-04T17:00:00Z") },
  // QF/SF final edit window: Jul 8 10:30 AM COT (15:30 UTC) → Jul 9 3:00 PM COT (20:00 UTC).
  // LAST chance for users to update their full bracket before QF kicks off.
  { from: new Date("2026-07-08T15:30:00Z"), to: new Date("2026-07-09T20:00:00Z") },
];

  const inEditingWindow = KNOCKOUT_WINDOWS.some((w) => now >= w.from && now < w.to);
  if (!inEditingWindow) {
    return {
      groupLocked: true,
      knockoutOpen: false,
      editableStages: [],
      allGroupFinished: true,
      useActualStandings: true,
    };
  }

  // Inside an editing window: group stage locked, users may edit each unplayed
  // knockout game until it kicks off (per-match lock via getKnockoutLockInfo).
  return {
    groupLocked: true,
    knockoutOpen: true,
    editableStages: ["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"],
    allGroupFinished: true,
    useActualStandings: true,
  };
}

export type KnockoutLockInfo = {
  startedPairs: Set<string>;
  finalStarted: boolean;
  thirdStarted: boolean;
};

/** A real knockout match counts as started once its kickoff passes (the
 *  Wikipedia source never reports IN_PLAY, only SCHEDULED/FINISHED). */
export async function getKnockoutLockInfo(): Promise<KnockoutLockInfo> {
  const matches = await getAllMatches();
  const nowMs = Date.now();
  const started = (m: { status: string; utcDate: string }) =>
    m.status === "IN_PLAY" ||
    m.status === "FINISHED" ||
    (!!m.utcDate && new Date(m.utcDate).getTime() <= nowMs);

  const startedPairs = new Set<string>();
  let finalStarted = false;
  let thirdStarted = false;
  for (const m of matches) {
    if (m.stage === "GROUP_STAGE") continue;
    if (!started(m)) continue;
    if (m.home?.code && m.away?.code) {
      startedPairs.add([m.home.code, m.away.code].sort().join("|"));
    }
    if (m.stage === "FINAL") finalStarted = true;
    if (m.stage === "THIRD_PLACE") thirdStarted = true;
  }
  return { startedPairs, finalStarted, thirdStarted };
}

/** Returns the matchIds of a prediction's knockout picks that are locked because
 *  their real game has already kicked off. R32–SF lock when the real game with
 *  those two teams starts; the final/third lock when the real final/third starts
 *  (so the champion stays editable until the real final, even if the user's
 *  predicted finalists differ from the actual ones). */
export function lockedKnockoutMatchIds(
  knockout: PredictionDoc["knockout"],
  info: KnockoutLockInfo,
): string[] {
  const picks = [
    ...knockout.r32,
    ...knockout.r16,
    ...knockout.qf,
    ...knockout.sf,
    ...(knockout.third ? [knockout.third] : []),
    ...(knockout.final ? [knockout.final] : []),
  ];
  const locked: string[] = [];
  for (const p of picks) {
    let isLocked = false;
    if (p.stage === "FINAL") isLocked = info.finalStarted;
    else if (p.stage === "THIRD_PLACE") isLocked = info.thirdStarted;
    else if (p.homeTeamCode && p.awayTeamCode) {
      isLocked = info.startedPairs.has([p.homeTeamCode, p.awayTeamCode].sort().join("|"));
    }
    if (isLocked) locked.push(p.matchId);
  }
  return locked;
}

export function extractActualGroupScores(matches: MatchDoc[]): Record<string, import("./types").GroupScore> {
  const scores: Record<string, import("./types").GroupScore> = {};
  for (const m of matches) {
    if (m.stage === "GROUP_STAGE" && m.status === "FINISHED" && m.score?.fullTime) {
      scores[m._id] = { home: m.score.fullTime.home, away: m.score.fullTime.away };
    }
  }
  return scores;
}

export async function listAllPollaUsers(): Promise<PollaUserDoc[]> {
  const pollaCol = await pollaUsersCollection();
  return pollaCol.find({}).sort({ createdAt: -1 }).toArray();
}

export async function createPollaUser(input: {
  cedula: string;
  email: string;
  name: string;
  password: string;
  attemptsAllowed: number;
}): Promise<PollaUserDoc> {
  const pollaCol = await pollaUsersCollection();
  await pollaCol.createIndex({ email: 1 });
  // Unique on cedula only for non-empty values, so multiple email-only users
  // (cedula === "") can coexist without tripping a duplicate-key error.
  await pollaCol.createIndex(
    { cedula: 1 },
    { unique: true, partialFilterExpression: { cedula: { $gt: "" } } },
  );
  const passwordHash = await bcrypt.hash(input.password, 10);
  const uid = input.cedula || input.email.trim().toLowerCase();
  const doc: PollaUserDoc = {
    _id: uid,
    cedula: input.cedula,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    passwordHash,
    attemptsAllowed: Math.max(0, Math.min(20, Math.floor(input.attemptsAllowed))),
    createdAt: new Date(),
  };
  await pollaCol.replaceOne({ _id: doc._id }, doc, { upsert: true });
  return doc;
}

export async function listAllPollaParticipants(): Promise<PollaLoginResult[]> {
  const db = await getDb();
  const results: PollaLoginResult[] = [];
  const seenCedulas = new Set<string>();
  // Get fondo members from main system. fondo_members.user_id is stored as the
  // string form of users._id (an ObjectId), so we must convert before querying.
  const fondoMembers = await db.collection("fondo_members").find({ activo: true }).toArray();
  for (const fm of fondoMembers) {
    const rawId = fm.user_id;
    let user = null;
    if (rawId instanceof ObjectId) {
      user = await db.collection("users").findOne({ _id: rawId });
    } else if (typeof rawId === "string" && ObjectId.isValid(rawId)) {
      user = await db.collection("users").findOne({ _id: new ObjectId(rawId) });
    } else if (rawId != null) {
      // Fallback: some data may store user_id as a plain (string) _id.
      user = await db.collection("users").findOne({ _id: rawId });
    }
    if (!user) continue;
    const cedula = user.cedula ?? "";
    if (cedula) seenCedulas.add(cedula);
    results.push({
      cedula,
      email: user.email ?? "",
      name: user.nombre ?? user.name ?? "",
      attemptsAllowed: 10,
      source: "fondo",
    });
  }
  // Get polla-only users (skip any whose cedula already came from the fondo).
  const pollaCol = await pollaUsersCollection();
  const pollaUsers = await pollaCol.find({}).toArray();
  for (const pu of pollaUsers) {
    // The prediction key (and login identity) is pu._id = cedula || email.
    const identity = pu._id || pu.cedula || pu.email;
    if (pu.cedula && seenCedulas.has(pu.cedula)) continue;
    results.push({
      cedula: identity,
      email: pu.email,
      name: pu.name,
      attemptsAllowed: pu.attemptsAllowed,
      source: "polla",
    });
  }
  return results;
}

/**
 * Counts how many prediction boletas each user has saved, keyed by the user's
 * prediction identity (userEmail field, which holds the cedula or polla _id).
 */
export async function getPredictionCountsByUser(): Promise<Record<string, number>> {
  const col = await pollaPredictionsCollection();
  const rows = await col
    .aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$userEmail", count: { $sum: 1 } } },
    ])
    .toArray();
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r._id != null) counts[r._id] = r.count;
  }
  return counts;
}
