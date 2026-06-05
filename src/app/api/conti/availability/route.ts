import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOneAvailability, ensureWarm } from '@/lib/conti';

export const runtime = 'nodejs';
export const maxDuration = 90;

// Simple in-memory cache (per server instance)
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 5 * 60 * 1000; // 5 minutes — stock doesn't move that fast

function getCached(key: string) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > TTL) {
    cache.delete(key);
    return null;
  }
  return v.data;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// Hard timeout wrapper
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout')), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const articleNum = String(body.articleNum || '').trim();
  const query = body.query ? String(body.query).trim() : undefined;

  if (!articleNum) {
    return NextResponse.json({ error: 'Falta articleNum' }, { status: 400 });
  }

  const cacheKey = `${articleNum}:${query || ''}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    // Warm browser (avoids cold start penalties)
    await ensureWarm().catch(() => {});

    // Longer than every internal puppeteer timeout on purpose: the scrape
    // must fail (and release its lock + reset the page) before this fires,
    // otherwise it keeps running in the background and later requests queue
    // behind a dead one.
    const result = await withTimeout(
      getOneAvailability(articleNum, query),
      80000
    );

    setCache(cacheKey, result);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
