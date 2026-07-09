import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { getDb } from '../../../../lib/db';
import { auth } from '../../../../lib/auth';

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

// Normalize a header string: strip accents, lowercase, collapse whitespace
function norm(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Build a column index for a row of headers from a list of accepted variants
function findCol(headers: string[], ...variants: string[]): number {
  const wanted = variants.map(norm);
  for (let i = 0; i < headers.length; i++) {
    if (wanted.includes(norm(headers[i]))) return i;
  }
  return -1;
}

// Loose match: returns the first header that contains any of the given keywords
function findColLoose(headers: string[], ...keywords: string[]): number {
  const needles = keywords.map(norm);
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (needles.some((n) => n && h.includes(n))) return i;
  }
  return -1;
}

// Parse a date from Excel serial / ISO / DD/MM/YYYY / D-M-YY
function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;

  // Excel serial number
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const s = String(value).trim();
  if (!s) return null;

  // DD/MM/YYYY or DD-MM-YYYY (also DD/MM/YY)
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (day > 12 && month <= 12) {
      // unambiguous DD/MM
    } else if (month > 12) {
      // swap (looks like MM/DD given month >12)
      [day, month] = [month, day];
    }
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(d.getTime())) return d;
  }

  // ISO
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}

// Format a Date as YYYY-MM-DD (UTC)
function isoDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().split('T')[0];
}

function clean(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

// "ACOSTA CHAVEZ" → "Acosta Chavez", "MARÍA JOSÉ" → "María José"
function titleCase(value: string | null): string | null {
  if (!value) return value;
  return value
    .toLowerCase()
    .replace(/(^|[\s\-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function cleanTitle(value: unknown): string | null {
  return titleCase(clean(value));
}

function buildFullName(
  primerApellido: string | null,
  segundoApellido: string | null,
  nombreEmpleado: string | null
): string {
  const parts = [nombreEmpleado, primerApellido, segundoApellido].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

interface RowResult {
  row: number;
  cedula: string;
  nombre: string;
  status: 'created' | 'updated' | 'error';
  fondo_relinked?: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Form data inválido' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: false });
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo (.xlsx, .xls o .csv)' }, { status: 400 });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 });
  }
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

  // Fallback: if CANAL/Area header is not an exact match (e.g. "CANAL VENTAS",
  // "Area/Canal"), try a loose contains match so the value still lands in `area`.
  if (idx.area === -1) {
    idx.area = findColLoose(headers, 'canal', 'area');
  }

  if (idx.cedula === -1) {
    return NextResponse.json(
      { error: 'Columna requerida no encontrada: Número Documento' },
      { status: 400 }
    );
  }
  if (idx.nombre === -1 && idx.primerApellido === -1) {
    return NextResponse.json(
      { error: 'Falta columna de nombre: Nombre Empleado o Primer Apellido' },
      { status: 400 }
    );
  }

  const db = await getDb();
  const usersCol = db.collection('users');
  const calendarCol = db.collection('calendar');

  const results: RowResult[] = [];
  let created = 0;
  let updated = 0;
  let errors = 0;
  let totalRelinked = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || row.length === 0) continue;

    const rawCedula = row[idx.cedula];
    const cedula = String(rawCedula ?? '').replace(/\D/g, '');
    if (!cedula) {
      // skip silently if the row is fully empty; flag if ced missing but name present
      const nameProbe = idx.nombre !== -1 ? clean(row[idx.nombre]) : null;
      if (nameProbe) {
        errors++;
        results.push({
          row: r + 1,
          cedula: '',
          nombre: nameProbe || '',
          status: 'error',
          error: 'Cédula vacía',
        });
      }
      continue;
    }

    const primerApellido = idx.primerApellido !== -1 ? cleanTitle(row[idx.primerApellido]) : null;
    const segundoApellido = idx.segundoApellido !== -1 ? cleanTitle(row[idx.segundoApellido]) : null;
    const nombreEmpleado = idx.nombre !== -1 ? cleanTitle(row[idx.nombre]) : null;
    const nombre = buildFullName(primerApellido, segundoApellido, nombreEmpleado);
    if (!nombre) {
      errors++;
      results.push({ row: r + 1, cedula, nombre: '', status: 'error', error: 'Nombre vacío' });
      continue;
    }

    const fechaNacimiento = idx.fechaNacimiento !== -1 ? parseDate(row[idx.fechaNacimiento]) : null;
    const fechaIngreso = idx.fechaIngreso !== -1 ? parseDate(row[idx.fechaIngreso]) : null;

    const userDoc: Record<string, unknown> = {
      cedula,
      email: `${cedula}@merque.com`,
      nombre,
      first_name: nombreEmpleado,
      primer_apellido: primerApellido,
      segundo_apellido: segundoApellido,
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
      rol: 'user',
    };

    try {
      const existing = await usersCol.findOne({ cedula }, { projection: { _id: 1, passwordHash: 1 } });
      const passwordHash =
        existing?.passwordHash || (await bcrypt.hash(cedula.slice(-8).padStart(8, '0'), 10));
      userDoc.passwordHash = passwordHash;

      const updateRes = await usersCol.updateOne(
        { cedula },
        { $set: userDoc, $setOnInsert: { created_at: new Date() } },
        { upsert: true }
      );

      const userId =
        updateRes.upsertedId?.toString() ||
        existing?._id?.toString() ||
        (await usersCol.findOne({ cedula }, { projection: { _id: 1 } }))!._id.toString();

      const isCreated = !!updateRes.upsertedId;
      if (isCreated) created++;
      else updated++;

      // Re-link orphaned fondo records by cedula snapshot
      let relinked = 0;
      for (const cName of FONDO_RELINK_COLLECTIONS) {
        const r = await db.collection(cName).updateMany(
          { cedula_snapshot: cedula },
          { $set: { user_id: userId, cedula } }
        );
        relinked += r.modifiedCount || 0;
      }
      totalRelinked += relinked;

      // Birthday calendar event
      if (fechaNacimiento) {
        const exists = await calendarCol.findOne({
          user_id: userId,
          type: 'birthday',
        });
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
        } else {
          // keep date in sync if it changed
          await calendarCol.updateOne(
            { _id: exists._id },
            { $set: { date: fechaNacimiento, title: `Cumpleaños de ${nombre}` } }
          );
        }
      }

      results.push({
        row: r + 1,
        cedula,
        nombre,
        status: isCreated ? 'created' : 'updated',
        fondo_relinked: relinked || undefined,
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
    results,
  });
}
