import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../../lib/db';
import { auth } from '../../../../lib/auth';
import { renderOrdenPdf, OrdenPdfData } from '../../../../lib/lubricentro-orden-pdf';

// GET /api/lubricentros/pdf?id=<id> — download an order as a PDF.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol === 'externo') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const db = await getDb();
  const order = await db.collection('lubricentro_ordenes').findOne({ _id: new ObjectId(id) });
  if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

  const pdf = await renderOrdenPdf(order as OrdenPdfData);
  const filename = `orden-${order.orden_no || id}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
