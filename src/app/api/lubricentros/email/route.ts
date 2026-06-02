import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../../lib/db';
import { auth } from '../../../../lib/auth';
import { renderOrdenPdf, OrdenPdfData } from '../../../../lib/lubricentro-orden-pdf';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/lubricentros/email — email an order's PDF to a recipient.
// Sender must be an authenticated (non-externo) staff member.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol === 'externo') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { id, to } = await req.json().catch(() => ({}));
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }
  const recipient = typeof to === 'string' ? to.trim() : '';
  if (!EMAIL_RE.test(recipient) || recipient.length > 200) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
  }

  const db = await getDb();
  const order = await db.collection('lubricentro_ordenes').findOne({ _id: new ObjectId(id) });
  if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

  try {
    const pdf = await renderOrdenPdf(order as OrdenPdfData);
    const ordenNo = order.orden_no || '';

    await transporter.sendMail({
      from: `"Merquellantas" <${process.env.GMAIL_USER}>`,
      to: recipient,
      subject: `Orden de trabajo ${ordenNo}`.replace(/[\r\n]/g, '').slice(0, 200),
      html: `
        <h2>Orden de trabajo ${ordenNo}</h2>
        <p>Adjuntamos la orden de trabajo${order.placa ? ` del vehículo <strong>${order.placa}</strong>` : ''}.</p>
        ${order.total ? `<p><strong>Total:</strong> $ ${order.total}</p>` : ''}
        <p>Gracias por confiar en Merquellantas S.A.S.</p>
      `,
      attachments: [{ filename: `orden-${ordenNo || id}.pdf`, content: pdf }],
    });

    return NextResponse.json({ success: true });
  } catch {
    console.error('Lubricentro email error');
    return NextResponse.json({ error: 'Error al enviar el correo' }, { status: 500 });
  }
}
