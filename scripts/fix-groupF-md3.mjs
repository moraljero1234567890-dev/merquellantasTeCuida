// Repairs Group F matchday 3 after Wikipedia moved Tunisia–Japan into its own
// article (transcluded via {{#lst:}}), which made the position-based parser drop
// a box and shift every later match by one slot.
//
// Correct, user-predicted mapping (restored here):
//   wiki-GF5 = Japan vs Sweden     (md3)  -> 683 existing GF5 predictions are
//                                            already this fixture's guesses.
//   wiki-GF6 = Tunisia vs Netherlands(md3) -> recreate the doc + restore the
//                                            683 GF6 predictions stripped on
//                                            2026-06-22 (scripts/void-gf6-backup.json).
//
// PREREQUISITE: deploy the parser fix in src/lib/polla/wikipedia.ts FIRST. If
// the old (positional) parser refreshes after this runs, it reverts GF5 to
// Tunisia–Netherlands and re-creates the duplicate.
//
// Usage:
//   node scripts/fix-groupF-md3.mjs            # dry run (no writes)
//   node scripts/fix-groupF-md3.mjs --apply    # write changes
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";
import { readFileSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);
const matchesCol = db.collection("polla_matches");
const predsCol = db.collection("polla_predictions");

const backup = JSON.parse(readFileSync("scripts/void-gf6-backup.json", "utf8"));

// --- Build the canonical md3 fixtures (matches what the fixed parser emits) ---
const gf5 = {
  _id: "wiki-GF5",
  source: "wikipedia",
  externalId: "GF5",
  utcDate: "2026-06-25T23:00:00.000Z",
  date: "2026-06-25",
  time: "23:00",
  status: "SCHEDULED",
  stage: "GROUP_STAGE",
  stageLabel: "Fase de Grupos",
  group: "F",
  matchday: 3,
  venue: "",
  city: "",
  home: { code: "jp", name: "Japón", crest: "https://flagcdn.com/w80/jp.png" },
  away: { code: "se", name: "Suecia", crest: "https://flagcdn.com/w80/se.png" },
  score: null,
};
// GF6 = Tunisia vs Netherlands: reuse the exact doc that was voided on 06-22.
const gf6 = { ...backup.voidedMatch };

// --- Snapshot current state for rollback ---
const currentF = await matchesCol
  .find({ group: "F", stage: "GROUP_STAGE" })
  .toArray();
const ids = backup.affectedPredictions.map((p) => p._id);
const currentPreds = await predsCol
  .find({ _id: { $in: ids } }, { projection: { _id: 1, groupScores: 1 } })
  .toArray();

console.log("=== BEFORE ===");
for (const m of currentF.sort((a, b) => a._id.localeCompare(b._id, undefined, { numeric: true }))) {
  console.log(`  ${m._id}  md${m.matchday}  ${m.home?.code} v ${m.away?.code}  ${m.status}`);
}
console.log(`  (GF6 present: ${currentF.some((m) => m._id === "wiki-GF6")})`);

// Sanity guards before writing anything.
const gf5Now = currentF.find((m) => m._id === "wiki-GF5");
if (!gf5Now) throw new Error("wiki-GF5 missing — unexpected, aborting.");
if (gf5Now.status === "FINISHED") {
  throw new Error("wiki-GF5 is already FINISHED — do NOT overwrite a scored match. Aborting.");
}
const existingGf6 = currentF.find((m) => m._id === "wiki-GF6");
if (existingGf6 && (existingGf6.home?.code !== "tn" || existingGf6.away?.code !== "nl")) {
  throw new Error("wiki-GF6 exists with unexpected teams — aborting to avoid clobber.");
}

const restorable = backup.affectedPredictions.filter((p) => p.gf6Value);
console.log("\n=== PLAN ===");
console.log(`  set  wiki-GF5  -> jp v se (md3)        [was ${gf5Now.home?.code} v ${gf5Now.away?.code}]`);
console.log(`  upsert wiki-GF6 -> tn v nl (md3)`);
console.log(`  restore groupScores."wiki-GF6" on ${restorable.length} predictions`);

if (!APPLY) {
  console.log("\nDRY RUN — no changes written. Re-run with --apply (after deploying the parser fix).");
  await client.close();
  process.exit(0);
}

// --- Write rollback backup ---
const backupPath = `scripts/fix-groupF-md3-backup-${stamp}.json`;
writeFileSync(
  backupPath,
  JSON.stringify({ matchesBefore: currentF, predictionsBefore: currentPreds }, null, 2),
);
console.log(`\nRollback backup written: ${backupPath}`);

// --- Apply ---
await matchesCol.replaceOne({ _id: "wiki-GF5" }, gf5);
await matchesCol.replaceOne({ _id: "wiki-GF6" }, gf6, { upsert: true });

let restored = 0;
for (const p of restorable) {
  const r = await predsCol.updateOne(
    { _id: p._id },
    { $set: { "groupScores.wiki-GF6": { home: p.gf6Value.home, away: p.gf6Value.away } } },
  );
  if (r.matchedCount) restored += 1;
}

console.log("\n=== AFTER ===");
const afterF = await matchesCol
  .find({ group: "F", stage: "GROUP_STAGE" })
  .sort({ _id: 1 })
  .toArray();
for (const m of afterF.sort((a, b) => a._id.localeCompare(b._id, undefined, { numeric: true }))) {
  console.log(`  ${m._id}  md${m.matchday}  ${m.home?.code} v ${m.away?.code}  ${m.status}`);
}
console.log(`  GF6 predictions restored: ${restored}/${restorable.length}`);
console.log("\nDone.");
await client.close();
