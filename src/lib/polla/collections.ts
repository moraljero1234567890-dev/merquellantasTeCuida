import "server-only";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/db";
import type { MatchDoc, PredictionDoc } from "./types";

export type PollaUserDoc = {
  _id: string;
  cedula: string;
  email: string;
  name: string;
  attemptsAllowed: number;
  passwordHash: string;
  createdAt: Date;
};

export async function pollaMatchesCollection(): Promise<Collection<MatchDoc>> {
  const db = await getDb();
  return db.collection<MatchDoc>("polla_matches");
}

export async function pollaPredictionsCollection(): Promise<Collection<PredictionDoc>> {
  const db = await getDb();
  return db.collection<PredictionDoc>("polla_predictions");
}

export async function pollaUsersCollection(): Promise<Collection<PollaUserDoc>> {
  const db = await getDb();
  return db.collection<PollaUserDoc>("polla_users");
}
