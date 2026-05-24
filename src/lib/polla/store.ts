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
  const { buildMatchSeed } = await import("./seed-data");
  const docs = buildMatchSeed();
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
    attemptsAllowed: Math.max(1, Math.min(20, Math.floor(input.attemptsAllowed))),
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
