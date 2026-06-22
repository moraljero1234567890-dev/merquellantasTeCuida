// READ-ONLY inspection of polla_matches for duplicates / missing games.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const col = db.collection("polla_matches");

const all = await col.find({}).toArray();
console.log(`TOTAL polla_matches docs: ${all.length}`);

// Stage / group breakdown
const byStage = {};
for (const m of all) byStage[m.stage] = (byStage[m.stage] || 0) + 1;
console.log("\nBy stage:", byStage);

// Group-stage breakdown by group + matchday
const groupCounts = {};
for (const m of all.filter((x) => x.stage === "GROUP_STAGE")) {
  const k = `${m.group}-md${m.matchday}`;
  groupCounts[k] = (groupCounts[k] || 0) + 1;
}
console.log("\nGroup stage per group/matchday (expect 2 matches each):");
console.log(Object.keys(groupCounts).sort().map((k) => `${k}:${groupCounts[k]}`).join("  "));

// --- DUPLICATE DETECTION ---
// A "fixture" = same two teams (order-insensitive) on same date.
function fixtureKey(m) {
  const a = m.home?.code ?? "?";
  const b = m.away?.code ?? "?";
  const pair = [a, b].sort().join("_");
  return `${m.stage}|${m.group ?? ""}|${m.matchday ?? ""}|${pair}`;
}
const seen = new Map();
for (const m of all) {
  const k = fixtureKey(m);
  if (!seen.has(k)) seen.set(k, []);
  seen.get(k).push(m);
}
const dups = [...seen.entries()].filter(([, v]) => v.length > 1);
console.log(`\n=== DUPLICATE FIXTURES (same teams/stage/group/matchday): ${dups.length} ===`);
for (const [k, group] of dups) {
  console.log(`\n  KEY ${k}  (${group.length} copies)`);
  for (const m of group) {
    const ft = m.score?.fullTime ? `${m.score.fullTime.home}-${m.score.fullTime.away}` : "—";
    console.log(`    _id=${m._id}  src=${m.source}  ${m.home?.code}v${m.away?.code}  ${m.date} ${m.time}  ${m.status}  score=${ft}`);
  }
}

// Also detect same-team-pair regardless of date (could be cross-matchday dup)
const byPair = new Map();
for (const m of all.filter((x) => x.stage === "GROUP_STAGE")) {
  const pair = [m.home?.code, m.away?.code].sort().join("_");
  const k = `${m.group}|${pair}`;
  if (!byPair.has(k)) byPair.set(k, []);
  byPair.get(k).push(m);
}
const pairDups = [...byPair.entries()].filter(([, v]) => v.length > 1);
console.log(`\n=== SAME TEAM PAIR within a group appearing >1 time: ${pairDups.length} ===`);
for (const [k, g] of pairDups) {
  console.log(`  ${k}: ${g.map((m) => `${m._id}(md${m.matchday},${m.date})`).join(", ")}`);
}

// Source breakdown
const bySource = {};
for (const m of all) bySource[m.source] = (bySource[m.source] || 0) + 1;
console.log("\nBy source:", bySource);

// Results present
const withScore = all.filter((m) => m.score?.fullTime);
const finished = all.filter((m) => m.status === "FINISHED");
console.log(`\nFINISHED: ${finished.length}   docs with fullTime score: ${withScore.length}`);

await client.close();
