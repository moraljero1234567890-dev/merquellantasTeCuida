/**
 * Null userPredictedHome/Away for ALL R16 picks.
 * Leaves userPredictedWinner intact so users still get 50-pt direction
 * credit if they picked the right team — only exact-score inflation is removed.
 *
 * Usage:
 *   node scripts/null-r16-scores.mjs           (dry-run)
 *   node scripts/null-r16-scores.mjs --write   (apply to DB)
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";

const WRITE = process.argv.includes("--write");

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);

const predictions = await db.collection("polla_predictions").find({}).toArray();

let changed = 0;

for (const p of predictions) {
  if (!Object.keys(p.groupScores ?? {}).length) continue;

  const r16 = p.knockout?.r16;
  if (!r16?.length) continue;

  let modified = false;
  const newR16 = r16.map((pk) => {
    if (pk.userPredictedHome === null && pk.userPredictedAway === null) return pk;
    modified = true;
    return { ...pk, userPredictedHome: null, userPredictedAway: null };
  });

  if (!modified) continue;

  changed++;
  if (WRITE) {
    await db.collection("polla_predictions").updateOne(
      { _id: p._id },
      { $set: { "knockout.r16": newR16, updatedAt: new Date() } },
    );
  }
}

console.log(`${WRITE ? "Nulled" : "Would null"} R16 scores in ${changed} predictions.`);
if (!WRITE) console.log("Run with --write to apply.");
await client.close();
