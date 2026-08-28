import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../lib/db';
import { ObjectId } from 'mongodb';
import { auth } from '../../../../lib/auth';

function getInterestRate(numCuotas: number, frecuencia: string): number {
  // Convert quincenal cuotas to equivalent months for the rate brackets
  const cuotasComoMeses = frecuencia === 'quincenal' ? numCuotas / 2 : numCuotas;
  if (cuotasComoMeses <= 12) return 1.0;
  if (cuotasComoMeses <= 24) return 1.2;
  return 1.3;
}

// GET /api/fondo/cartera?user_id=X&estado=pendiente
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = await getDb();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  const creditoId = searchParams.get('credito_id');
  const estado = searchParams.get('estado');

  const filter: Record<string, unknown> = {};
  if (session.user.rol === 'user' || session.user.rol === 'admin') {
    if (!userId) {
      filter.user_id = session.user.id;
    } else {
      filter.user_id = userId;
    }
  } else if (userId) {
    // fondo: filter by user_id if provided, otherwise return all
    filter.user_id = userId;
  }
  if (creditoId) filter.credito_id = creditoId;
  if (estado) filter.estado = estado;

  const results = await db.collection('fondo_cartera')
    .find(filter).sort({ created_at: -1 }).toArray();
  return NextResponse.json(results);
}

// POST /api/fondo/cartera — create or request a loan
// - user/admin without admin powers: creates a request (estado='pendiente')
// - fondo: creates an active loan immediately
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const valorPrestamo = Number(body.valor_prestamo || 0);
  const numCuotas = Number(body.numero_cuotas || 0);
  const frecuenciaPago = body.frecuencia_pago === 'quincenal' ? 'quincenal' : 'mensual';

  if (!valorPrestamo || valorPrestamo <= 0) {
    return NextResponse.json({ error: 'Valor del préstamo inválido' }, { status: 400 });
  }
  if (!numCuotas || numCuotas <= 0 || numCuotas > 120) {
    return NextResponse.json({ error: 'Número de cuotas inválido (1-120)' }, { status: 400 });
  }

  const tasaMensual = getInterestRate(numCuotas, frecuenciaPago);
  const tasaPorPeriodo = (frecuenciaPago === 'quincenal' ? tasaMensual / 2 : tasaMensual) / 100;

  // Standard amortization: payment = P * r(1+r)^n / ((1+r)^n - 1)
  const cuotaFija = tasaPorPeriodo === 0
    ? valorPrestamo / numCuotas
    : valorPrestamo * (tasaPorPeriodo * Math.pow(1 + tasaPorPeriodo, numCuotas)) / (Math.pow(1 + tasaPorPeriodo, numCuotas) - 1);

  // Compute total interest by walking the amortization schedule
  let totalInteres = 0;
  let balance = valorPrestamo;
  for (let i = 0; i < numCuotas; i++) {
    const interesPeriodo = Math.round(balance * tasaPorPeriodo * 100) / 100;
    let pago = Math.round(cuotaFija * 100) / 100;
    let capital = pago - interesPeriodo;
    if (i === numCuotas - 1 || capital > balance) {
      capital = Math.round(balance * 100) / 100;
      pago = capital + interesPeriodo;
    }
    totalInteres += interesPeriodo;
    balance = Math.max(0, Math.round((balance - capital) * 100) / 100);
  }
  totalInteres = Math.round(totalInteres * 100) / 100;

  const isFondo = session.user.rol === 'fondo';
  const targetUserId = isFondo && body.user_id ? body.user_id : session.user.id;

  const db = await getDb();

  const creditoIdAuto = body.credito_id || `CR-${Date.now().toString().slice(-8)}`;

  const daysPerCuota = frecuenciaPago === 'quincenal' ? 15 : 30;
  const fechaCuota1 = body.fecha_cuota_1
    ? new Date(body.fecha_cuota_1)
    : (() => { const d = new Date(); d.setDate(d.getDate() + daysPerCuota); return d; })();
  const fechaTermina = new Date(fechaCuota1);
  fechaTermina.setDate(fechaTermina.getDate() + daysPerCuota * numCuotas);

  // body.solicitud is the full structured payload from SolicitudCreditoForm
  // (línea de crédito, garantías, info del asociado, codeudores, documentos,
  // firma e-signed as data URL, etc.). We persist it verbatim so the fondo
  // user can later reconstruct / print the signed form. Kept as an opaque
  // record — schema-validated on the client.
  const solicitud = body.solicitud && typeof body.solicitud === 'object' ? body.solicitud : null;

  const doc = {
    user_id: targetUserId,
    credito_id: creditoIdAuto,
    tasa_interes: tasaMensual,
    frecuencia_pago: frecuenciaPago,
    fecha_solicitud: new Date(),
    fecha_desembolso: body.fecha_desembolso ? new Date(body.fecha_desembolso) : new Date(),
    fecha_cuota_1: fechaCuota1,
    fecha_termina: fechaTermina,
    valor_prestamo: valorPrestamo,
    numero_cuotas: numCuotas,
    cuotas_pagadas: 0,
    cuotas_restantes: numCuotas,
    saldo_capital: valorPrestamo,
    saldo_interes: totalInteres,
    saldo_total: valorPrestamo + totalInteres,
    estado: 'activo',
    motivo_solicitud: body.motivo_solicitud || (solicitud?.destinacion_credito ?? null),
    motivo_respuesta: null,
    pagos: [],
    solicitud,
    created_by: session.user.id,
    created_at: new Date(),
  };

  const result = await db.collection('fondo_cartera').insertOne(doc);

  return NextResponse.json({ success: true, id: result.insertedId.toString() });
}

// PUT /api/fondo/cartera — multiple actions:
//   action='pago' → record a payment (fondo only)
//   action='aprobar' → approve a pending request (fondo only)
//   action='rechazar' → reject a pending request (fondo only)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.rol !== 'fondo') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json();
  const action = body.action || 'pago';

  if (!body.cartera_id || !ObjectId.isValid(body.cartera_id)) {
    return NextResponse.json({ error: 'cartera_id requerido' }, { status: 400 });
  }

  const db = await getDb();
  const cartera = await db.collection('fondo_cartera').findOne({ _id: new ObjectId(body.cartera_id) });
  if (!cartera) return NextResponse.json({ error: 'Crédito no encontrado' }, { status: 404 });

  // ----- APROBAR a pending request -----
  if (action === 'aprobar') {
    if (cartera.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Solo se pueden aprobar solicitudes pendientes' }, { status: 400 });
    }

    // Accept both fecha_desembolso and fecha_cuota_1 from the approver. We
    // used to hardcode fecha_desembolso to `new Date()`, which made it
    // impossible to approve a retroactively-disbursed credit or schedule
    // one for a near-future date.
    const fechaDesembolso = body.fecha_desembolso ? new Date(body.fecha_desembolso) : new Date();
    const fechaCuota1 = body.fecha_cuota_1 ? new Date(body.fecha_cuota_1) : fechaDesembolso;
    if (isNaN(fechaDesembolso.getTime())) {
      return NextResponse.json({ error: 'fecha_desembolso inválida' }, { status: 400 });
    }
    if (isNaN(fechaCuota1.getTime())) {
      return NextResponse.json({ error: 'fecha_cuota_1 inválida' }, { status: 400 });
    }

    const fechaTermina = new Date(fechaCuota1);
    const daysPerCuota = cartera.frecuencia_pago === 'quincenal' ? 15 : 30;
    fechaTermina.setDate(fechaTermina.getDate() + daysPerCuota * cartera.numero_cuotas);
    const creditoId = body.credito_id || `CR-${Date.now().toString().slice(-8)}`;

    await db.collection('fondo_cartera').updateOne(
      { _id: new ObjectId(body.cartera_id) },
      {
        $set: {
          estado: 'activo',
          credito_id: creditoId,
          fecha_desembolso: fechaDesembolso,
          fecha_cuota_1: fechaCuota1,
          fecha_termina: fechaTermina,
          aprobado_por: session.user.id,
          aprobado_at: new Date(),
        },
      }
    );

    return NextResponse.json({ success: true });
  }

  // ----- RECHAZAR a pending request -----
  if (action === 'rechazar') {
    await db.collection('fondo_cartera').updateOne(
      { _id: new ObjectId(body.cartera_id) },
      {
        $set: {
          estado: 'rechazado',
          motivo_respuesta: body.motivo_respuesta || null,
          aprobado_por: session.user.id,
          aprobado_at: new Date(),
        },
      }
    );

    return NextResponse.json({ success: true });
  }

  // ----- UPDATE CREDITO_ID -----
  if (action === 'update_credito_id') {
    if (!body.credito_id || !String(body.credito_id).trim()) {
      return NextResponse.json({ error: 'credito_id requerido' }, { status: 400 });
    }
    await db.collection('fondo_cartera').updateOne(
      { _id: new ObjectId(body.cartera_id) },
      { $set: { credito_id: String(body.credito_id).trim() } }
    );
    return NextResponse.json({ success: true });
  }

  // ----- UPDATE FIELDS (general credit editing) -----
  if (action === 'update_fields') {
    const update: Record<string, unknown> = {};
    const fields = body.fields || {};

    if (fields.valor_prestamo !== undefined) update.valor_prestamo = Number(fields.valor_prestamo);
    if (fields.tasa_interes !== undefined) update.tasa_interes = Number(fields.tasa_interes);
    if (fields.numero_cuotas !== undefined) update.numero_cuotas = Number(fields.numero_cuotas);
    if (fields.cuotas_pagadas !== undefined) update.cuotas_pagadas = Number(fields.cuotas_pagadas);
    if (fields.frecuencia_pago !== undefined) update.frecuencia_pago = fields.frecuencia_pago;
    if (fields.saldo_total !== undefined) {
      update.saldo_total = Number(fields.saldo_total);
      update.saldo_capital = Number(fields.saldo_total);
    }
    if (fields.estado !== undefined) update.estado = fields.estado;
    if (fields.fecha_desembolso !== undefined) update.fecha_desembolso = fields.fecha_desembolso ? new Date(fields.fecha_desembolso) : null;
    if (fields.fecha_cuota_1 !== undefined) update.fecha_cuota_1 = fields.fecha_cuota_1 ? new Date(fields.fecha_cuota_1) : null;

    // Recalculate cuotas_restantes if cuotas_pagadas or numero_cuotas changed
    const newNumCuotas = update.numero_cuotas !== undefined ? Number(update.numero_cuotas) : cartera.numero_cuotas;
    const newCuotasPagadas = update.cuotas_pagadas !== undefined ? Number(update.cuotas_pagadas) : cartera.cuotas_pagadas;
    update.cuotas_restantes = Math.max(0, newNumCuotas - newCuotasPagadas);

    update.updated_at = new Date();

    if (Object.keys(update).length <= 1) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    await db.collection('fondo_cartera').updateOne(
      { _id: new ObjectId(body.cartera_id) },
      { $set: update }
    );

    return NextResponse.json({ success: true });
  }

  // ----- PAGO (default) -----
  if (cartera.estado !== 'activo') {
    return NextResponse.json({ error: 'Solo se pueden pagar créditos activos' }, { status: 400 });
  }

  if (!body.monto_total) {
    return NextResponse.json({ error: 'monto_total requerido' }, { status: 400 });
  }

  const montoTotal = Number(body.monto_total);
  const montoCapital = Number(body.monto_capital || 0);
  const montoInteres = Number(body.monto_interes || 0);

  const cuotaEsperada = cartera.numero_cuotas > 0
    ? Math.round((cartera.valor_prestamo + cartera.saldo_interes) / cartera.numero_cuotas * 100) / 100
    : 0;

  const pago = {
    numero_cuota: cartera.cuotas_pagadas + 1,
    fecha_pago: body.fecha_pago ? new Date(body.fecha_pago) : new Date(),
    monto_capital: montoCapital,
    monto_interes: montoInteres,
    monto_total: montoTotal,
    monto_esperado: cuotaEsperada,
    diferencia: Math.round((montoTotal - cuotaEsperada) * 100) / 100,
    flagged: Math.abs(montoTotal - cuotaEsperada) > 1,
  };

  const newSaldoCapital = Math.max(0, cartera.saldo_capital - montoCapital);
  const newSaldoInteres = Math.max(0, cartera.saldo_interes - montoInteres);
  const newCuotasPagadas = cartera.cuotas_pagadas + 1;
  const newCuotasRestantes = Math.max(0, cartera.cuotas_restantes - 1);

  const newFechaTermina = new Date(cartera.fecha_cuota_1);
  newFechaTermina.setMonth(newFechaTermina.getMonth() + newCuotasPagadas + newCuotasRestantes);

  const estado = newSaldoCapital <= 0 ? 'pagado' : 'activo';

  await db.collection('fondo_cartera').updateOne(
    { _id: new ObjectId(body.cartera_id) },
    {
      $set: {
        cuotas_pagadas: newCuotasPagadas,
        cuotas_restantes: newCuotasRestantes,
        saldo_capital: newSaldoCapital,
        saldo_interes: newSaldoInteres,
        saldo_total: newSaldoCapital + newSaldoInteres,
        fecha_termina: newFechaTermina,
        estado,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $push: { pagos: pago } as any,
    }
  );

  return NextResponse.json({ success: true, pago });
}
