import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../lib/db';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { auth } from '../../../../lib/auth';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/fondo/members — list/search members or users
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = await getDb();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const searchUsers = searchParams.get('search_users');
  const includeCiclo = searchParams.get('include_ciclo') === '1';

  // Regular/external users only see themselves
  if (session.user.rol !== 'fondo' && session.user.rol !== 'admin') {
    const member = await db.collection('fondo_members').findOne({ user_id: session.user.id });
    return NextResponse.json(member || null);
  }

  // search_users: search all users (regardless of fondo membership) — used for enrollment
  if (searchUsers) {
    const term = searchUsers.trim();
    const regex = new RegExp(escapeRegex(term), 'i');
    const users = await db.collection('users').find(
      {
        $or: [
          { nombre: regex },
          { cedula: regex },
        ],
      },
      { projection: { nombre: 1, cedula: 1, email: 1, cargo_empleado: 1, departamento: 1 } }
    ).limit(20).toArray();

    return NextResponse.json(
      users.map((u) => ({
        id: u._id.toString(),
        nombre: u.nombre,
        cedula: u.cedula,
        email: u.email,
        cargo_empleado: u.cargo_empleado,
        departamento: u.departamento,
      }))
    );
  }

  // Build the aggregation pipeline for members
  const userProjection: Record<string, number> = { nombre: 1, cedula: 1, email: 1, cargo_empleado: 1, departamento: 1 };
  if (includeCiclo) userProjection.cicloActual = 1;

  const pipeline: Record<string, unknown>[] = [
    {
      $lookup: {
        from: 'users',
        let: { uid: '$user_id' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$uid'] } } },
          { $project: userProjection },
        ],
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
  ];

  // search: filter members by user name or cedula
  if (search) {
    const term = search.trim();
    const regex = new RegExp(escapeRegex(term), 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'user.nombre': regex },
          { 'user.cedula': regex },
        ],
      },
    });
  }

  pipeline.push({ $sort: { 'user.nombre': 1 } });

  const members = await db.collection('fondo_members').aggregate(pipeline).toArray();

  // Flatten so the frontend gets nombre/cedula at top level
  const flattened = members.map((m) => {
    const base: Record<string, unknown> = {
      id: m._id.toString(),
      user_id: m.user_id,
      nombre: m.user?.nombre || '',
      cedula: m.user?.cedula || '',
      email: m.user?.email || '',
      cargo_empleado: m.user?.cargo_empleado || '',
      departamento: m.user?.departamento || '',
      frecuencia: m.frecuencia,
      monto_aporte: m.monto_aporte,
      saldo_permanente: m.saldo_permanente || 0,
      saldo_social: m.saldo_social || 0,
      saldo_actividad: m.saldo_actividad || 0,
      saldo_intereses: m.saldo_intereses || 0,
      fecha_afiliacion: m.fecha_afiliacion,
      activo: m.activo,
    };
    if (includeCiclo && m.user?.cicloActual) {
      base.cicloActual = m.user.cicloActual;
    }
    return base;
  });

  // When include_ciclo=1 we also want users who show up in the payroll PDF
  // (users.cicloActual is set) but have no fondo_members record yet —
  // otherwise their subtotal disappears from the ciclo form and the total
  // on screen doesn't match the PDF's printed total. Return them as
  // synthetic rows with zeroed saldos + a `not_member` flag so the UI can
  // treat them appropriately (and the admin knows to enroll them).
  if (includeCiclo) {
    const existingUserIds = new Set(flattened.map((m) => String(m.user_id)));
    const orphans = await db
      .collection('users')
      .find(
        { cicloActual: { $exists: true } },
        { projection: { nombre: 1, cedula: 1, email: 1, cargo_empleado: 1, departamento: 1, cicloActual: 1 } },
      )
      .toArray();
    for (const u of orphans) {
      const uid = u._id.toString();
      if (existingUserIds.has(uid)) continue;
      flattened.push({
        id: uid,
        user_id: uid,
        nombre: u.nombre || '',
        cedula: u.cedula || '',
        email: u.email || '',
        cargo_empleado: u.cargo_empleado || '',
        departamento: u.departamento || '',
        frecuencia: 'quincenal',
        monto_aporte: 0,
        saldo_permanente: 0,
        saldo_social: 0,
        saldo_actividad: 0,
        saldo_intereses: 0,
        fecha_afiliacion: null,
        activo: true,
        not_member: true,
        cicloActual: u.cicloActual,
      });
    }
    flattened.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  }

  return NextResponse.json(flattened);
}

// POST /api/fondo/members — enroll user in fondo (fondo/admin)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user.rol !== 'fondo' && session.user.rol !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json();
  const validFrecuencias = ['quincenal', 'mensual'];
  const frecuencia = validFrecuencias.includes(body.frecuencia) ? body.frecuencia : 'mensual';
  const db = await getDb();

  // Create external user + enroll in one step
  if (body.createExternal) {
    const cedula = String(body.cedula ?? '').trim();
    const nombre = String(body.nombre ?? '').trim();
    if (!cedula || !nombre) {
      return NextResponse.json({ error: 'Cédula y nombre son requeridos' }, { status: 400 });
    }
    if (!body.monto_aporte) {
      return NextResponse.json({ error: 'Monto de aporte requerido' }, { status: 400 });
    }

    const existingUser = await db.collection('users').findOne({ cedula });
    if (existingUser) {
      return NextResponse.json({ error: 'Ya existe un usuario con esa cédula' }, { status: 400 });
    }

    const email = body.email || `${cedula}@merque.com`;
    const password = cedula.slice(-8);
    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await db.collection('users').insertOne({
      cedula,
      nombre,
      email,
      rol: 'externo',
      passwordHash,
      departamento: null,
      cargo_empleado: null,
      created_at: new Date(),
    });

    const userId = userResult.insertedId.toString();

    const memberResult = await db.collection('fondo_members').insertOne({
      user_id: userId,
      fecha_afiliacion: new Date(),
      activo: true,
      frecuencia,
      monto_aporte: Number(body.monto_aporte),
      saldo_permanente: 0,
      saldo_social: 0,
      saldo_actividad: 0,
      saldo_intereses: 0,
      created_at: new Date(),
    });

    return NextResponse.json({
      success: true,
      id: memberResult.insertedId.toString(),
      userId,
    });
  }

  // Standard enrollment of existing user
  if (!body.user_id || !body.monto_aporte) {
    return NextResponse.json({ error: 'user_id y monto_aporte requeridos' }, { status: 400 });
  }

  // Check if already enrolled
  const existing = await db.collection('fondo_members').findOne({ user_id: body.user_id });
  if (existing) {
    return NextResponse.json({ error: 'Usuario ya está afiliado al fondo' }, { status: 400 });
  }

  const result = await db.collection('fondo_members').insertOne({
    user_id: body.user_id,
    fecha_afiliacion: new Date(),
    activo: true,
    frecuencia,
    monto_aporte: Number(body.monto_aporte),
    saldo_permanente: 0,
    saldo_social: 0,
    saldo_actividad: 0,
    saldo_intereses: 0,
    created_at: new Date(),
  });

  return NextResponse.json({ success: true, id: result.insertedId.toString() });
}

// PUT /api/fondo/members — update member settings
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user.rol !== 'fondo' && session.user.rol !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.monto_aporte !== undefined) update.monto_aporte = Number(body.monto_aporte);
  if (body.frecuencia) update.frecuencia = body.frecuencia;
  if (body.activo !== undefined) update.activo = !!body.activo;

  const db = await getDb();
  await db.collection('fondo_members').updateOne(
    { _id: new ObjectId(body.id) },
    { $set: update }
  );

  return NextResponse.json({ success: true });
}
