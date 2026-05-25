/**
 * One-off: dumps every fondo_ciclos document for a given periodo so we can
 * see why the UI is showing an unexpected estado.
 *
 * Usage:
 *   npx tsx scripts/inspect-ciclo.ts 2026-04-B
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

const envLocal = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: false });

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = process.env.MONGODB_DB || 'merque_bienestar';

async function main() {
  const periodo = process.argv[2];
  if (!periodo) {
    console.error('Falta el periodo (ej: 2026-04-B)');
    process.exit(1);
  }
  const client = await new MongoClient(MONGODB_URI).connect();
  const db = client.db(DB_NAME);

  const docs = await db
    .collection('fondo_ciclos')
    .find({ periodo })
    .sort({ created_at: -1 })
    .toArray();

  console.log(`\nfondo_ciclos for periodo=${periodo}: ${docs.length} doc(s)\n`);
  for (const d of docs) {
    console.log({
      _id: d._id.toString(),
      periodo: d.periodo,
      estado: d.estado,
      revision_count: d.revision_count,
      created_by: d.created_by,
      created_at: d.created_at,
      approved_by: d.approved_by,
      approved_at: d.approved_at,
      ajustes_admin_at: d.ajustes_admin_at,
      movimientos_count: Array.isArray(d.movimientos) ? d.movimientos.length : 0,
    });
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
