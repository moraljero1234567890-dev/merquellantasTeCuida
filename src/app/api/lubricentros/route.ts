import { NextRequest, NextResponse } from 'next/server';
import { addMonths } from 'date-fns';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../lib/db';
import { auth } from '../../../lib/auth';

const COLLECTION = 'lubricentro_ordenes';

// Canonical list of services printed on the MERQUELLANTAS "Orden de trabajo".
// Used both to validate incoming line items and to build the searchable blob.
export const SERVICIOS = [
  'Alineación',
  'Cambio de aceites caja',
  'Cambio de aceite diferencial',
  'Cambio de aceite',
  'Filtro de aire primario',
  'Filtro de aire secundario',
  'Filtro aceite',
  'Filtro combustible separador',
  'Filtro refrigeración',
  'Filtro transmisión',
  'Batería',
  'Engrase',
  'Calibración',
  'Análisis de laboratorio',
  'Inspección de baterías',
  'Inspección de llantas',
  'Otros',
];

// Top-level text fields stored on every order. Nothing is required — any of
// these may be an empty string.
const TEXT_FIELDS = [
  'orden_no',
  'fecha',
  'nombre',
  'cedula_nit',
  'fecha_cumpleanos',
  'direccion',
  'celular',
  'correo',
  'forma_pago',
  'factura_no',
  'placa',
  'marca',
  'tipo',
  'km_actual',
  'frec_cambio_km',
  'proximo_cambio_meses',
  'asesor_servicio',
  'cliente',
  'observaciones',
  'subtotal',
  'iva',
  'total',
] as const;

// Fields the client must provide: customer identity plus the full vehicle
// block. Everything else stays optional. Labels are reused in error messages.
const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'cedula_nit', label: 'Cédula y/o NIT' },
  { key: 'celular', label: 'Celular' },
  { key: 'placa', label: 'Placa' },
  { key: 'marca', label: 'Marca' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'km_actual', label: 'KM actual vehículo' },
  { key: 'frec_cambio_km', label: 'Frec. cambio (km)' },
  { key: 'proximo_cambio_meses', label: 'Próximo cambio (meses)' },
];

// Outcomes when an alert is managed ("gestionada"):
//   llamado_rechazado  -> contacted, client declined, KEEP alerting
//   no_llamar          -> stop alerting entirely
//   revision_programada-> a new revision is scheduled (moves to that list)
//   atendida           -> handled/closed, hidden from alerts and revisiones
const GESTION_TIPOS = ['llamado_rechazado', 'no_llamar', 'revision_programada', 'atendida'];
// Gestión states that should NOT appear in the active alerts list.
const GESTION_HIDDEN_FROM_ALERTAS = ['no_llamar', 'revision_programada', 'atendida'];

interface ServicioLinea {
  servicio: string;
  referencia: string; // '' | 'sencilla' | 'doble'
  unidad: string;
  valor_unitario: string;
  subtotal: string;
  exento_iva: boolean; // lubricants are IVA-exempt: counted in total, not in IVA base
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}

// Names of required fields left blank in the given doc.
function missingRequired(doc: Record<string, unknown>): string[] {
  return REQUIRED_FIELDS.filter((r) => !clean(doc[r.key])).map((r) => r.label);
}

// Normalize incoming service line items: keep only rows for a real service that
// carry any data. Services stay entirely optional.
function normalizeServicios(body: { servicios?: unknown }): ServicioLinea[] {
  const raw = Array.isArray(body.servicios) ? body.servicios : [];
  return raw
    .map((s: Record<string, unknown>) => {
      const unidad = clean(s?.unidad);
      const valor_unitario = clean(s?.valor_unitario);
      // Subtotal is derived (unidad × valor unitario), never trusted from input.
      const u = parseInt(unidad, 10) || 0;
      const v = parseInt(valor_unitario, 10) || 0;
      return {
        servicio: clean(s?.servicio),
        referencia: clean(s?.referencia),
        unidad,
        valor_unitario,
        subtotal: u && v ? String(u * v) : '',
        exento_iva: !!s?.exento_iva,
      };
    })
    .filter(
      (s: ServicioLinea) =>
        s.servicio && (s.referencia || s.unidad || s.valor_unitario || s.subtotal),
    );
}

// Build a single lowercased string holding every value in the order so the
// search tab can match "anything in the form" with one regex.
function buildSearchBlob(doc: Record<string, unknown>, servicios: ServicioLinea[]): string {
  const parts: string[] = [];
  for (const f of TEXT_FIELDS) parts.push(clean(doc[f]));
  parts.push(clean(doc.ciudad));
  for (const s of servicios) {
    parts.push(s.servicio, s.referencia, s.unidad, s.valor_unitario, s.subtotal);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// Escape user input before using it inside a RegExp.
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Atomically reserve the next consecutive order number and return it
// zero-padded to 6 digits (000001, 000002, ...). The $inc + upsert is atomic,
// so concurrent requests never get the same number.
async function nextOrdenNo(db: Awaited<ReturnType<typeof getDb>>): Promise<string> {
  const counter = await db
    .collection<{ _id: string; seq: number }>('counters')
    .findOneAndUpdate(
      { _id: 'lubricentro_orden' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
  const seq = counter?.seq ?? 1;
  return String(seq).padStart(6, '0');
}

// Next-change date = base date + interval in months ("proximo_cambio_meses").
// The base is the service date ("fecha") when present, otherwise the order's
// creation date — so entering "12 months" on a Jan-2026 order yields Jan 2027
// even if Fecha was left blank. Returns null only when the months value is
// missing/invalid, so that order is skipped in the alerts view.
function computeProximoCambioFecha(fecha: string, meses: string, fallbackBase: Date): Date | null {
  const m = parseInt(meses, 10);
  if (!Number.isFinite(m)) return null;
  let base = fallbackBase;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (match) {
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(parsed.getTime())) base = parsed;
  }
  return addMonths(base, m);
}

// Highest KM actual ever recorded for a plate (null if none). KM only ever
// increases, so a new reading must be >= this. excludeId skips the order being
// edited so it can be corrected downward relative to itself.
async function lastKmForPlaca(
  db: Awaited<ReturnType<typeof getDb>>,
  placa: string,
  excludeId?: ObjectId,
): Promise<number | null> {
  if (!placa) return null;
  const q: Record<string, unknown> = { placa };
  if (excludeId) q._id = { $ne: excludeId };
  const docs = await db.collection(COLLECTION).find(q, { projection: { km_actual: 1 } }).toArray();
  let max: number | null = null;
  for (const d of docs) {
    const n = parseInt(clean(d.km_actual), 10);
    if (Number.isFinite(n)) max = max === null ? n : Math.max(max, n);
  }
  return max;
}

// Parse a plain YYYY-MM-DD string into a local Date, or null if invalid.
function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Totals are derived, never trusted from the client. Lubricants (exento_iva)
// count toward the subtotal/total but NOT the IVA base:
//   subtotal = sum of all line subtotals
//   IVA      = 19% of the non-exempt subtotals only
//   total    = subtotal + IVA
function computeTotals(servicios: ServicioLinea[]): { subtotal: number; iva: number; total: number } {
  let subtotal = 0;
  let ivaBase = 0;
  for (const s of servicios) {
    const v = parseInt(s.subtotal, 10) || 0;
    subtotal += v;
    if (!s.exento_iva) ivaBase += v;
  }
  const iva = Math.round(ivaBase * 0.19);
  return { subtotal, iva, total: subtotal + iva };
}

// GET /api/lubricentros
//   - ?q=<text>      full-text search across every field (matches "anything")
//   - ?limit=        cap search results (default 100, max 500)
//   - ?alertas=true  paginated list sorted by next-change date (soonest/most
//                    overdue first); use ?page= and ?pageSize= to page through.
//                    Returns { results, total, page, pageSize }.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol === 'externo') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const db = await getDb();

  // Peek at the next consecutive order number WITHOUT reserving it, so the form
  // can preview what will be assigned on save. The real number is still claimed
  // atomically in POST.
  if (searchParams.get('next') === 'true') {
    const counter = await db
      .collection<{ _id: string; seq: number }>('counters')
      .findOne({ _id: 'lubricentro_orden' });
    const seq = (counter?.seq ?? 0) + 1;
    return NextResponse.json({ next: String(seq).padStart(6, '0') });
  }

  // Autocomplete suggestions used by the form to reuse existing data:
  //   ?suggest=cliente&q=   distinct customers by cédula prefix (full client block)
  //   ?suggest=vehiculo&q=  distinct vehicles by placa prefix (vehicle block, no KM)
  //   ?suggest=producto&q=  distinct product/reference strings used in services
  const suggest = searchParams.get('suggest');
  if (suggest) {
    const sq = (searchParams.get('q') || '').trim();
    if (!sq) return NextResponse.json([]);
    const esc = escapeRegex(sq);

    if (suggest === 'cliente') {
      const rows = await db
        .collection(COLLECTION)
        .aggregate([
          { $match: { cedula_nit: { $regex: '^' + esc, $options: 'i' } } },
          { $sort: { created_at: -1 } },
          { $group: { _id: { $toLower: '$cedula_nit' }, doc: { $first: '$$ROOT' } } },
          { $limit: 25 },
        ])
        .toArray();
      return NextResponse.json(
        rows.map((r) => ({
          cedula_nit: clean(r.doc.cedula_nit),
          nombre: clean(r.doc.nombre),
          fecha_cumpleanos: clean(r.doc.fecha_cumpleanos),
          direccion: clean(r.doc.direccion),
          celular: clean(r.doc.celular),
          correo: clean(r.doc.correo),
          cliente: clean(r.doc.cliente),
        })),
      );
    }

    if (suggest === 'vehiculo') {
      const rows = await db
        .collection(COLLECTION)
        .aggregate([
          { $match: { placa: { $regex: '^' + esc, $options: 'i' } } },
          { $sort: { created_at: -1 } },
          {
            $group: {
              _id: { $toUpper: '$placa' },
              doc: { $first: '$$ROOT' },
              maxKm: { $max: { $convert: { input: '$km_actual', to: 'int', onError: 0, onNull: 0 } } },
            },
          },
          { $limit: 25 },
        ])
        .toArray();
      return NextResponse.json(
        rows.map((r) => ({
          placa: clean(r.doc.placa).toUpperCase(),
          marca: clean(r.doc.marca),
          tipo: clean(r.doc.tipo),
          frec_cambio_km: clean(r.doc.frec_cambio_km),
          proximo_cambio_meses: clean(r.doc.proximo_cambio_meses),
          ultimo_km: typeof r.maxKm === 'number' ? r.maxKm : 0,
        })),
      );
    }

    if (suggest === 'producto') {
      const rows = await db
        .collection(COLLECTION)
        .aggregate([
          { $unwind: '$servicios' },
          {
            $match: {
              'servicios.servicio': { $ne: 'Alineación' },
              'servicios.referencia': { $regex: esc, $options: 'i' },
            },
          },
          { $group: { _id: { $toLower: '$servicios.referencia' }, val: { $first: '$servicios.referencia' } } },
          { $limit: 15 },
        ])
        .toArray();
      return NextResponse.json(rows.map((r) => clean(r.val)).filter(Boolean));
    }

    return NextResponse.json([]);
  }

  // Distinct cities seen across orders — feeds the admin-only city filter on the
  // alerts/revisiones views. Empty/missing cities are excluded.
  if (searchParams.get('ciudades') === 'true') {
    const raw = await db.collection(COLLECTION).distinct('ciudad');
    const ciudades = raw
      .map((c) => clean(c))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'));
    return NextResponse.json({ ciudades });
  }

  // Vehicle history: every order ever recorded for a plate, newest first. Used
  // by the "Historial del vehículo" view to show the full service timeline.
  const historial = (searchParams.get('historial') || '').trim();
  if (historial) {
    const results = await db
      .collection(COLLECTION)
      .find({ placa: historial.toUpperCase() })
      .sort({ created_at: -1 })
      .limit(200)
      .toArray();
    return NextResponse.json({ results });
  }

  // City scope for the alerts and revisiones lists: a user only ever sees the
  // orders of the city they belong to, so the shops don't mix. Admins are the
  // exception — they oversee every city and MAY narrow to one via ?ciudad=.
  // The scope is taken from the session (never trusted from the client) for
  // regular users, so it can't be bypassed. Search stays global (any plate is
  // findable). A non-admin with no city set sees nothing here.
  const isAdmin = session.user.rol === 'admin';
  const applyCityScope = (filter: Record<string, unknown>) => {
    if (!isAdmin) {
      filter.ciudad = clean(session.user.ciudad);
      return;
    }
    // Admin: optional city narrowing; no param = every city.
    const c = (searchParams.get('ciudad') || '').trim();
    if (c) filter.ciudad = c;
  };

  // Alerts view: orders with a computed next-change date that haven't been
  // closed/scheduled away, sorted ascending (most overdue first) and paginated.
  if (searchParams.get('alertas') === 'true') {
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const pageSize = Math.max(1, Math.min(parseInt(searchParams.get('pageSize') || '20') || 20, 100));
    const filter: Record<string, unknown> = {
      proximo_cambio_fecha: { $ne: null },
      gestion_tipo: { $nin: GESTION_HIDDEN_FROM_ALERTAS },
    };
    applyCityScope(filter);

    const total = await db.collection(COLLECTION).countDocuments(filter);
    const results = await db
      .collection(COLLECTION)
      .find(filter)
      .sort({ proximo_cambio_fecha: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return NextResponse.json({ results, total, page, pageSize });
  }

  // Scheduled-revisions view: orders marked with a programmed revision, sorted
  // by the scheduled date ascending, paginated.
  if (searchParams.get('revisiones') === 'true') {
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const pageSize = Math.max(1, Math.min(parseInt(searchParams.get('pageSize') || '20') || 20, 100));
    const filter: Record<string, unknown> = { gestion_tipo: 'revision_programada' };
    applyCityScope(filter);

    const total = await db.collection(COLLECTION).countDocuments(filter);
    const results = await db
      .collection(COLLECTION)
      .find(filter)
      .sort({ gestion_fecha: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return NextResponse.json({ results, total, page, pageSize });
  }

  // Full-text search (matches "anything"), newest first. Paginated by default
  // so we never load the whole collection. ?all=true returns every match (capped
  // at 500) — used for a plate search, where the result set is one vehicle's
  // bounded history and we want the complete timeline on screen.
  const q = (searchParams.get('q') || '').trim();
  const filter = q ? { _search: { $regex: escapeRegex(q.toLowerCase()) } } : {};
  const total = await db.collection(COLLECTION).countDocuments(filter);

  if (searchParams.get('all') === 'true') {
    const results = await db
      .collection(COLLECTION)
      .find(filter)
      .sort({ created_at: -1 })
      .limit(500)
      .toArray();
    return NextResponse.json({ results, total, page: 1, pageSize: results.length });
  }

  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const pageSize = Math.max(1, Math.min(parseInt(searchParams.get('pageSize') || '20') || 20, 100));
  const results = await db
    .collection(COLLECTION)
    .find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray();

  return NextResponse.json({ results, total, page, pageSize });
}

// POST /api/lubricentros — create an order. Customer + vehicle fields required.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol === 'externo') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const doc: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) doc[f] = clean(body[f]);
  // Plates are always stored uppercase so "abc123" and "ABC123" are one vehicle.
  doc.placa = (doc.placa as string).toUpperCase();

  const missing = missingRequired(doc);
  if (missing.length) {
    return NextResponse.json(
      { error: `Faltan campos requeridos: ${missing.join(', ')}.` },
      { status: 400 },
    );
  }

  const servicios = normalizeServicios(body);
  const totals = computeTotals(servicios);
  doc.subtotal = String(totals.subtotal);
  doc.iva = String(totals.iva);
  doc.total = String(totals.total);

  const db = await getDb();

  // KM only increases: reject a reading below the last recorded one for the plate.
  const kmActual = parseInt(doc.km_actual as string, 10);
  const lastKm = await lastKmForPlaca(db, doc.placa as string);
  if (lastKm !== null && Number.isFinite(kmActual) && kmActual < lastKm) {
    return NextResponse.json(
      { error: `El KM actual (${kmActual}) no puede ser menor al último registrado (${lastKm}) para la placa ${doc.placa}.` },
      { status: 400 },
    );
  }

  const createdAt = new Date();

  // The order number is always system-assigned and consecutive — any value the
  // client sent is ignored. Reserved only after validation passes so failed
  // requests don't burn a number.
  doc.orden_no = await nextOrdenNo(db);
  doc.servicios = servicios;
  doc.proximo_cambio_fecha = computeProximoCambioFecha(
    doc.fecha as string,
    doc.proximo_cambio_meses as string,
    createdAt,
  );
  // Location stamp: the order belongs to the shop/city the creating staff
  // member operates in. Used to scope the alerts/revisiones lists by city.
  doc.ciudad = clean(session.user.ciudad);
  doc._search = buildSearchBlob(doc, servicios);
  doc.created_by = session.user.id;
  doc.created_by_nombre = session.user.nombre || null;
  doc.created_at = createdAt;

  const result = await db.collection(COLLECTION).insertOne(doc);

  return NextResponse.json({
    success: true,
    id: result.insertedId.toString(),
    orden_no: doc.orden_no,
  });
}

// PUT /api/lubricentros — edit an existing order. The consecutive order number
// and creation metadata are preserved; everything else is replaced.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol === 'externo') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  if (!existing) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) update[f] = clean(body[f]);
  // Order number is never editable — keep the one originally assigned.
  update.orden_no = clean(existing.orden_no);
  // Plates are always stored uppercase.
  update.placa = (update.placa as string).toUpperCase();

  const missing = missingRequired(update);
  if (missing.length) {
    return NextResponse.json(
      { error: `Faltan campos requeridos: ${missing.join(', ')}.` },
      { status: 400 },
    );
  }

  // KM only increases: compare against other orders for this plate (this order
  // excluded so its own value can be corrected).
  const kmActual = parseInt(update.km_actual as string, 10);
  const lastKm = await lastKmForPlaca(db, update.placa as string, new ObjectId(id));
  if (lastKm !== null && Number.isFinite(kmActual) && kmActual < lastKm) {
    return NextResponse.json(
      { error: `El KM actual (${kmActual}) no puede ser menor al último registrado (${lastKm}) para la placa ${update.placa}.` },
      { status: 400 },
    );
  }

  const servicios = normalizeServicios(body);
  const totals = computeTotals(servicios);
  update.subtotal = String(totals.subtotal);
  update.iva = String(totals.iva);
  update.total = String(totals.total);
  const fallbackBase = existing.created_at instanceof Date ? existing.created_at : new Date();

  // The order keeps the city it was created in — editing never moves it
  // between shops. Backfill from the editor's city for legacy orders that
  // predate the field.
  update.ciudad = clean(existing.ciudad) || clean(session.user.ciudad);

  update.servicios = servicios;
  update.proximo_cambio_fecha = computeProximoCambioFecha(
    update.fecha as string,
    update.proximo_cambio_meses as string,
    fallbackBase,
  );
  update._search = buildSearchBlob(update, servicios);
  update.updated_at = new Date();
  update.updated_by = session.user.id;
  update.updated_by_nombre = session.user.nombre || null;

  await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: update });

  return NextResponse.json({ success: true, orden_no: update.orden_no });
}

// PATCH /api/lubricentros — manage ("gestionar") an order's alert. Sets the
// gestión outcome and, for a programmed revision, its scheduled date.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol === 'externo') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const tipo = clean(body.gestion_tipo);
  if (!GESTION_TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Gestión inválida' }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  if (!existing) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
  }

  const set: Record<string, unknown> = {
    gestion_tipo: tipo,
    gestion_nota: clean(body.gestion_nota),
    gestion_updated_at: new Date(),
    gestion_updated_by: session.user.id,
    gestion_updated_por_nombre: session.user.nombre || null,
  };

  if (tipo === 'revision_programada') {
    const fecha = parseDateOnly(clean(body.gestion_fecha));
    if (!fecha) {
      return NextResponse.json({ error: 'Fecha de revisión inválida' }, { status: 400 });
    }
    set.gestion_fecha = fecha;
  } else {
    set.gestion_fecha = null;
  }

  // "Called, rejected, keep alerting": the alert re-surfaces on the chosen
  // remind date. If none was given, fall back to pushing the next-change date
  // forward by the order's interval (base = later of today / current date).
  if (tipo === 'llamado_rechazado') {
    const chosen = parseDateOnly(clean(body.gestion_fecha));
    if (chosen) {
      set.proximo_cambio_fecha = chosen;
    } else {
      const meses = parseInt(clean(existing.proximo_cambio_meses), 10);
      if (Number.isFinite(meses)) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const current = existing.proximo_cambio_fecha instanceof Date ? existing.proximo_cambio_fecha : null;
        const base = current && current > today ? current : today;
        set.proximo_cambio_fecha = addMonths(base, meses);
      }
    }
  }

  const result = await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: set });
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
