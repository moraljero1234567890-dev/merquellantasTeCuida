import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDb } from '../../../lib/db';
import { auth } from '../../../lib/auth';

const ALLOWED_USER_FIELDS = new Set([
  'nombre', 'posicion', 'departamento', 'eps', 'banco',
  'caja_compensacion', 'fondo_pensiones', 'arl', 'fecha_ingreso',
  'fondo_cesantias', 'cargo_empleado', 'numero_cuenta', 'tipo_cuenta',
  'tipo_documento', 'fecha_nacimiento', 'area', 'contrato', 'clase_riesgo',
  'first_name', 'primer_apellido', 'segundo_apellido',
]);
const ADMIN_ONLY_FIELDS = new Set(['rol', 'cedula', 'email']);
const VALID_ROLES = new Set(['user', 'admin', 'fondo', 'externo']);

// GET /api/users
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = await getDb();

  if (session.user.rol !== 'admin') {
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(session.user.id) },
      { projection: { passwordHash: 0 } }
    );
    return NextResponse.json(user || null);
  }

  const users = await db.collection('users')
    .find({}, { projection: { passwordHash: 0 } })
    .sort({ nombre: 1 })
    .toArray();
  return NextResponse.json(users);
}

// POST /api/users — create user (admin)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.cedula || !body.nombre) {
      return NextResponse.json({ error: 'Cédula y nombre son requeridos' }, { status: 400 });
    }

    const db = await getDb();
    const cedula = String(body.cedula);
    const email = body.email || `${cedula}@merque.com`;
    const password = cedula.slice(-8);
    const passwordHash = await bcrypt.hash(password, 10);
    const safeRol = VALID_ROLES.has(body.rol) ? body.rol : 'user';

    const doc = {
      cedula,
      email,
      nombre: body.nombre,
      posicion: body.posicion || null,
      rol: safeRol,
      passwordHash,
      departamento: body.departamento || null,
      eps: body.eps || null,
      banco: body.banco || null,
      caja_compensacion: body.caja_compensacion || null,
      fondo_pensiones: body.fondo_pensiones || null,
      arl: body.arl || null,
      fecha_ingreso: body.fecha_ingreso || null,
      fondo_cesantias: body.fondo_cesantias || null,
      cargo_empleado: body.cargo_empleado || null,
      numero_cuenta: body.numero_cuenta || null,
      tipo_cuenta: body.tipo_cuenta || null,
      tipo_documento: body.tipo_documento || null,
      fecha_nacimiento: body.fecha_nacimiento || null,
      area: body.area || null,
      contrato: body.contrato || null,
      clase_riesgo: body.clase_riesgo || null,
    };

    const result = await db.collection('users').updateOne(
      { cedula },
      { $set: doc, $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );

    const id = result.upsertedId?.toString() || (await db.collection('users').findOne({ cedula }))?._id?.toString();

    return NextResponse.json({ success: true, id, email });
  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 });
  }
}

// PUT /api/users — update user
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;
  const isAdmin = session.user.rol === 'admin';
  const targetId = isAdmin && id ? id : session.user.id;

  const updateFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_USER_FIELDS.has(key) && !(isAdmin && ADMIN_ONLY_FIELDS.has(key))) continue;
    if (key === 'rol' && !isAdmin) continue;
    if (key === 'rol') {
      updateFields[key] = VALID_ROLES.has(value as string) ? (value as string) : 'user';
    } else {
      updateFields[key] = value != null ? String(value) : null;
    }
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: 'No hay campos válidos para actualizar' }, { status: 400 });
  }

  const db = await getDb();
  await db.collection('users').updateOne(
    { _id: new ObjectId(targetId) },
    { $set: updateFields }
  );

  return NextResponse.json({ success: true });
}

// DELETE /api/users — delete user (admin)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }
  if (id === session.user.id) {
    return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 });
  }

  const db = await getDb();
  const oid = new ObjectId(id);
  await db.collection('calendar').deleteMany({ user_id: id });
  await db.collection('solicitudes').deleteMany({ user_id: id });
  await db.collection('cesantias').deleteMany({ user_id: id });
  await db.collection('pqrsf').deleteMany({ user_id: id });
  await db.collection('users').deleteOne({ _id: oid });

  return NextResponse.json({ success: true });
}
