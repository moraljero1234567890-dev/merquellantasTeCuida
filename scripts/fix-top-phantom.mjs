/**
 * Targeted phantom fix for top-of-leaderboard users.
 *
 * Thresholds (clearly impossible for genuine predictors):
 *   R32: ≥13/16 exact → null those exact picks  (P ≈ 10^-12)
 *   R16: ≥7/8  exact → null those exact picks  (P ≈ 2.5×10^-6)
 *
 * Keeps genuinely-wrong picks and winner picks untouched.
 *
 * Usage:
 *   node scripts/fix-top-phantom.mjs           (dry-run)
 *   node scripts/fix-top-phantom.mjs --write   (apply to DB)
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";

const WRITE = process.argv.includes("--write");

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);

const [predictions, matches] = await Promise.all([
  db.collection("polla_predictions").find({}).toArray(),
  db.collection("polla_matches")
    .find({ stage: { $ne: "GROUP_STAGE" }, status: "FINISHED" })
    .toArray(),
]);

const realFT = new Map();
for (const m of matches) {
  const ft = m.score?.fullTime;
  if (!ft || !m.home?.code || !m.away?.code) continue;
  realFT.set([m.home.code, m.away.code].sort().join("|"), {
    homeCode: m.home.code,
    home: ft.home,
    away: ft.away,
  });
}

const R32_THRESHOLD = 13; // ≥13/16 exact R32 picks
const R16_THRESHOLD = 7;  // ≥7/8  exact R16 picks

let fixed = 0;

for (const p of predictions) {
  if (!Object.keys(p.groupScores ?? {}).length && p.userEmail !== "tiremaster22@aol.com") continue;

  const ko = JSON.parse(JSON.stringify(p.knockout ?? {}));
  let changed = false;

  for (const [stageKey, threshold] of [["r32", R32_THRESHOLD], ["r16", R16_THRESHOLD]]) {
    const picks = ko[stageKey] ?? [];
    let exactCount = 0;
    const exactIndices = [];

    for (let i = 0; i < picks.length; i++) {
      const pk = picks[i];
      if (!pk.homeTeamCode || !pk.awayTeamCode) continue;
      const real = realFT.get([pk.homeTeamCode, pk.awayTeamCode].sort().join("|"));
      if (!real) continue;
      const rH = real.homeCode === pk.homeTeamCode ? real.home : real.away;
      const rA = real.homeCode === pk.homeTeamCode ? real.away : real.home;
      const uH = typeof pk.userPredictedHome === "number" ? pk.userPredictedHome : pk.home;
      const uA = typeof pk.userPredictedAway === "number" ? pk.userPredictedAway : pk.away;
      if (uH == null) continue;
      if (uH === rH && uA === rA) {
        exactCount++;
        exactIndices.push(i);
      }
    }

    if (exactCount < threshold) continue;

    console.log(
      `  ${p.userEmail} att=${p.attempt} ${stageKey.toUpperCase()}: ${exactCount} exact picks → nulling`,
    );
    for (const i of exactIndices) {
      picks[i] = {
        ...picks[i],
        userPredictedHome: null,
        userPredictedAway: null,
        userPredictedWinner: null,
        userPredictedDraw: false,
      };
    }
    ko[stageKey] = picks;
    changed = true;
  }

  if (!changed) continue;
  fixed++;
  if (WRITE) {
    await db.collection("polla_predictions").updateOne(
      { _id: p._id },
      { $set: { knockout: ko, updatedAt: new Date() } },
    );
  }
}

console.log(`\n${WRITE ? "Fixed" : "Would fix"} ${fixed} predictions.`);
if (!WRITE) console.log("Run with --write to apply.");
await client.close();
