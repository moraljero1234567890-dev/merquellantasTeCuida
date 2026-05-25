/**
 * One-off: flips a fondo_ciclos doc's `estado` to `rechazado` so it stops
 * showing as approved in the Ciclo Actual view. Side effects already
 * applied to saldos/cartera are NOT touched — see hard revert if needed.
 *
 * Usage:
 *   npx tsx scripts/soft-revert-ciclo.ts <ciclo_id>           # dry run
 *   npx tsx scripts/soft-revert-ciclo.ts <ciclo_id> --confirm
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { MongoClient, ObjectId } from 'mongodb';

const envLocal = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: false });

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = process.env.MONGODB_DB || 'merque_bienestar';

async function main() {
  const cicloId = process.argv[2];
  const confirm = process.argv.includes('--confirm');
  if (!cicloId) {
    console.error('Falta el ciclo_id');
    process.exit(1);
  }
  const client = await new MongoClient(MONGODB_URI).connect();
  const db = client.db(DB_NAME);

  const before = await db.collection('fondo_ciclos').findOne({ _id: new ObjectId(cicloId) });
  if (!before) {
    console.error(`No existe fondo_ciclos[_id=${cicloId}]`);
    process.exit(1);
  }
  console.log('Antes:', { _id: before._id.toString(), periodo: before.periodo, estado: before.estado });

  if (!confirm) {
    console.log('\nDry run — pasa --confirm para aplicar.');
    await client.close();
    return;
  }

  await db.collection('fondo_ciclos').updateOne(
    { _id: new ObjectId(cicloId) },
    {
      $set: {
        estado: 'rechazado',
        motivo_rechazo: 'Soft revert: ciclo no se ejecutó realmente, se descarta sin tocar saldos.',
        reverted_at: new Date(),
        prev_estado: before.estado,
      },
    },
  );

  const after = await db.collection('fondo_ciclos').findOne({ _id: new ObjectId(cicloId) });
  console.log('Después:', { _id: after!._id.toString(), periodo: after!.periodo, estado: after!.estado });
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
