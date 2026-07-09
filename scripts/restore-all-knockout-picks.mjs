/**
 * Full DB restore: set all currently-null knockout userPredicted* fields back
 * to real FT scores for every prediction that has group-stage picks.
 *
 * This undoes all the phantom-fix null operations and returns the DB to the
 * original state where applyActual had captured real scores as phantom picks.
 *
 * Usage:
 *   node scripts/restore-all-knockout-picks.mjs           (dry-run)
 *   node scripts/restore-all-knockout-picks.mjs --write   (apply to DB)
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

// Real FT map: "sortedCodes" → { homeCode, home, away }  (stage-agnostic lookup)
const realFT = new Map();
for (const m of matches) {
  const ft = m.score?.fullTime;
  if (!ft || !m.home?.code || !m.away?.code) continue;
  const key = [m.home.code, m.away.code].sort().join("|");
  realFT.set(key, { homeCode: m.home.code, home: ft.home, away: ft.away });
}

const STAGES = ["r32", "r16", "qf", "sf"];
let restored = 0, skipped = 0;

for (const p of predictions) {
  const hasGroupPicks = Object.keys(p.groupScores ?? {}).length > 0;
  if (!hasGroupPicks) { skipped++; continue; }

  const knockout = JSON.parse(JSON.stringify(p.knockout ?? {}));
  let changed = false;

  const restoreArr = (arr) => {
    for (const pk of arr ?? []) {
      if (!pk.homeTeamCode || !pk.awayTeamCode) continue;
      if (pk.userPredictedHome !== null) continue; // not nulled, leave it

      const key = [pk.homeTeamCode, pk.awayTeamCode].sort().join("|");
      const real = realFT.get(key);
      if (!real) continue; // match not finished, nothing to restore

      const realHome = real.homeCode === pk.homeTeamCode ? real.home : real.away;
      const realAway = real.homeCode === pk.homeTeamCode ? real.away : real.home;
      const isDraw = realHome === realAway;
      const winner = isDraw ? null : realHome > realAway ? pk.homeTeamCode : pk.awayTeamCode;

      pk.userPredictedHome = realHome;
      pk.userPredictedAway = realAway;
      pk.userPredictedWinner = winner;
      pk.userPredictedDraw = isDraw;
      changed = true;
    }
  };

  for (const stage of STAGES) restoreArr(knockout[stage]);
  if (knockout.third) restoreArr([knockout.third]);
  if (knockout.final) restoreArr([knockout.final]);

  if (!changed) continue;

  console.log(`RESTORE ${p.userEmail} attempt=${p.attempt}`);
  restored++;

  if (WRITE_MODE) {
    await db.collection("polla_predictions").updateOne(
      { _id: p._id },
      { $set: { knockout, updatedAt: new Date() } },
    );
  }
}

console.log(`\n${WRITE_MODE ? "Restored" : "Would restore"} ${restored} predictions.`);
console.log(`Skipped ${skipped} (no group picks — correctly left untouched).`);
if (!WRITE_MODE) console.log("Run with --write to apply.");
await client.close();
