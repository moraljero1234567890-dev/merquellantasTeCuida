import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { getDb } from '../../../../lib/db';

// TEMPORARY bootstrap endpoint — used to seed users after a wipe when no one
// can log in. It is automatically disabled as soon as the users collection
// has any records, so it cannot be used to bypass auth in normal operation.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FONDO_RELINK_COLLECTIONS = [
  'fondo_members',
  'fondo_aportes',
  'fondo_actividad',
  'fondo_cartera',
  'fondo_retiros',
];

const BIRTHDAY_IMAGES = [
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ28hdK2YMK1kT1QcKgtTpMVKX-PzNDQy0GGg&s',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx_br_f6lRM6GlR4pC_lTXijSfA2d3ovsdSw&s',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJF6XSwytfBht0vJcIbdWDCpif4C9esFJ0_g&s',
];

function norm(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findCol(headers: string[], ...variants: string[]): number {
  const wanted = variants.map(norm);
  for (let i = 0; i < headers.length; i++) {
    if (wanted.includes(norm(headers[i]))) return i;
  }
  return -1;
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (month > 12 && day <= 12) [day, month] = [month, day];
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(d.getTime())) return d;
  }
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

function isoDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().split('T')[0];
}

function clean(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function titleCase(value: string | null): string | null {
  if (!value) return value;
  return value
    .toLowerCase()
    .replace(/(^|[\s\-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function cleanTitle(value: unknown): string | null {
  return titleCase(clean(value));
}

function buildFullName(p1: string | null, p2: string | null, n: string | null): string {
  return [n, p1, p2].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// GET — is bootstrap available? (only when users collection is empty)
export async function GET() {
  try {
    const db = await getDb();
    const count = await db.collection('users').countDocuments({}, { limit: 1 });
    return NextResponse.json({ enabled: count === 0 });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}

interface RowResult {
  row: number;
  cedula: string;
  nombre: string;
  status: 'created' | 'updated' | 'error';
  fondo_relinked?: number;
  is_admin?: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  const db = await getDb();

  // Hard guard: only usable when users collection is empty
  const existing = await db.collection('users').countDocuments({}, { limit: 1 });
  if (existing > 0) {
    return NextResponse.json(
      { error: 'Bootstrap deshabilitado: ya existen usuarios. Inicia sesión como admin para usar la carga normal.' },
      { status: 403 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Form data inválido' }, { status: 400 });
  }

  const file = formData.get('file');
  const adminCedulaRaw = formData.get('admin_cedula');
  const adminCedula = typeof adminCedulaRaw === 'string'
    ? adminCedulaRaw.replace(/\D/g, '')
    : '';

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
  }
  if (!adminCedula) {
    return NextResponse.json(
      { error: 'Cédula del administrador es obligatoria para el bootstrap' },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: false });
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo (.xlsx, .xls o .csv)' }, { status: 400 });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 });

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
  });
  if (rows.length < 2) {
    return NextResponse.json({ error: 'El archivo no tiene datos' }, { status: 400 });
  }

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? ''));
  const idx = {
    cedula: findCol(headers, 'Número Documento', 'Numero Documento', 'Cedula', 'Cédula'),
    primerApellido: findCol(headers, 'Primer Apellido'),
    segundoApellido: findCol(headers, 'Segundo Apellido'),
    nombre: findCol(headers, 'Nombre Empleado', 'Nombres', 'Nombre'),
    fechaNacimiento: findCol(headers, 'Fecha Nacimiento', 'Fecha de Nacimiento', 'Fecha Nac.'),
    fechaIngreso: findCol(headers, 'Fecha Ingreso', 'Fecha de Ingreso'),
    contrato: findCol(headers, 'Contrato', 'Tipo Contrato', 'Tipo de Contrato'),
    departamento: findCol(headers, 'Dpto Donde Labora', 'Departamento', 'Dpto'),
    cargo: findCol(headers, 'Cargo Empleado', 'Cargo'),
    tipoCuenta: findCol(headers, 'Tipo Cuenta', 'Tipo de Cuenta'),
    numeroCuenta: findCol(headers, 'Número Cuenta', 'Numero Cuenta', 'Cuenta'),
    banco: findCol(headers, 'Banco'),
    eps: findCol(headers, 'EPS'),
    afp: findCol(headers, 'AFP', 'Fondo Pensiones', 'Fondo de Pensiones'),
    caja: findCol(headers, 'Caja Compensación', 'Caja Compensacion', 'CAJA DE COMPENSACION'),
    arl: findCol(headers, 'ARL'),
    claseRiesgo: findCol(headers, 'Clase Riesgo', 'Clase de Riesgo'),
    fondoCesantias: findCol(headers, 'Fondo Cesantías', 'Fondo Cesantias'),
    area: findCol(headers, 'CANAL', 'Canal', 'AREA', 'Area', 'Área'),
  };

  if (idx.cedula === -1) {
    return NextResponse.json(
      { error: 'Columna requerida no encontrada: Número Documento' },
      { status: 400 }
    );
  }

  const usersCol = db.collection('users');
  const calendarCol = db.collection('calendar');

  const results: RowResult[] = [];
  let created = 0;
  let updated = 0;
  let errors = 0;
  let totalRelinked = 0;
  let adminPromoted = false;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || row.length === 0) continue;

    const cedula = String(row[idx.cedula] ?? '').replace(/\D/g, '');
    if (!cedula) continue;

    const primer = idx.primerApellido !== -1 ? cleanTitle(row[idx.primerApellido]) : null;
    const segundo = idx.segundoApellido !== -1 ? cleanTitle(row[idx.segundoApellido]) : null;
    const nombreEmpleado = idx.nombre !== -1 ? cleanTitle(row[idx.nombre]) : null;
    const nombre = buildFullName(primer, segundo, nombreEmpleado);
    if (!nombre) {
      errors++;
      results.push({ row: r + 1, cedula, nombre: '', status: 'error', error: 'Nombre vacío' });
      continue;
    }

    const fechaNacimiento = idx.fechaNacimiento !== -1 ? parseDate(row[idx.fechaNacimiento]) : null;
    const fechaIngreso = idx.fechaIngreso !== -1 ? parseDate(row[idx.fechaIngreso]) : null;
    const isAdmin = cedula === adminCedula;

    const userDoc: Record<string, unknown> = {
      cedula,
      email: `${cedula}@merque.com`,
      nombre,
      first_name: nombreEmpleado,
      primer_apellido: primer,
      segundo_apellido: segundo,
      tipo_documento: 'Cédula Ciudadanía',
      fecha_nacimiento: isoDate(fechaNacimiento),
      fecha_ingreso: isoDate(fechaIngreso),
      contrato: idx.contrato !== -1 ? clean(row[idx.contrato]) : null,
      departamento: idx.departamento !== -1 ? cleanTitle(row[idx.departamento]) : null,
      cargo_empleado: idx.cargo !== -1 ? cleanTitle(row[idx.cargo]) : null,
      area: idx.area !== -1 ? cleanTitle(row[idx.area]) : null,
      tipo_cuenta: idx.tipoCuenta !== -1 ? clean(row[idx.tipoCuenta]) : null,
      numero_cuenta: idx.numeroCuenta !== -1 ? clean(row[idx.numeroCuenta]) : null,
      banco: idx.banco !== -1 ? clean(row[idx.banco]) : null,
      eps: idx.eps !== -1 ? clean(row[idx.eps]) : null,
      fondo_pensiones: idx.afp !== -1 ? clean(row[idx.afp]) : null,
      caja_compensacion: idx.caja !== -1 ? clean(row[idx.caja]) : null,
      arl: idx.arl !== -1 ? clean(row[idx.arl]) : null,
      clase_riesgo: idx.claseRiesgo !== -1 ? clean(row[idx.claseRiesgo]) : null,
      fondo_cesantias: idx.fondoCesantias !== -1 ? clean(row[idx.fondoCesantias]) : null,
      posicion: null,
      rol: isAdmin ? 'admin' : 'user',
    };

    try {
      const passwordHash = await bcrypt.hash(cedula.slice(-8).padStart(8, '0'), 10);
      userDoc.passwordHash = passwordHash;

      const updateRes = await usersCol.updateOne(
        { cedula },
        { $set: userDoc, $setOnInsert: { created_at: new Date() } },
        { upsert: true }
      );

      const userId =
        updateRes.upsertedId?.toString() ||
        (await usersCol.findOne({ cedula }, { projection: { _id: 1 } }))!._id.toString();

      const isCreated = !!updateRes.upsertedId;
      if (isCreated) created++;
      else updated++;
      if (isAdmin) adminPromoted = true;

      let relinked = 0;
      for (const cName of FONDO_RELINK_COLLECTIONS) {
        const r = await db.collection(cName).updateMany(
          { cedula_snapshot: cedula },
          { $set: { user_id: userId, cedula } }
        );
        relinked += r.modifiedCount || 0;
      }
      totalRelinked += relinked;

      if (fechaNacimiento) {
        const exists = await calendarCol.findOne({ user_id: userId, type: 'birthday' });
        if (!exists) {
          await calendarCol.insertOne({
            user_id: userId,
            type: 'birthday',
            title: `Cumpleaños de ${nombre}`,
            description: `Recuerden que cumple años ${nombre}`,
            image: BIRTHDAY_IMAGES[Math.floor(Math.random() * BIRTHDAY_IMAGES.length)],
            date: fechaNacimiento,
            created_at: new Date(),
          });
        }
      }

      results.push({
        row: r + 1,
        cedula,
        nombre,
        status: isCreated ? 'created' : 'updated',
        fondo_relinked: relinked || undefined,
        is_admin: isAdmin || undefined,
      });
    } catch (err) {
      errors++;
      results.push({
        row: r + 1,
        cedula,
        nombre,
        status: 'error',
        error: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }

  return NextResponse.json({
    success: true,
    total_rows: rows.length - 1,
    created,
    updated,
    errors,
    fondo_relinked: totalRelinked,
    admin_promoted: adminPromoted,
    admin_cedula: adminCedula,
    results,
  });
}
