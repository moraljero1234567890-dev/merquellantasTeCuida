/**
 * Diagnostic: show which users are getting knockout points from legacy
 * userPredictedHome/Away fields (i.e. they have no knockoutPicks entry and are
 * relying on the group-gate fallback). Flags users whose stored predictions
 * perfectly match the real match results on every single pick — the signature
 * of a phantom capture, not a genuine prediction.
 *
 * Usage:
 *   node scripts/diagnose-knockout-picks.mjs
 *   node scripts/diagnose-knockout-picks.mjs --fix    (writes corrected docs back to DB)
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";

const FIX_MODE = process.argv.includes("--fix");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB in .env.local");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

// ---------------------------------------------------------------------------
// 1. Load data
// ---------------------------------------------------------------------------
const [predictions, matches] = await Promise.all([
  db.collection("polla_predictions").find({}).toArray(),
  db.collection("polla_matches").find({ stage: { $ne: "GROUP_STAGE" }, status: "FINISHED" }).toArray(),
]);

console.log(`\nLoaded ${predictions.length} predictions, ${matches.length} finished knockout matches\n`);

// Build real FT score map: "STAGE|sortedCodes" → { homeCode, home, away }
const realFT = new Map();
for (const m of matches) {
  const ft = m.score?.fullTime;
  if (!ft || !m.home?.code || !m.away?.code) continue;
  const key = `${m.stage}|${[m.home.code, m.away.code].sort().join("|")}`;
  realFT.set(key, { homeCode: m.home.code, home: ft.home, away: ft.away });
}
console.log(`Real FT entries: ${realFT.size}`);

// ---------------------------------------------------------------------------
// 2. Analyse each prediction
// ---------------------------------------------------------------------------
const STAGES = ["r32", "r16", "qf", "sf", "third", "final"];

const report = [];

for (const p of predictions) {
  const hasGroupPicks = Object.keys(p.groupScores ?? {}).length > 0;
  const knockoutPicks = p.knockoutPicks ?? {};
  const hasKnockoutPicks = Object.keys(knockoutPicks).length > 0;

  // Collect all knockout picks
  const allPicks = [];
  for (const stage of ["r32", "r16", "qf", "sf"]) {
    for (const pick of p.knockout?.[stage] ?? []) allPicks.push(pick);
  }
  if (p.knockout?.third) allPicks.push(p.knockout.third);
  if (p.knockout?.final) allPicks.push(p.knockout.final);

  // For each finished pick, determine scoring source and whether it looks phantom
  const pickRows = [];
  for (const pick of allPicks) {
    if (!pick.homeTeamCode || !pick.awayTeamCode) continue;
    const key = `${pick.stage}|${[pick.homeTeamCode, pick.awayTeamCode].sort().join("|")}`;
    const real = realFT.get(key);
    if (!real) continue; // match not finished yet

    const realHome = real.homeCode === pick.homeTeamCode ? real.home : real.away;
    const realAway = real.homeCode === pick.homeTeamCode ? real.away : real.home;

    const explicitEntry = knockoutPicks[pick.matchId];
    const hasExplicit = explicitEntry && typeof explicitEntry.home === "number";

    let source, userHome, userAway;
    if (hasExplicit) {
      source = "knockoutPicks";
      userHome = explicitEntry.home;
      userAway = explicitEntry.away;
    } else if (hasGroupPicks && typeof pick.userPredictedHome === "number" && typeof pick.userPredictedAway === "number") {
      source = "legacy-userPredicted";
      userHome = pick.userPredictedHome;
      userAway = pick.userPredictedAway;
    } else {
      source = "none";
      userHome = null;
      userAway = null;
    }

    const isPhantomCandidate =
      source === "legacy-userPredicted" &&
      userHome === realHome &&
      userAway === realAway;

    const pts = (() => {
      if (userHome === null || userAway === null) return 0;
      if (userHome === realHome && userAway === realAway) return 100;
      const realIsDraw = realHome === realAway;
      const predIsDraw = userHome === userAway;
      if (realIsDraw && predIsDraw) return 50;
      if (!realIsDraw && !predIsDraw) {
        const rw = realHome > realAway ? pick.homeTeamCode : pick.awayTeamCode;
        const uw = userHome > userAway ? pick.homeTeamCode : pick.awayTeamCode;
        if (uw === rw) return 50;
      }
      return 0;
    })();

    pickRows.push({
      matchId: pick.matchId,
      stage: pick.stage,
      teams: `${pick.homeTeamCode}v${pick.awayTeamCode}`,
      real: `${realHome}-${realAway}`,
      user: userHome !== null ? `${userHome}-${userAway}` : "—",
      source,
      pts,
      isPhantomCandidate,
    });
  }

  const totalKoPts = pickRows.reduce((s, r) => s + r.pts, 0);
  const phantomPicks = pickRows.filter((r) => r.isPhantomCandidate);
  const legacyPicks = pickRows.filter((r) => r.source === "legacy-userPredicted");
  const explicitPicks = pickRows.filter((r) => r.source === "knockoutPicks");

  // Suspicious: using legacy fallback AND all/most legacy picks match real exactly
  const allLegacyArePhantom =
    legacyPicks.length > 0 && phantomPicks.length === legacyPicks.length;

  report.push({
    email: p.userEmail,
    attempt: p.attempt,
    hasGroupPicks,
    hasKnockoutPicks,
    finishedPickCount: pickRows.length,
    explicitCount: explicitPicks.length,
    legacyCount: legacyPicks.length,
    phantomCount: phantomPicks.length,
    allLegacyArePhantom,
    totalKoPts,
    pickRows,
    _id: p._id,
  });
}

// ---------------------------------------------------------------------------
// 3. Print summary
// ---------------------------------------------------------------------------

const noGroupPicks = report.filter((r) => !r.hasGroupPicks);
const withGroupNoKo = report.filter((r) => r.hasGroupPicks && !r.hasKnockoutPicks && r.legacyCount > 0);
const suspicious = report.filter((r) => r.allLegacyArePhantom);
const cleanLegacy = report.filter((r) => r.legacyCount > 0 && !r.allLegacyArePhantom);

console.log("=".repeat(72));
console.log("SUMMARY");
console.log("=".repeat(72));
console.log(`Total predictions:          ${report.length}`);
console.log(`  No group picks (gate OFF): ${noGroupPicks.length}  → 0 KO pts (correct)`);
console.log(`  Has group picks, no knockoutPicks entry yet, uses legacy: ${withGroupNoKo.length}`);
console.log(`    Of those — ALL legacy picks match real scores (phantom): ${suspicious.length}`);
console.log(`    Of those — some/all picks differ from real (likely legit): ${cleanLegacy.length}`);
console.log("");

if (suspicious.length) {
  console.log("=".repeat(72));
  console.log("PHANTOM CAPTURES — all stored picks exactly match real results");
  console.log("  These users never entered scores; the bug captured real scores.");
  console.log("=".repeat(72));
  for (const r of suspicious) {
    console.log(`\n  ${r.email}  attempt=${r.attempt}  KO pts earned: ${r.totalKoPts}`);
    for (const pk of r.pickRows) {
      const flag = pk.isPhantomCandidate ? " *** PHANTOM" : "";
      console.log(`    ${pk.stage.padEnd(14)} ${pk.teams.padEnd(12)} real=${pk.real}  user=${pk.user}  src=${pk.source}  ${pk.pts}pts${flag}`);
    }
  }
}

if (cleanLegacy.length) {
  console.log("\n" + "=".repeat(72));
  console.log("LEGACY (some picks differ from real — likely genuinely entered)");
  console.log("=".repeat(72));
  for (const r of cleanLegacy) {
    console.log(`\n  ${r.email}  attempt=${r.attempt}  KO pts earned: ${r.totalKoPts}  (${r.phantomCount} phantom-looking, ${r.legacyCount - r.phantomCount} different)`);
    for (const pk of r.pickRows.filter((pk) => pk.source === "legacy-userPredicted")) {
      const flag = pk.isPhantomCandidate ? "  *** matches real" : "";
      console.log(`    ${pk.stage.padEnd(14)} ${pk.teams.padEnd(12)} real=${pk.real}  user=${pk.user}  ${pk.pts}pts${flag}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Optional fix: null out confirmed phantom picks
// ---------------------------------------------------------------------------
if (FIX_MODE) {
  console.log("\n" + "=".repeat(72));
  console.log("FIX MODE — nulling userPredictedHome/Away/Winner on phantom picks");
  console.log("=".repeat(72));

  const col = db.collection("polla_predictions");
  let fixed = 0;

  for (const r of suspicious) {
    // Build updated knockout object with phantom picks cleared
    const pred = predictions.find((p) => String(p._id) === String(r._id));
    if (!pred) continue;

    const phantomMatchIds = new Set(r.pickRows.filter((pk) => pk.isPhantomCandidate).map((pk) => pk.matchId));
    if (!phantomMatchIds.size) continue;

    // Deep-clone knockout and clear phantom userPredicted* fields
    const knockout = JSON.parse(JSON.stringify(pred.knockout));
    for (const stage of ["r32", "r16", "qf", "sf"]) {
      for (const pick of knockout[stage] ?? []) {
        if (phantomMatchIds.has(pick.matchId)) {
          pick.userPredictedHome = null;
          pick.userPredictedAway = null;
          pick.userPredictedWinner = null;
          pick.userPredictedDraw = false;
        }
      }
    }
    for (const key of ["third", "final"]) {
      if (knockout[key] && phantomMatchIds.has(knockout[key].matchId)) {
        knockout[key].userPredictedHome = null;
        knockout[key].userPredictedAway = null;
        knockout[key].userPredictedWinner = null;
        knockout[key].userPredictedDraw = false;
      }
    }

    await col.updateOne(
      { _id: pred._id },
      { $set: { knockout, updatedAt: new Date() } },
    );
    console.log(`  Fixed: ${r.email} attempt=${r.attempt} (${phantomMatchIds.size} picks cleared)`);
    fixed++;
  }
  console.log(`\nDone. Fixed ${fixed} predictions.`);
} else {
  console.log("\nRun with --fix to null out phantom picks in the DB.");
}

await client.close();
