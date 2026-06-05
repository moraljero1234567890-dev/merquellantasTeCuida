import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { searchAndStream } from '@/lib/conti';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Single-invocation search + availability: logs in once, searches once, adds
// every result to the cart in one shot and streams availabilities (count +
// PVD) back as NDJSON lines while ContiLink resolves them. Much cheaper than
// one full scrape (login + search + cart) per article.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { query } = await req.json().catch(() => ({}));
  const q = String(query || '').trim();
  if (!q) return NextResponse.json({ error: 'Falta la búsqueda' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        } catch {
          // Client disconnected — let the scrape finish quietly.
        }
      };
      searchAndStream(q, send)
        .catch((err: unknown) => {
          send({ type: 'error', error: err instanceof Error ? err.message : String(err) });
        })
        .finally(() => {
          send({ type: 'done' });
          try {
            controller.close();
          } catch {}
        });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // Disable buffering so lines reach the browser as they're emitted.
      'x-accel-buffering': 'no',
    },
  });
}
