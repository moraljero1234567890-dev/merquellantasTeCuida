/**
 * Option B phantom reset: for R32 and R16 picks where the user never entered a
 * score (userPredictedHome === null) but applyActual already wrote the real FT
 * score into home/away, reset home/away back to null so the bracket display is
 * clean and no future code path can mistake the real score for a user prediction.
 *
 * Leaves userPredictedWinner intact — users keep any 50-pt winner credit that
 * was legitimately inferred. Only the exact-score captures are cleaned.
 *
 * This script is idempotent: picks that are already clean (home === null) are
 * skipped untouched.
 *
 * Usage:
 *   node scripts/reset-phantom-home-scores.mjs            (dry-run)
 *   node scripts/reset-phantom-home-scores.mjs --write    (apply to DB)
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";

const WRITE = process.argv.includes("--write");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error("Missing MONGODB_URI / MONGODB_DB in .env.local");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const predictions = await db.collection("polla_predictions").find({}).toArray();
console.log(`Loaded ${predictions.length} predictions`);

let totalPreds = 0;
let totalPicks = 0;

for (const p of predictions) {
  if (!Object.keys(p.groupScores ?? {}).length) continue;

  const ko = p.knockout ?? {};
  let modified = false;
  const update = {};

  for (const stageKey of ["r32", "r16"]) {
    const arr = ko[stageKey];
    if (!arr?.length) continue;

    const newArr = arr.map((pk) => {
      // Only touch picks where user never entered a score (null captures) but
      // applyActual already wrote the real score into home/away.
      if (pk.userPredictedHome !== null) return pk;  // has a real or already-null capture
      if (pk.home == null && pk.away == null) return pk;  // already clean
      // home/away have a value but user never predicted — reset to null.
      modified = true;
      totalPicks++;
      return { ...pk, home: null, away: null };
    });

    if (modified) update[`knockout.${stageKey}`] = newArr;
  }

  if (!modified) continue;

  totalPreds++;
  console.log(`  ${WRITE ? "Fixed" : "Would fix"}: ${p.userEmail} attempt=${p.attempt}`);

  if (WRITE) {
    update.updatedAt = new Date();
    await db.collection("polla_predictions").updateOne(
      { _id: p._id },
      { $set: update },
    );
  }
}

console.log(`\n${WRITE ? "Reset" : "Would reset"} ${totalPicks} phantom home/away values across ${totalPreds} predictions.`);
if (!WRITE) console.log("Run with --write to apply.");

await client.close();
