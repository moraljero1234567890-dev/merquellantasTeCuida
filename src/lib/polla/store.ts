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
    const col = await pollaMatchesCollection();
    for (const d of provider.docs) {
      await col.replaceOne({ _id: d._id }, d, { upsert: true });
    }
  } catch (err) {
    console.warn("maybeRefreshMatches failed (non-fatal):", err);
  }
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
  // Prediction submission deadline: Fri Jun 12 2026, 2:00 PM Colombia time
  // (UTC-5) = 19:00 UTC. Until this moment all predictions remain editable.
  const SUBMISSION_DEADLINE = new Date("2026-06-12T19:00:00Z");
  const now = new Date();

  if (now < SUBMISSION_DEADLINE) {
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

  if (!allGroupFinished) {
    return { groupLocked: true, knockoutOpen: false, editableStages: [], allGroupFinished: false, useActualStandings: false };
  }

  const knockoutOrder: string[] = ["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS"];
  const editableStages: string[] = [];

  for (const stage of knockoutOrder) {
    const stageMatches = matches.filter((m) => m.stage === stage);
    if (stageMatches.length === 0) {
      editableStages.push(stage);
      break;
    }
    const allFinished = stageMatches.every((m) => m.status === "FINISHED");
    const anyStarted = stageMatches.some((m) => m.status === "IN_PLAY" || m.status === "FINISHED");

    if (!anyStarted) {
      editableStages.push(stage);
      break;
    } else if (!allFinished) {
      break;
    }
  }

  // Third place + final: both editable after SF finishes, until either starts
  const sfMatches = matches.filter((m) => m.stage === "SEMI_FINALS");
  const sfAllDone = sfMatches.length > 0 && sfMatches.every((m) => m.status === "FINISHED");
  if (sfAllDone) {
    const thirdMatches = matches.filter((m) => m.stage === "THIRD_PLACE");
    const finalMatches = matches.filter((m) => m.stage === "FINAL");
    const thirdStarted = thirdMatches.some((m) => m.status === "IN_PLAY" || m.status === "FINISHED");
    const finalStarted = finalMatches.some((m) => m.status === "IN_PLAY" || m.status === "FINISHED");
    if (!thirdStarted && !finalStarted) {
      editableStages.push("THIRD_PLACE", "FINAL");
    }
  }

  return {
    groupLocked: true,
    knockoutOpen: editableStages.length > 0,
    editableStages,
    allGroupFinished: true,
    useActualStandings: true,
  };
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
