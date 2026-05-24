import "server-only";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { pollaMatchesCollection, pollaPredictionsCollection, pollaUsersCollection } from "./collections";
import type { MatchDoc, PredictionDoc } from "./types";
import type { PollaUserDoc } from "./collections";

type PollaLoginResult = {
  cedula: string;
  email: string;
  name: string;
  attemptsAllowed: number;
};

export async function authenticatePollaUser(
  cedula: string,
  password: string,
): Promise<PollaLoginResult | null> {
  const db = await getDb();
  // Try main users collection first (fondo members)
  const mainUser = await db.collection("users").findOne({ cedula });
  if (mainUser && mainUser.passwordHash) {
    const valid = await bcrypt.compare(password, mainUser.passwordHash);
    if (valid) {
      // Verify fondo membership
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
  // Fallback: check polla_users collection
  const pollaCol = await pollaUsersCollection();
  const pollaUser = await pollaCol.findOne({ cedula });
  if (pollaUser && pollaUser.passwordHash) {
    const valid = await bcrypt.compare(password, pollaUser.passwordHash);
    if (valid) {
      return {
        cedula: pollaUser.cedula,
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

export async function getPollaUserByCedula(cedula: string): Promise<PollaLoginResult | null> {
  const db = await getDb();
  // Check main users + fondo membership
  const mainUser = await db.collection("users").findOne({ cedula });
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
  // Check polla_users
  const pollaCol = await pollaUsersCollection();
  const pollaUser = await pollaCol.findOne({ cedula });
  if (pollaUser) {
    return {
      cedula: pollaUser.cedula,
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
  const WORLD_CUP_START = new Date("2026-06-11T00:00:00Z");
  const now = new Date();

  if (now < WORLD_CUP_START) {
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
  await pollaCol.createIndex({ cedula: 1 }, { unique: true });
  const passwordHash = await bcrypt.hash(input.password, 10);
  const doc: PollaUserDoc = {
    _id: input.cedula,
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
  // Get fondo members from main system
  const fondoMembers = await db.collection("fondo_members").find({ activo: true }).toArray();
  for (const fm of fondoMembers) {
    const user = await db.collection("users").findOne({ _id: fm.user_id });
    if (!user) continue;
    results.push({
      cedula: user.cedula,
      email: user.email ?? "",
      name: user.nombre ?? "",
      attemptsAllowed: 10,
    });
  }
  // Get polla-only users
  const pollaCol = await pollaUsersCollection();
  const pollaUsers = await pollaCol.find({}).toArray();
  for (const pu of pollaUsers) {
    results.push({
      cedula: pu.cedula,
      email: pu.email,
      name: pu.name,
      attemptsAllowed: pu.attemptsAllowed,
    });
  }
  return results;
}
