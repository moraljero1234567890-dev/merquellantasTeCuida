import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';
import { auth } from '../../../lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const {
      cedula,
      nombre,
      email: rawEmail,
      posicion,
      fechaNacimiento,
      extra = {},
    } = await req.json();

    const email = rawEmail || `${cedula}@merque.com`;

    if (!cedula || !nombre) {
      return NextResponse.json(
        { error: 'Cédula y nombre son requeridos' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Password = last 8 digits of cedula, zero-padded to 8 chars for short cédulas
    const passwordHash = await bcrypt.hash(String(cedula).slice(-8).padStart(8, '0'), 10);

    const userDoc = {
      cedula: String(cedula),
      email,
      nombre,
      posicion: posicion || null,
      rol: 'user',
      passwordHash,
      departamento: extra['Nombre Área Funcional'] || extra['Dpto Donde Labora'] || null,
      eps: extra['EPS'] || null,
      banco: extra['Banco'] || null,
      caja_compensacion: extra['CAJA DE COMPENSACION'] || null,
      fondo_pensiones: extra['FONDO DE PENSIONES'] || null,
      arl: extra['ARL'] || null,
      fecha_ingreso: extra['Fecha Ingreso'] || null,
      fondo_cesantias: extra['Fondo Cesantías'] || null,
      cargo_empleado: extra['Cargo Empleado'] || null,
      numero_cuenta: extra['Número Cuenta'] || null,
      tipo_cuenta: extra['Tipo Cuenta'] || null,
      tipo_documento: extra['Tipo de Documento'] || null,
      fecha_nacimiento: fechaNacimiento || extra['fechaNacimiento'] || null,
    };

    // Upsert user by cedula
    await db.collection('users').updateOne(
      { cedula: String(cedula) },
      { $set: userDoc, $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );

    // Create birthday event if provided
    if (fechaNacimiento) {
      const birthDate = new Date(fechaNacimiento);
      if (!isNaN(birthDate.getTime())) {
        const userId = String(cedula);

        // Check if birthday event already exists
        const existing = await db.collection('calendar').findOne({
          user_id: userId,
          type: 'birthday',
        });

        if (!existing) {
          await db.collection('calendar').insertOne({
            user_id: userId,
            type: 'birthday',
            title: `Cumpleaños de ${nombre}`,
            description: `Recuerden que cumple años ${nombre}`,
            image: ['https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ28hdK2YMK1kT1QcKgtTpMVKX-PzNDQy0GGg&s','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx_br_f6lRM6GlR4pC_lTXijSfA2d3ovsdSw&s','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJF6XSwytfBht0vJcIbdWDCpif4C9esFJ0_g&s'][Math.floor(Math.random() * 3)],
            date: birthDate,
            created_at: new Date(),
          });
        }
      }
    }

    return NextResponse.json({ success: true, id: String(cedula), email });
  } catch (error: unknown) {
    console.error('Create user error');
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 });
  }
}
