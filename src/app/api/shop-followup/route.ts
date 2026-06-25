import { NextRequest, NextResponse } from 'next/server';
import { GridFSBucket, ObjectId } from 'mongodb';
import { getDb } from '../../../lib/db';
import { auth } from '../../../lib/auth';

const COLLECTION = 'shop_followups';

// Two weeks. Photos are purged this long after a report is created; the
// scorecard and comments stay forever for the historic view.
const IMAGE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// The five photo slots a shop must document each week. Keys are mirrored on the
// client (page.tsx) — keep both lists in sync.
const FOTO_KEYS = [
  'fachada',
  'punto_pago',
  'panoramica_interna',
  'bodega',
  'lubricentro_exhibicion',
] as const;

// The four dimensions the admin scores each shop on (1–5).
const SCORE_KEYS = [
  'brand_compliance',
  'visual_standards',
  'reviews',
  'customer_satisfaction',
] as const;

interface Foto {
  id: string;
  url: string;
  name: string;
}
type FotoMap = Record<string, Foto | null>;

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}

// ISO-8601 week key, e.g. "2026-W26". One report per shop (ciudad) per week, so
// this is half of the report's natural key.
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const year = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4)); // Jan 4 is always week 1
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function emptyFotos(): FotoMap {
  const out: FotoMap = {};
  for (const k of FOTO_KEYS) out[k] = null;
  return out;
}

// Keep only well-formed { id, url, name } entries for the known slots; anything
// else becomes null. The id must be a valid GridFS ObjectId.
function normalizeFotos(input: unknown): FotoMap {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = emptyFotos();
  for (const k of FOTO_KEYS) {
    const f = src[k] as Record<string, unknown> | null | undefined;
    if (f && typeof f === 'object' && typeof f.id === 'string' && ObjectId.isValid(f.id) && typeof f.url === 'string') {
      out[k] = { id: f.id, url: f.url, name: clean(f.name) };
    }
  }
  return out;
}

// Delete from GridFS every photo in `prev` that the next version drops or
// replaces, so editing a report never orphans files.
async function deleteReplacedFotos(
  db: Awaited<ReturnType<typeof getDb>>,
  prev: FotoMap | undefined,
  next: FotoMap,
) {
  if (!prev) return;
  const bucket = new GridFSBucket(db, { bucketName: 'uploads' });
  for (const k of FOTO_KEYS) {
    const before = prev[k];
    const after = next[k];
    if (before?.id && before.id !== after?.id && ObjectId.isValid(before.id)) {
      try { await bucket.delete(new ObjectId(before.id)); } catch { /* already gone */ }
    }
  }
}

// Two-week image purge. Runs whenever an admin loads the page: any report older
// than the TTL has its GridFS photos deleted and its photo references cleared,
// while the scorecard/comments survive for history.
async function purgeOldImages(db: Awaited<ReturnType<typeof getDb>>) {
  const cutoff = new Date(Date.now() - IMAGE_TTL_MS);
  const stale = await db
    .collection(COLLECTION)
    .find({ images_purged: { $ne: true }, created_at: { $lt: cutoff } })
    .toArray();
  if (!stale.length) return;

  const bucket = new GridFSBucket(db, { bucketName: 'uploads' });
  for (const doc of stale) {
    const fotos = (doc.fotos || {}) as FotoMap;
    for (const k of FOTO_KEYS) {
      const f = fotos[k];
      if (f?.id && ObjectId.isValid(f.id)) {
        try { await bucket.delete(new ObjectId(f.id)); } catch { /* already gone */ }
      }
    }
    await db.collection(COLLECTION).updateOne(
      { _id: doc._id },
      { $set: { fotos: emptyFotos(), images_purged: true, images_purged_at: new Date() } },
    );
  }
}

// Canonical shop list = every distinct, non-empty `ciudad` on a user. Used so
// the admin "this week" view can show pending shops that haven't submitted yet.
async function allShopCities(db: Awaited<ReturnType<typeof getDb>>): Promise<string[]> {
  const raw = await db.collection('users').distinct('ciudad');
  return raw
    .map((c) => clean(c))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));
}

// GET /api/shop-followup
//   ?view=current    (default) this week's report(s)
//                      - admin: every shop city with its report (or null = pending)
//                      - shop user: their own city's report (or null)
//   ?view=historial  past reports newest-first (admin: all/filtered by ?ciudad)
//   ?ciudades=true   admin-only distinct shop city list
// Any admin request first triggers the two-week image purge.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const rol = session.user.rol;
  if (rol === 'externo' || rol === 'fondo') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const isAdmin = rol === 'admin';
  const { searchParams } = new URL(req.url);
  const db = await getDb();
  const semana = isoWeekKey(new Date());

  // Every admin visit prunes images older than two weeks.
  if (isAdmin) await purgeOldImages(db);

  if (isAdmin && searchParams.get('ciudades') === 'true') {
    return NextResponse.json({ ciudades: await allShopCities(db) });
  }

  const view = searchParams.get('view') || 'current';

  if (view === 'historial') {
    const filter: Record<string, unknown> = {};
    if (isAdmin) {
      const c = (searchParams.get('ciudad') || '').trim();
      if (c) filter.ciudad = c;
    } else {
      // A shop only sees its own history.
      filter.ciudad = clean(session.user.ciudad);
      if (!filter.ciudad) return NextResponse.json({ results: [] });
    }
    const results = await db
      .collection(COLLECTION)
      .find(filter)
      .sort({ created_at: -1 })
      .limit(400)
      .toArray();
    return NextResponse.json({ results });
  }

  // view = current
  if (isAdmin) {
    const docs = await db.collection(COLLECTION).find({ semana }).toArray();
    const byCity = new Map<string, (typeof docs)[number]>();
    for (const d of docs) byCity.set(clean(d.ciudad), d);

    const cities = await allShopCities(db);
    // Include any city that submitted but isn't in the user-derived master list.
    for (const d of docs) {
      const c = clean(d.ciudad);
      if (c && !cities.includes(c)) cities.push(c);
    }
    cities.sort((a, b) => a.localeCompare(b, 'es'));

    const shops = cities.map((ciudad) => ({ ciudad, report: byCity.get(ciudad) || null }));
    return NextResponse.json({ semana, shops });
  }

  // Shop user: this week's own report.
  const ciudad = clean(session.user.ciudad);
  if (!ciudad) return NextResponse.json({ semana, ciudad: '', report: null });
  const report = await db.collection(COLLECTION).findOne({ ciudad, semana });
  return NextResponse.json({ semana, ciudad, report });
}

// POST /api/shop-followup — a shop submits/updates this week's photo report for
// its own city. Upserts on (ciudad, semana); replacing a photo deletes the old
// GridFS file. The city comes from the session, never the client.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const rol = session.user.rol;
  if (rol === 'externo' || rol === 'fondo') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ciudad = clean(session.user.ciudad);
  if (!ciudad) {
    return NextResponse.json(
      { error: 'No tienes una ciudad asignada. Contacta al administrador.' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const fotos = normalizeFotos(body.fotos);
  const comentario = clean(body.comentario);
  const semana = isoWeekKey(new Date());

  const db = await getDb();
  const existing = await db.collection(COLLECTION).findOne({ ciudad, semana });

  await deleteReplacedFotos(db, existing?.fotos as FotoMap | undefined, fotos);

  const now = new Date();
  if (existing) {
    await db.collection(COLLECTION).updateOne(
      { _id: existing._id },
      {
        $set: {
          fotos,
          comentario,
          updated_at: now,
          updated_by: session.user.id,
          updated_by_nombre: session.user.nombre || null,
        },
      },
    );
    return NextResponse.json({ success: true, id: existing._id.toString() });
  }

  const doc = {
    ciudad,
    semana,
    fotos,
    comentario,
    images_purged: false,
    scorecard: null,
    scorecard_comentario: '',
    created_by: session.user.id,
    created_by_nombre: session.user.nombre || null,
    created_at: now,
    updated_at: now,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return NextResponse.json({ success: true, id: result.insertedId.toString() });
}

// PATCH /api/shop-followup — admin records the scorecard (four 1–5 ratings) and
// an optional comment for a shop's report.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const scoreInput = (body.scorecard && typeof body.scorecard === 'object' ? body.scorecard : {}) as Record<string, unknown>;
  const scorecard: Record<string, number> = {};
  for (const k of SCORE_KEYS) {
    const n = parseInt(clean(scoreInput[k]), 10);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      return NextResponse.json({ error: 'Cada puntaje debe estar entre 1 y 5.' }, { status: 400 });
    }
    scorecard[k] = n;
  }
  const promedio = Math.round((SCORE_KEYS.reduce((s, k) => s + scorecard[k], 0) / SCORE_KEYS.length) * 100) / 100;

  const db = await getDb();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        scorecard: { ...scorecard, promedio },
        scorecard_comentario: clean(body.scorecard_comentario),
        scored_at: new Date(),
        scored_by: session.user.id,
        scored_by_nombre: session.user.nombre || null,
      },
    },
  );
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
