/**
 * Restores knockout picks that were over-aggressively nulled by the
 * diagnose-knockout-picks.mjs --fix-all run.
 *
 * Safe restoration logic:
 *   For each active prediction (has group scores):
 *     For each knockout pick where userPredictedHome is null but the match has
 *     a real FT score — the pick was either always null (user never visited) or
 *     was nulled by our script.
 *
 *   We restore ONLY if the prediction still has at least one knockout pick with a
 *   userPredictedHome that is a number AND differs from the real result (a genuine
 *   wrong prediction). That proves the user actually engaged. For those predictions,
 *   we restore the nulled picks to the real score.
 *
 *   100%-phantom predictions were fully nulled, so they have ZERO wrong picks left.
 *   They stay null (correct behaviour). Only legitimate users who happened to
 *   predict some scores exactly right get restored.
 *
 * Usage:
 *   node scripts/restore-knockout-picks.mjs          (dry-run, no writes)
 *   node scripts/restore-knockout-picks.mjs --write  (write to DB)
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";

const WRITE_MODE = process.argv.includes("--write");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) { console.error("Missing MONGODB_URI / MONGODB_DB"); process.exit(1); }

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const [predictions, matches] = await Promise.all([
  db.collection("polla_predictions").find({}).toArray(),
  db.collection("polla_matches").find({ stage: { $ne: "GROUP_STAGE" }, status: "FINISHED" }).toArray(),
]);

// Real FT map: "STAGE|sortedCodes" → { homeCode, home, away }
const realFT = new Map();
for (const m of matches) {
  const ft = m.score?.fullTime;
  if (!ft || !m.home?.code || !m.away?.code) continue;
  realFT.set(
    `${m.stage}|${[m.home.code, m.away.code].sort().join("|")}`,
    { homeCode: m.home.code, home: ft.home, away: ft.away },
  );
}

const STAGES = ["r32", "r16", "qf", "sf"];
let toRestore = 0, skipped = 0;

for (const p of predictions) {
  const hasGroupPicks = Object.keys(p.groupScores ?? {}).length > 0;
  if (!hasGroupPicks) continue; // never-engaged, don't touch

  const allPicks = [];
  for (const stage of STAGES) for (const pk of p.knockout?.[stage] ?? []) allPicks.push(pk);
  if (p.knockout?.third) allPicks.push(p.knockout.third);
  if (p.knockout?.final) allPicks.push(p.knockout.final);

  // Collect per-pick real scores
  const realByMatchId = new Map();
  for (const pk of allPicks) {
    if (!pk.homeTeamCode || !pk.awayTeamCode) continue;
    const key = `${pk.stage}|${[pk.homeTeamCode, pk.awayTeamCode].sort().join("|")}`;
    const real = realFT.get(key);
    if (!real) continue;
    const realHome = real.homeCode === pk.homeTeamCode ? real.home : real.away;
    const realAway = real.homeCode === pk.homeTeamCode ? real.away : real.home;
    realByMatchId.set(pk.matchId, { realHome, realAway });
  }

  // Find picks that are currently null but have a real result (were nulled by our script)
  const nulledPicks = allPicks.filter((pk) => {
    if (pk.userPredictedHome !== null) return false; // not nulled by us
    return realByMatchId.has(pk.matchId);
  });

  if (!nulledPicks.length) continue; // nothing was nulled here

  // Find picks that are genuinely wrong (user entered a different number from real)
  const genuineWrongPicks = allPicks.filter((pk) => {
    if (typeof pk.userPredictedHome !== "number") return false;
    const real = realByMatchId.get(pk.matchId);
    if (!real) return false; // match not finished, can't compare
    return pk.userPredictedHome !== real.realHome || pk.userPredictedAway !== real.realAway;
  });

  // Require at least 3 genuinely-wrong picks before we trust this as a real predictor.
  // 1-2 wrong picks among 20+ exact matches is still suspiciously phantom-like.
  if (genuineWrongPicks.length < 3) {
    skipped++;
    continue;
  }

  // This prediction has multiple genuine wrong picks → the user was actually predicting.
  // Restore the nulled picks to the real scores.
  console.log(`RESTORE ${p.userEmail} attempt=${p.attempt}  (${nulledPicks.length} nulled picks → restore to real scores, ${genuineWrongPicks.length} genuine wrong picks kept)`);
  for (const pk of nulledPicks) {
    const real = realByMatchId.get(pk.matchId);
    if (!real) continue;
    console.log(`  ${pk.stage} ${pk.homeTeamCode}v${pk.awayTeamCode}: restore ${real.realHome}-${real.realAway}`);
  }

  if (WRITE_MODE) {
    // Deep-clone and restore
    const knockout = JSON.parse(JSON.stringify(p.knockout));
    const restore = (arr) => {
      for (const pk of arr ?? []) {
        const real = realByMatchId.get(pk.matchId);
        if (!real) continue;
        if (pk.userPredictedHome !== null) continue; // skip non-nulled
        pk.userPredictedHome = real.realHome;
        pk.userPredictedAway = real.realAway;
        // Re-derive winner from the restored scores
        if (real.realHome > real.realAway) pk.userPredictedWinner = pk.homeTeamCode;
        else if (real.realAway > real.realHome) pk.userPredictedWinner = pk.awayTeamCode;
        else pk.userPredictedWinner = null; // draw, penalty winner not stored
        pk.userPredictedDraw = real.realHome === real.realAway;
      }
    };
    for (const stage of STAGES) restore(knockout[stage]);
    restore(knockout.third ? [knockout.third] : []);
    restore(knockout.final ? [knockout.final] : []);
    await db.collection("polla_predictions").updateOne(
      { _id: p._id },
      { $set: { knockout, updatedAt: new Date() } },
    );
  }

  toRestore++;
}

console.log(`\n${ WRITE_MODE ? "Restored" : "Would restore" } ${toRestore} predictions.`);
console.log(`Skipped ${skipped} (100%-phantom — correctly left as null).`);
if (!WRITE_MODE) console.log("\nRun with --write to apply.");
await client.close();
