/**
 * Null userPredictedHome/Away for ALL knockout picks (QF, SF, Final, third).
 * R32 and R16 were already handled by earlier scripts.
 * Leaves userPredictedWinner intact so users still get 50-pt direction credit.
 *
 * Usage:
 *   node scripts/null-ko-scores.mjs           (dry-run)
 *   node scripts/null-ko-scores.mjs --write   (apply to DB)
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

  const ko = p.knockout ?? {};
  let modified = false;
  const update = {};

  for (const stageKey of ["qf", "sf"]) {
    const arr = ko[stageKey];
    if (!arr?.length) continue;
    const nulled = arr.map((pk) => {
      if (pk.userPredictedHome === null && pk.userPredictedAway === null) return pk;
      modified = true;
      return { ...pk, userPredictedHome: null, userPredictedAway: null };
    });
    if (modified) update[`knockout.${stageKey}`] = nulled;
  }

  for (const stageKey of ["third", "final"]) {
    const pk = ko[stageKey];
    if (!pk) continue;
    if (pk.userPredictedHome === null && pk.userPredictedAway === null) continue;
    modified = true;
    update[`knockout.${stageKey}`] = { ...pk, userPredictedHome: null, userPredictedAway: null };
  }

  if (!modified) continue;

  changed++;
  if (WRITE) {
    update.updatedAt = new Date();
    await db.collection("polla_predictions").updateOne(
      { _id: p._id },
      { $set: update },
    );
  }
}

console.log(`${WRITE ? "Nulled" : "Would null"} QF/SF/Final scores in ${changed} predictions.`);
if (!WRITE) console.log("Run with --write to apply.");
await client.close();
