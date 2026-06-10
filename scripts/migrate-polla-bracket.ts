/**
 * One-off: re-maps every existing polla prediction onto the corrected 2026
 * World Cup knockout bracket (Annex C structure) WITHOUT asking anyone to fill
 * their boleta again.
 *
 * The group-stage scores people entered are untouched — they are the source of
 * truth and were never affected by the bracket bug. From those scores we rebuild
 * the (now correct) Round of 32 seeding and then ESTIMATE each knockout pick so
 * it stays as close as possible to what the person originally intended:
 *
 *   1. Exact head-to-head reuse: if the same two teams met anywhere in the
 *      person's OLD bracket, we reuse that exact scoreline (and penalty winner).
 *   2. Team-strength ranking: for any new matchup we didn't have, the team the
 *      person advanced FURTHER in their old bracket wins (so their champion,
 *      finalists, etc. are preserved wherever the new bracket lets them survive).
 *   3. Personal scoreline style: invented winning scores use the margin that
 *      person used most often in their own knockout picks (default 2-1).
 *
 * Usage:
 *   npx tsx scripts/migrate-polla-bracket.ts --dry     # preview, no writes
 *   npx tsx scripts/migrate-polla-bracket.ts           # apply
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import {
  computeGroupStandings,
  buildKnockoutFromGroup,
  championFromFinal,
} from '../src/lib/polla/bracket';
import type { KnockoutPick, PredictionDoc } from '../src/lib/polla/types';

const envLocal = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: false });

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = process.env.MONGODB_DB || 'merque_bienestar';
const DRY = process.argv.includes('--dry');

const STAGE_LEVEL: Record<string, number> = {
  ROUND_OF_32: 1,
  ROUND_OF_16: 2,
  QUARTER_FINALS: 3,
  SEMI_FINALS: 4,
  THIRD_PLACE: 4,
  FINAL: 5,
};

function winnerCode(p: KnockoutPick): string | null {
  if (p.home == null || p.away == null) return null;
  if (p.home > p.away) return p.homeTeamCode;
  if (p.away > p.home) return p.awayTeamCode;
  if (p.penaltyWinner === 'home') return p.homeTeamCode;
  if (p.penaltyWinner === 'away') return p.awayTeamCode;
  return null;
}

function allOldPicks(ko: PredictionDoc['knockout']): KnockoutPick[] {
  return [
    ...ko.r32,
    ...ko.r16,
    ...ko.qf,
    ...ko.sf,
    ...(ko.third ? [ko.third] : []),
    ...(ko.final ? [ko.final] : []),
  ];
}

type Estimator = {
  depth: Record<string, number>;
  h2h: Map<string, { home: string; away: string; h: number; a: number; pen: KnockoutPick['penaltyWinner'] }>;
  margin: { hi: number; lo: number };
};

function buildEstimator(oldKo: PredictionDoc['knockout']): Estimator {
  const picks = allOldPicks(oldKo);
  const depth: Record<string, number> = {};
  const bump = (code: string, lvl: number) => {
    if (!code) return;
    depth[code] = Math.max(depth[code] ?? 0, lvl);
  };
  const h2h: Estimator['h2h'] = new Map();
  const marginCount: Record<string, number> = {};

  for (const p of picks) {
    const lvl = STAGE_LEVEL[p.stage] ?? 1;
    bump(p.homeTeamCode, lvl);
    bump(p.awayTeamCode, lvl);
    const w = winnerCode(p);
    if (w) bump(w, lvl + 1);

    if (p.home != null && p.away != null) {
      const key = [p.homeTeamCode, p.awayTeamCode].sort().join('|');
      if (!h2h.has(key)) {
        h2h.set(key, { home: p.homeTeamCode, away: p.awayTeamCode, h: p.home, a: p.away, pen: p.penaltyWinner });
      }
      if (p.home !== p.away) {
        const hi = Math.max(p.home, p.away);
        const lo = Math.min(p.home, p.away);
        marginCount[`${hi}-${lo}`] = (marginCount[`${hi}-${lo}`] ?? 0) + 1;
      }
    }
  }

  let margin = { hi: 2, lo: 1 };
  let best = 0;
  for (const k of Object.keys(marginCount)) {
    if (marginCount[k] > best) {
      best = marginCount[k];
      const [hi, lo] = k.split('-').map(Number);
      margin = { hi, lo };
    }
  }
  return { depth, h2h, margin };
}

function fillPick(p: KnockoutPick, est: Estimator): KnockoutPick {
  // Can't fill a slot whose teams aren't resolved yet (incomplete upstream).
  if (!p.homeTeamCode || !p.awayTeamCode) return p;
  // Already has a score (preserved exact matchup) — leave it.
  if (p.home != null && p.away != null) return p;

  const key = [p.homeTeamCode, p.awayTeamCode].sort().join('|');
  const rec = est.h2h.get(key);
  if (rec) {
    if (rec.home === p.homeTeamCode) {
      return { ...p, home: rec.h, away: rec.a, penaltyWinner: rec.pen };
    }
    const pen = rec.pen === 'home' ? 'away' : rec.pen === 'away' ? 'home' : null;
    return { ...p, home: rec.a, away: rec.h, penaltyWinner: pen };
  }

  const dh = est.depth[p.homeTeamCode] ?? 0;
  const da = est.depth[p.awayTeamCode] ?? 0;
  const homeWins = dh >= da; // tie -> home (higher group seed sits home)
  return homeWins
    ? { ...p, home: est.margin.hi, away: est.margin.lo, penaltyWinner: null }
    : { ...p, home: est.margin.lo, away: est.margin.hi, penaltyWinner: null };
}

type GroupMatch = {
  _id: string;
  group: string | null;
  home: { code: string; name: string; crest: string };
  away: { code: string; name: string; crest: string };
};

function estimateKnockout(
  standings: Record<string, ReturnType<typeof computeGroupStandings>[string]>,
  oldKo: PredictionDoc['knockout'],
): { knockout: PredictionDoc['knockout']; champion: PredictionDoc['champion'] } {
  const est = buildEstimator(oldKo);

  // Round by round: fill scores, then rebuild so winners propagate to the next
  // round (buildKnockoutFromGroup preserves filled scores where teams match).
  let ko = buildKnockoutFromGroup(standings, oldKo);
  ko.r32 = ko.r32.map((p) => fillPick(p, est));
  ko = buildKnockoutFromGroup(standings, ko);
  ko.r16 = ko.r16.map((p) => fillPick(p, est));
  ko = buildKnockoutFromGroup(standings, ko);
  ko.qf = ko.qf.map((p) => fillPick(p, est));
  ko = buildKnockoutFromGroup(standings, ko);
  ko.sf = ko.sf.map((p) => fillPick(p, est));
  ko = buildKnockoutFromGroup(standings, ko);
  if (ko.third) ko.third = fillPick(ko.third, est);
  if (ko.final) ko.final = fillPick(ko.final, est);

  return { knockout: ko, champion: championFromFinal(ko.final) };
}

async function main() {
  const client = await new MongoClient(MONGODB_URI).connect();
  const db = client.db(DB_NAME);

  const groupMatches = (await db
    .collection('polla_matches')
    .find({ stage: 'GROUP_STAGE' })
    .toArray()) as unknown as GroupMatch[];
  const groupForStandings = groupMatches.filter((m) => m.group);
  console.log(`Loaded ${groupForStandings.length} group matches.`);

  const predictions = (await db
    .collection('polla_predictions')
    .find({})
    .toArray()) as unknown as PredictionDoc[];
  console.log(`Loaded ${predictions.length} predictions.\n`);

  let migrated = 0;
  let skippedNoSignal = 0;
  let skippedNoGroup = 0;

  for (const pred of predictions) {
    const oldPicks = allOldPicks(pred.knockout);
    const hasSignal =
      pred.status === 'complete' || oldPicks.some((p) => p.home != null && p.away != null);
    if (!hasSignal) {
      skippedNoSignal++;
      continue;
    }

    const groupScoreCount = Object.keys(pred.groupScores ?? {}).length;
    if (groupScoreCount < 72) {
      // Not enough to seed a full bracket — leave the draft for the user to finish.
      skippedNoGroup++;
      continue;
    }

    const standings = computeGroupStandings(groupForStandings, pred.groupScores);
    const { knockout, champion } = estimateKnockout(standings, pred.knockout);

    const allKnockoutFilled = allOldPicks(knockout).every(
      (p) => p.home != null && p.away != null,
    );
    const status: PredictionDoc['status'] =
      pred.status === 'complete'
        ? 'complete'
        : allKnockoutFilled && champion
          ? 'complete'
          : pred.status;

    const update: Partial<PredictionDoc> = {
      knockout,
      champion,
      status,
      updatedAt: new Date(),
    };
    if (status === 'complete' && !pred.completedAt) update.completedAt = new Date();

    const oldChamp = pred.champion?.name ?? '—';
    const newChamp = champion?.name ?? '—';
    const champFlag = oldChamp !== newChamp ? '  ⚠ CHAMPION CHANGED' : '';
    console.log(
      `${pred._id}  status=${pred.status}->${status}  champion=${oldChamp}->${newChamp}  filled=${allOldPicks(knockout).filter((p) => p.home != null).length}/32${champFlag}`,
    );

    if (!DRY) {
      await db
        .collection('polla_predictions')
        .updateOne({ _id: pred._id as unknown as object }, { $set: update });
    }
    migrated++;
  }

  console.log(
    `\n${DRY ? '[DRY RUN] ' : ''}Migrated: ${migrated}  |  skipped (no knockout signal): ${skippedNoSignal}  |  skipped (group <72): ${skippedNoGroup}`,
  );
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
