import { NextRequest, NextResponse } from 'next/server';
import { addMonths } from 'date-fns';
import { getDb } from '../../../lib/db';
import { auth } from '../../../lib/auth';

const COLLECTION = 'lubricentro_ordenes';

// Canonical list of services printed on the MERQUELLANTAS "Orden de trabajo".
// Used both to validate incoming line items and to build the searchable blob.
export const SERVICIOS = [
  'Alineación',
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

interface ServicioLinea {
  servicio: string;
  referencia: string; // '' | 'sencilla' | 'doble'
  unidad: string;
  valor_unitario: string;
  subtotal: string;
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}

// Build a single lowercased string holding every value in the order so the
// search tab can match "anything in the form" with one regex.
function buildSearchBlob(doc: Record<string, unknown>, servicios: ServicioLinea[]): string {
  const parts: string[] = [];
  for (const f of TEXT_FIELDS) parts.push(clean(doc[f]));
  for (const s of servicios) {
    parts.push(s.servicio, s.referencia, s.unidad, s.valor_unitario, s.subtotal);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// Escape user input before using it inside a RegExp.
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  // Alerts view: only orders that have a computed next-change date, sorted by
  // it ascending and paginated so we never load everything at once.
  if (searchParams.get('alertas') === 'true') {
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const pageSize = Math.max(1, Math.min(parseInt(searchParams.get('pageSize') || '20') || 20, 100));
    const filter = { proximo_cambio_fecha: { $ne: null } };

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

  const q = (searchParams.get('q') || '').trim();
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '100') || 100, 500));
  const filter = q ? { _search: { $regex: escapeRegex(q.toLowerCase()) } } : {};

  const results = await db
    .collection(COLLECTION)
    .find(filter)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json(results);
}

// POST /api/lubricentros — create an order. No field is required.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol === 'externo') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const doc: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) doc[f] = clean(body[f]);

  // Normalize service line items: keep only rows that carry any data.
  const rawServicios = Array.isArray(body.servicios) ? body.servicios : [];
  const servicios: ServicioLinea[] = rawServicios
    .map((s: Record<string, unknown>) => ({
      servicio: clean(s?.servicio),
      referencia: clean(s?.referencia),
      unidad: clean(s?.unidad),
      valor_unitario: clean(s?.valor_unitario),
      subtotal: clean(s?.subtotal),
    }))
    .filter(
      (s: ServicioLinea) =>
        s.servicio &&
        (s.referencia || s.unidad || s.valor_unitario || s.subtotal),
    );

  const createdAt = new Date();
  doc.servicios = servicios;
  doc.proximo_cambio_fecha = computeProximoCambioFecha(
    doc.fecha as string,
    doc.proximo_cambio_meses as string,
    createdAt,
  );
  doc._search = buildSearchBlob(doc, servicios);
  doc.created_by = session.user.id;
  doc.created_by_nombre = session.user.nombre || null;
  doc.created_at = createdAt;

  const db = await getDb();
  const result = await db.collection(COLLECTION).insertOne(doc);

  return NextResponse.json({ success: true, id: result.insertedId.toString() });
}
