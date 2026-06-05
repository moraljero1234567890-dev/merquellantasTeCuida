import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { searchOnly } from '@/lib/conti';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { query } = await req.json().catch(() => ({}));
  const q = String(query || '').trim();
  if (!q) return NextResponse.json({ error: 'Falta la búsqueda' }, { status: 400 });
  try {
    const { items, debug } = await searchOnly(q);
    return NextResponse.json({ items, debug });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
