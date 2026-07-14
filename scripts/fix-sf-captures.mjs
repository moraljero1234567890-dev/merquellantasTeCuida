/**
 * Unblock SF predictions that were zeroed by the null-ko-scores.mjs script.
 *
 * Problem: null-ko-scores.mjs set userPredictedHome/Away = null on all SF picks
 * as an anti-inflation measure. But for users who DID enter SF predictions,
 * home/away contain their real pick. The null captures (null vs undefined) make
 * isFirstOverwrite=false, so applyActual never re-derives their prediction and
 * scoring gives 0 pts for everyone's SF picks.
 *
 * Fix: for SF picks where home != null (user entered a prediction) AND
 * userPredictedHome === null (blocked by the null-ko script), remove all
 * userPredicted* fields (setting them to undefined). applyActual will then
 * re-capture correctly from home/away on every leaderboard computation.
 *
 * Usage:
 *   node scripts/fix-sf-captures.mjs           (dry-run)
 *   node scripts/fix-sf-captures.mjs --write   (apply to DB)
 */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
import { MongoClient } from 'mongodb';

const WRITE = process.argv.includes('--write');

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);

const predictions = await db.collection('polla_predictions').find({}).toArray();

let fixedPreds = 0, fixedPicks = 0;

for (const p of predictions) {
  if (!Object.keys(p.groupScores ?? {}).length) continue;
  const sf = p.knockout?.sf;
  if (!sf?.length) continue;

  let modified = false;
  const newSf = sf.map((pk) => {
    // Skip: user never entered a score
    if (pk.home == null) return pk;
    // Skip: captures already fine (either both are numbers, or both are undefined)
    if (pk.userPredictedHome !== null && pk.userPredictedAway !== null) return pk;

    // home/away has user's prediction but null captures block re-derivation.
    // Remove captures entirely so applyActual sees isFirstOverwrite=true.
    const fixed = { ...pk };
    delete fixed.userPredictedHome;
    delete fixed.userPredictedAway;
    delete fixed.userPredictedWinner;
    delete fixed.userPredictedDraw;
    modified = true;
    fixedPicks++;
    return fixed;
  });

  if (!modified) continue;
  fixedPreds++;

  if (WRITE) {
    await db.collection('polla_predictions').updateOne(
      { _id: p._id },
      { $set: { 'knockout.sf': newSf, updatedAt: new Date() } },
    );
  }
}

console.log(`${WRITE ? 'Fixed' : 'Would fix'} ${fixedPicks} SF picks across ${fixedPreds} predictions.`);
if (!WRITE) console.log('Run with --write to apply.');
await client.close();
