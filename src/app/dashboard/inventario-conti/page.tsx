"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashboardNavbar from '../navbar';
import {
  Boxes,
  Search,
  RefreshCw,
  AlertCircle,
  Filter,
} from 'lucide-react';

// Sale prices from the company cost (PVD): true commercial margin plus IVA,
// i.e. precio = PVD / (1 - margen) * 1.19 — NOT a simple markup on cost.
// Decimal rim sizes (e.g. 215/75R17.5, 295/80R22.5 — truck/trailer tires)
// carry lower margins than the standard line.
const IVA = 1.19;
const MARGENES = [
  { key: 'general', label: 'General', pct: 0.32, pctDecimal: 0.26 },
  { key: 'flotas', label: 'Flotas', pct: 0.26, pctDecimal: 0.22 },
  { key: 'dist', label: 'Dist', pct: 0.22, pctDecimal: 0.17 },
] as const;

// A size "ending in .5" (17.5 / 19.5 / 22.5 rims and the like).
const hasDecimalSize = (description: string) => /\d+\.5(?!\d)/.test(description);

// Let people type the size any way they like — 295/80R22.5, 295 80 22.5,
// 295-80r22.5 — ContiLink wants the bare digit group (29580225), so keep
// only the numbers. Short or non-numeric queries pass through untouched.
const normalizeQuery = (raw: string): string => {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D+/g, '');
  return digits.length >= 5 ? digits : trimmed;
};

const fmtCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

interface Item {
  articleNum: string;
  description: string;
  available: string | null; // null = still loading, "error" = fetch failed
  warehouse: string;
  pvd: number | null;
}

interface DebugInfo {
  triggered?: boolean;
  triggerReason?: string;
  haveSearchResults?: boolean;
  searching?: boolean;
  resultCount?: number;
  tireSearchType?: string;
  freeTextSearch?: string;
}

type StreamEvent =
  | { type: 'results'; items: { articleNum: string; brand: string; description: string }[]; debug?: DebugInfo }
  | { type: 'availability'; articleNum: string; available: string; warehouse: string; pvd: number | null }
  | { type: 'error'; error: string }
  | { type: 'done' };

export default function InventarioContiPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string>('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const runIdRef = useRef(0);
  const itemsRef = useRef<Item[] | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Keep the Continental browser session warm while the page is open: on
  // load, every 4 minutes, and when the tab regains focus — so searches hit
  // a logged-in instance instead of paying Chromium launch + login.
  useEffect(() => {
    const warm = () => fetch('/api/conti/warm', { method: 'POST' }).catch(() => {});
    warm();
    const interval = setInterval(warm, 4 * 60 * 1000);
    const onFocus = () => {
      if (document.visibilityState === 'visible') warm();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const q = normalizeQuery(query);
    const runId = ++runIdRef.current;
    setErr(null);
    setItems(null);
    setElapsed(null);
    setDebug(null);
    setLoading(true);
    setStreaming(true);
    const t0 = performance.now();

    const handleEvent = (ev: StreamEvent) => {
      if (runIdRef.current !== runId) return; // stale stream
      if (ev.type === 'results') {
        setDebug(ev.debug || null);
        setSearchedQuery(q);
        setElapsed(Math.round(performance.now() - t0));
        setItems(
          (ev.items || []).map((m) => ({
            articleNum: m.articleNum,
            description: m.description,
            available: null,
            warehouse: '',
            pvd: null,
          }))
        );
        setLoading(false);
      } else if (ev.type === 'availability') {
        setItems((prev) =>
          prev
            ? prev.map((it) =>
                it.articleNum === ev.articleNum
                  ? {
                      ...it,
                      available: ev.available || '—',
                      warehouse: ev.warehouse || '',
                      pvd: ev.pvd ?? null,
                    }
                  : it
              )
            : prev
        );
      } else if (ev.type === 'error') {
        setErr(ev.error || 'Error desconocido');
      }
    };

    const attemptStream = async () => {
      try {
        const r = await fetch('/api/conti/stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        if (!r.ok || !r.body) {
          const j = await r.json().catch(() => ({}));
          if (runIdRef.current === runId) setErr(j.error || `HTTP ${r.status}`);
          return;
        }

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              handleEvent(JSON.parse(line) as StreamEvent);
            } catch {}
          }
        }
      } catch (e) {
        if (runIdRef.current === runId) {
          setErr(e instanceof Error ? e.message : 'Conexión perdida');
        }
      }
    };

    try {
      // Up to 2 attempts at the whole stream: a transient scraper failure
      // (e.g. "Execution context was destroyed") can kill the search before
      // any results arrive — just run it again instead of showing the error.
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (runIdRef.current !== runId) return;
        if (attempt > 1) {
          setErr(null);
          await new Promise((r) => setTimeout(r, 1500));
        }
        await attemptStream();
        if (runIdRef.current !== runId || itemsRef.current !== null) break;
      }
    } finally {
      if (runIdRef.current === runId) {
        setLoading(false);
        // Stream over — keep resolving whatever is left, pass after pass,
        // until EVERY row has a value. Transient scraper failures
        // ("Execution context was destroyed", timeouts, cold lambdas) heal
        // on a later pass; the user never has to click anything.
        const pendingArts = () =>
          (itemsRef.current || [])
            .filter((it) => it.available === null || it.available === 'error')
            .map((it) => it.articleNum);
        for (let pass = 1; runIdRef.current === runId; pass++) {
          const left = pendingArts();
          if (left.length === 0) break;
          for (const articleNum of left) {
            if (runIdRef.current !== runId) break;
            // Sequential on purpose — the scraper serializes on one browser page.
            await retry(articleNum);
          }
          if (runIdRef.current !== runId || pendingArts().length === 0) break;
          // Back off a little more on each full pass so we don't hammer
          // the scraper while ContiLink is having a moment.
          await new Promise((r) => setTimeout(r, Math.min(15000, 2000 * pass)));
        }
        if (runIdRef.current === runId) setStreaming(false);
      }
    }
  }

  // Per-row retry for availabilities the stream couldn't resolve.
  async function retry(articleNum: string) {
    setItems((prev) =>
      prev
        ? prev.map((it) => (it.articleNum === articleNum ? { ...it, available: null } : it))
        : prev
    );
    try {
      const r = await fetch('/api/conti/availability', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ articleNum, query: searchedQuery }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setItems((prev) =>
        prev
          ? prev.map((it) =>
              it.articleNum === articleNum
                ? {
                    ...it,
                    available: j.available || '—',
                    warehouse: j.warehouse || '',
                    pvd: j.pvd ?? null,
                  }
                : it
            )
          : prev
      );
    } catch {
      setItems((prev) =>
        prev
          ? prev.map((it) =>
              it.articleNum === articleNum ? { ...it, available: 'error', warehouse: '' } : it
            )
          : prev
      );
    }
  }

  const filtered = useMemo(() => {
    if (!items) return null;
    const f = filter.trim().toLowerCase();
    if (!f) return items;
    return items.filter((i) =>
      [i.articleNum, i.description, i.warehouse]
        .join(' ')
        .toLowerCase()
        .includes(f)
    );
  }, [items, filter]);

  const resolvedCount = items
    ? items.filter((i) => i.available !== null && i.available !== 'error').length
    : 0;
  const pendingCount = items
    ? items.filter((i) => i.available === null || i.available === 'error').length
    : 0;

  return (
    <>
      <DashboardNavbar activePage="inventario-conti" />
      <div className="pt-20 min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-10 px-4 sm:px-6 lg:px-8 text-black">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
              <Boxes className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Inventario Continental</h1>
              <p className="text-sm text-gray-500">Consulta de disponibilidad y precios en ContiLink</p>
            </div>
          </div>

          {/* Búsqueda */}
          <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <form onSubmit={run} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por artículo o medida… ej. 295/80R22.5 o 29580225"
                  className="block w-full rounded-2xl border border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 py-3.5 pl-12 pr-4 text-sm text-gray-900"
                />
              </div>
              <button
                disabled={loading || streaming || !query.trim()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium shadow-md hover:from-amber-600 hover:to-amber-700 transition-colors disabled:opacity-50"
              >
                {loading || streaming ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {loading ? 'Buscando…' : 'Cargando inventario…'}
                  </>
                ) : (
                  <>
                    <Search size={16} /> Buscar
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Error */}
          {err && (
            <div className="p-4 bg-red-50 text-red-800 rounded-xl flex items-start gap-3 border border-red-100 mb-6">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <p className="text-sm font-medium break-words flex-1">{err}</p>
              <a
                href="/api/conti/debug?view=image"
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs text-red-700 hover:text-red-900 underline"
              >
                ver captura →
              </a>
            </div>
          )}

          {/* Resultados */}
          {items && !err && (
            <div>
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h2 className="text-xs uppercase tracking-wide text-gray-500">
                  {items.length} resultado{items.length === 1 ? '' : 's'}
                  {resolvedCount > 0 && resolvedCount < items.length && (
                    <span className="ml-2 text-gray-400">· {resolvedCount} listos</span>
                  )}
                  {pendingCount > 0 && (
                    <span className="ml-2 text-amber-600 animate-pulse">
                      cargando {pendingCount}
                    </span>
                  )}
                  {elapsed != null && (
                    <span className="ml-2 text-gray-400">
                      · {(elapsed / 1000).toFixed(1)}s
                    </span>
                  )}
                </h2>
                {items.length > 0 && (
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="filtrar resultados…"
                      className="text-sm rounded-xl bg-white border border-gray-300 pl-8 pr-3 py-1.5 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 w-56 text-gray-900 placeholder-gray-400"
                    />
                  </div>
                )}
              </div>

              {items.length === 0 ? (
                <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100 space-y-3">
                  <p>Sin resultados.</p>
                  {debug && (
                    <pre className="inline-block text-left text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-x-auto">
{`triggerReason:    ${debug.triggerReason ?? '—'}
freeTextSearch:   ${debug.freeTextSearch ?? '—'}
tireSearchType:   ${debug.tireSearchType || '(ninguno)'}
resultCount:      ${debug.resultCount ?? 0}
haveSearchResults:${String(debug.haveSearchResults ?? false)}`}
                    </pre>
                  )}
                  <div>
                    <a
                      href="/api/conti/debug?view=image"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs text-gray-500 hover:text-gray-900 underline-offset-4 hover:underline"
                    >
                      ver captura del navegador →
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-x-auto">
                  <div className="min-w-[880px]">
                    <div className="grid grid-cols-[120px_1fr_90px_110px_110px_110px_70px] gap-3 px-4 py-2.5 text-xs uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-200">
                      <div>Artículo</div>
                      <div>Descripción</div>
                      <div className="text-right">Disponible</div>
                      <div className="text-right">General</div>
                      <div className="text-right">Flotas</div>
                      <div className="text-right">Dist</div>
                      <div className="text-right">Bodega</div>
                    </div>
                    {(filtered || []).map((it) => {
                      const resolved = it.available !== null && it.available !== 'error';
                      const pending = !resolved; // null or transient 'error' — keeps retrying
                      const n = parseInt(it.available || '', 10);
                      const positive = !isNaN(n) && n > 0;
                      return (
                        <div
                          key={it.articleNum}
                          className="grid grid-cols-[120px_1fr_90px_110px_110px_110px_70px] gap-3 px-4 py-3 border-t first:border-t-0 border-gray-100 items-center hover:bg-gray-50/60 transition-colors"
                        >
                          <div className="font-mono text-sm text-gray-900">{it.articleNum}</div>
                          <div className="text-sm text-gray-800 break-words">{it.description}</div>
                          <div className="text-right">
                            {pending ? (
                              <span className="inline-block h-3 w-8 rounded bg-gray-200 animate-pulse" />
                            ) : (
                              <span
                                className={
                                  'font-mono text-base ' +
                                  (positive ? 'text-amber-700 font-semibold' : 'text-gray-400')
                                }
                              >
                                {it.available || '—'}
                              </span>
                            )}
                          </div>
                          {MARGENES.map((m) => {
                            const pct = hasDecimalSize(it.description) ? m.pctDecimal : m.pct;
                            return (
                              <div key={m.key} className="text-right">
                                {pending ? (
                                  <span className="inline-block h-3 w-14 rounded bg-gray-200 animate-pulse" />
                                ) : resolved && it.pvd ? (
                                  <span className="font-mono text-sm text-gray-900">
                                    {fmtCOP.format(Math.round((it.pvd / (1 - pct)) * IVA))}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 text-sm">—</span>
                                )}
                              </div>
                            );
                          })}
                          <div className="text-right text-xs text-gray-500">
                            {resolved ? it.warehouse || '—' : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
