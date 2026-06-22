// Void the duplicated Group F md3 fixture (wiki-GF6 == wiki-GF5, both Túnez v
// Países Bajos). Deletes the duplicate match and strips the now-dead
// groupScores.wiki-GF6 key from predictions. Backs everything up first.
//
// Idempotent: re-running after success is a no-op.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";
import { writeFileSync } from "fs";

const DUP_ID = "wiki-GF6";
const KEEP_ID = "wiki-GF5";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);
const matches = db.collection("polla_matches");
const preds = db.collection("polla_predictions");

// --- Safety check: confirm KEEP and DUP really are the same fixture ---
const dup = await matches.findOne({ _id: DUP_ID });
const keep = await matches.findOne({ _id: KEEP_ID });
if (!dup) {
  console.log(`${DUP_ID} not present — nothing to void (already done?). Exiting.`);
  await client.close();
  process.exit(0);
}
if (!keep) {
  console.log(`ABORT: ${KEEP_ID} (the one we keep) is missing. Refusing to delete the only copy.`);
  await client.close();
  process.exit(1);
}
const samePair =
  [dup.home.code, dup.away.code].sort().join() ===
  [keep.home.code, keep.away.code].sort().join();
if (!samePair) {
  console.log(`ABORT: ${DUP_ID} (${dup.home.code}v${dup.away.code}) is NOT the same pairing as ${KEEP_ID} (${keep.home.code}v${keep.away.code}). Not a duplicate — refusing.`);
  await client.close();
  process.exit(1);
}
if (dup.status === "FINISHED" && dup.score?.fullTime) {
  console.log(`ABORT: ${DUP_ID} already has a recorded result — manual review needed.`);
  await client.close();
  process.exit(1);
}

console.log(`Voiding duplicate ${DUP_ID} (${dup.home.code} v ${dup.away.code}); keeping ${KEEP_ID}.`);

// --- Backup ---
const affected = await preds.find({ [`groupScores.${DUP_ID}`]: { $exists: true } }).toArray();
const backup = {
  voidedMatch: dup,
  keptMatch: { _id: keep._id, home: keep.home.code, away: keep.away.code, date: keep.date },
  affectedPredictions: affected.map((p) => ({ _id: p._id, gf6Value: p.groupScores[DUP_ID] })),
};
const backupPath = `scripts/void-gf6-backup.json`;
writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`Backed up ${affected.length} affected predictions + the match doc -> ${backupPath}`);

// --- Apply ---
const del = await matches.deleteOne({ _id: DUP_ID });
console.log(`Deleted from polla_matches: ${del.deletedCount}`);

const unset = await preds.updateMany(
  { [`groupScores.${DUP_ID}`]: { $exists: true } },
  { $unset: { [`groupScores.${DUP_ID}`]: "" } },
);
console.log(`Stripped groupScores.${DUP_ID} from predictions: matched ${unset.matchedCount}, modified ${unset.modifiedCount}`);

// --- Verify ---
const stillThere = await matches.countDocuments({ _id: DUP_ID });
const stillRef = await preds.countDocuments({ [`groupScores.${DUP_ID}`]: { $exists: true } });
const totalMatches = await matches.estimatedDocumentCount();
const groupF = await matches.find({ stage: "GROUP_STAGE", group: "F" }).sort({ matchday: 1 }).toArray();
console.log(`\n--- VERIFY ---`);
console.log(`wiki-GF6 in matches: ${stillThere} (want 0)`);
console.log(`predictions still referencing wiki-GF6: ${stillRef} (want 0)`);
console.log(`total matches now: ${totalMatches} (was 104, want 103)`);
console.log(`Group F now (${groupF.length} games):`);
for (const m of groupF) console.log(`  md${m.matchday}  ${m._id}  ${m.home.code} v ${m.away.code}`);

await client.close();
