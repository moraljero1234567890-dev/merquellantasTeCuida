import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';
import { ObjectId } from 'mongodb';
import { auth } from '../../../lib/auth';

// GET /api/pqrsf — list PQRSFs
//   - admin: returns all by default; pass ?mine=true to only see their own
//   - user/fondo: always returns only their own
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const limit = Math.max(1, Math.min(parseInt(limitParam!) || 50, 500));
  const mineOnly = searchParams.get('mine') === 'true';

  const db = await getDb();

  // Admin sees all unless mine=true
  if (session.user.rol === 'admin' && !mineOnly) {
    const results = await db.collection('pqrsf').find({}).sort({ created_at: -1 }).limit(limit).toArray();
    return NextResponse.json(results);
  }

  // Everyone else (or admin with mine=true) sees only their own PQRSFs
  const results = await db.collection('pqrsf')
    .find({ user_id: session.user.id })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return NextResponse.json(results);
}

// POST /api/pqrsf — create PQRSF
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();

  // Input validation
  const validTypes = ['Petición', 'Queja', 'Reclamo', 'Sugerencia', 'Felicitación'];
  if (!body.type || !validTypes.includes(body.type)) {
    return NextResponse.json({ error: 'Tipo de PQRSF inválido' }, { status: 400 });
  }
  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: 'El mensaje es requerido' }, { status: 400 });
  }

  const db = await getDb();

  // Always store user identity for admin visibility
  const user = await db.collection('users').findOne(
    { _id: new ObjectId(session.user.id) },
    { projection: { nombre: 1, cedula: 1 } }
  );

  const result = await db.collection('pqrsf').insertOne({
    user_id: session.user.id,
    type: body.type,
    message: body.message,
    is_anonymous: !!body.isAnonymous,
    nombre: user?.nombre || null,
    cedula: user?.cedula || null,
    respuesta: null,
    respondido_por: null,
    respondido_at: null,
    created_at: new Date(),
  });

  return NextResponse.json({ success: true, id: result.insertedId.toString() });
}

// PUT /api/pqrsf — admin responds to a PQRSF
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id, respuesta } = await req.json();

  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }
  if (!respuesta || typeof respuesta !== 'string' || !respuesta.trim()) {
    return NextResponse.json({ error: 'La respuesta es requerida' }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.collection('pqrsf').updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        respuesta: respuesta.trim().slice(0, 5000),
        respondido_por: session.user.id,
        respondido_at: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'PQRSF no encontrado' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
