/**
 * Per-stage phantom cleanup.
 *
 * Problem: the previous restore script brought back phantom R32 picks for users
 * who had genuine wrong R16 picks, because the "genuine wrong" check was global
 * across all stages. A user can have phantom R32 (all 16 exact) and legitimate
 * R16 (some wrong scores) — these need to be treated independently.
 *
 * This script checks each stage separately. If ≥ THRESHOLD_PCT of picks in a
 * stage are exact matches with real results, those picks are phantom and get
 * nulled. Wrong picks in the same stage are left alone.
 *
 * Thresholds (≥ N exact picks before stage is considered phantom):
 *   R32: 10 / 16 (62.5%) — no real predictor gets >9 exact FT scores in 16 games
 *   R16:  5 /  8 (62.5%)
 *   QF:   3 /  4 (75%)
 *   SF:   2 /  2 (100%)
 *
 * Usage:
 *   node scripts/fix-phantom-by-stage.mjs            (dry-run)
 *   node scripts/fix-phantom-by-stage.mjs --write    (apply to DB)
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";

const WRITE_MODE = process.argv.includes("--write");

const STAGE_THRESHOLDS = {
  ROUND_OF_32: 7,   // ≥7/16 (44%+) exact picks in this stage → phantom
  ROUND_OF_16: 4,   // ≥4/8  (50%+) exact picks in this stage → phantom
  QUARTER_FINALS: 3,
  SEMI_FINALS: 2,
};

const STAGE_KEYS = {
  ROUND_OF_32: "r32",
  ROUND_OF_16: "r16",
  QUARTER_FINALS: "qf",
  SEMI_FINALS: "sf",
};

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

let totalFixed = 0, totalStagesFixed = 0;

for (const p of predictions) {
  const hasGroupPicks = Object.keys(p.groupScores ?? {}).length > 0;
  if (!hasGroupPicks) continue;

  let predModified = false;
  const knockoutCopy = JSON.parse(JSON.stringify(p.knockout));

  for (const [stage, stageKey] of Object.entries(STAGE_KEYS)) {
    const picks = knockoutCopy[stageKey] ?? [];
    if (!picks.length) continue;

    // For each pick with a real result, categorise as exact (phantom candidate) or different (legitimate)
    const finishedPicks = picks.map((pk) => {
      if (!pk.homeTeamCode || !pk.awayTeamCode) return null;
      const key = `${stage}|${[pk.homeTeamCode, pk.awayTeamCode].sort().join("|")}`;
      const real = realFT.get(key);
      if (!real) return null;
      const realHome = real.homeCode === pk.homeTeamCode ? real.home : real.away;
      const realAway = real.homeCode === pk.homeTeamCode ? real.away : real.home;
      const userHome = pk.userPredictedHome;
      const userAway = pk.userPredictedAway;
      if (typeof userHome !== "number" || typeof userAway !== "number") return null;
      const isExact = userHome === realHome && userAway === realAway;
      return { pk, realHome, realAway, isExact };
    }).filter(Boolean);

    const exactCount = finishedPicks.filter((r) => r.isExact).length;
    const threshold = STAGE_THRESHOLDS[stage];

    if (exactCount < threshold) continue; // legitimate, leave it

    // Too many exact picks in this stage — null the phantom-looking ones
    console.log(
      `  ${p.userEmail} att=${p.attempt} ${stage}: ${exactCount}/${finishedPicks.length} exact → nulling phantom picks`,
    );

    for (const { pk, isExact } of finishedPicks) {
      if (!isExact) continue; // leave genuine wrong picks
      const idx = picks.findIndex((q) => q.matchId === pk.matchId);
      if (idx < 0) continue;
      picks[idx] = {
        ...picks[idx],
        userPredictedHome: null,
        userPredictedAway: null,
        userPredictedWinner: null,
        userPredictedDraw: false,
      };
    }

    knockoutCopy[stageKey] = picks;
    predModified = true;
    totalStagesFixed++;
  }

  if (predModified) {
    totalFixed++;
    if (WRITE_MODE) {
      await db.collection("polla_predictions").updateOne(
        { _id: p._id },
        { $set: { knockout: knockoutCopy, updatedAt: new Date() } },
      );
    }
  }
}

console.log(`\n${WRITE_MODE ? "Fixed" : "Would fix"} ${totalFixed} predictions across ${totalStagesFixed} stage(s).`);
if (!WRITE_MODE) console.log("Run with --write to apply.");
await client.close();
