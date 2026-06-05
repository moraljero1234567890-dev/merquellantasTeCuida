"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashboardNavbar from '../navbar';
import {
  Boxes,
  Search,
  Eye,
  RefreshCw,
  AlertCircle,
  Filter,
} from 'lucide-react';

interface Item {
  articleNum: string;
  brand: string;
  description: string;
  available: string | null; // null = not fetched yet, "error" = fetch failed
  warehouse: string;
  shown: boolean; // whether the row has been clicked / revealed
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

export default function InventarioContiPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string>('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const itemsRef = useRef<Item[] | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Warm the Continental browser session as soon as the page loads so the
  // first search doesn't pay the login penalty.
  useEffect(() => {
    fetch('/api/conti/warm', { method: 'POST' }).catch(() => {});
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setErr(null);
    setItems(null);
    setElapsed(null);
    setDebug(null);
    setLoading(true);
    const t0 = performance.now();

    try {
      const r = await fetch('/api/conti/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || `HTTP ${r.status}`);
        return;
      }
      setDebug(j.debug || null);
      setSearchedQuery(query);
      setItems(
        (j.items || []).map((m: { articleNum: string; brand: string; description: string }) => ({
          articleNum: m.articleNum,
          brand: m.brand,
          description: m.description,
          available: null,
          warehouse: '',
          shown: false,
        }))
      );
      setElapsed(Math.round(performance.now() - t0));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Conexión perdida');
    } finally {
      setLoading(false);
    }
  }

  async function reveal(articleNum: string) {
    const cur = itemsRef.current?.find((x) => x.articleNum === articleNum);
    if (!cur) return;

    setItems((prev) =>
      prev
        ? prev.map((it) =>
            it.articleNum === articleNum ? { ...it, shown: true } : it
          )
        : prev
    );

    if (cur.available !== null && cur.available !== 'error') return;

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
                  }
                : it
            )
          : prev
      );
    } catch {
      setItems((prev) =>
        prev
          ? prev.map((it) =>
              it.articleNum === articleNum
                ? { ...it, available: 'error', warehouse: '' }
                : it
            )
          : prev
      );
    }
  }

  async function revealAll() {
    const snapshot = itemsRef.current;
    if (!snapshot) return;
    for (const it of snapshot) {
      if (it.shown) continue;
      // Sequential on purpose — the scraper serializes on one browser page.
      await reveal(it.articleNum);
    }
  }

  const filtered = useMemo(() => {
    if (!items) return null;
    const f = filter.trim().toLowerCase();
    if (!f) return items;
    return items.filter((i) =>
      [i.articleNum, i.brand, i.description, i.warehouse]
        .join(' ')
        .toLowerCase()
        .includes(f)
    );
  }, [items, filter]);

  const cachedCount = items
    ? items.filter((i) => i.available !== null && i.available !== 'error').length
    : 0;
  const pendingShownCount = items
    ? items.filter((i) => i.shown && i.available === null).length
    : 0;

  return (
    <>
      <DashboardNavbar activePage="inventario-conti" />
      <div className="pt-20 min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-10 px-4 sm:px-6 lg:px-8 text-black">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
              <Boxes className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Inventario Continental</h1>
              <p className="text-sm text-gray-500">Consulta de disponibilidad en ContiLink</p>
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
                  placeholder="Buscar por artículo o medida… ej. 29580225"
                  className="block w-full rounded-2xl border border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 py-3.5 pl-12 pr-4 text-sm text-gray-900"
                />
              </div>
              <button
                disabled={loading || !query.trim()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium shadow-md hover:from-amber-600 hover:to-amber-700 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Buscando…
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
                  {items.length > 0 && cachedCount > 0 && (
                    <span className="ml-2 text-gray-400">· {cachedCount} en caché</span>
                  )}
                  {pendingShownCount > 0 && (
                    <span className="ml-2 text-amber-600 animate-pulse">
                      cargando {pendingShownCount}
                    </span>
                  )}
                  {elapsed != null && (
                    <span className="ml-2 text-gray-400">
                      · {(elapsed / 1000).toFixed(1)}s
                    </span>
                  )}
                </h2>
                {items.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={revealAll}
                      className="inline-flex items-center gap-1.5 text-xs rounded-xl border border-amber-500 text-amber-700 bg-white hover:bg-amber-50 px-3 py-1.5 font-medium transition-colors"
                    >
                      <Eye size={14} /> Mostrar todo
                    </button>
                    <div className="relative">
                      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="filtrar resultados…"
                        className="text-sm rounded-xl bg-white border border-gray-300 pl-8 pr-3 py-1.5 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 w-56 text-gray-900 placeholder-gray-400"
                      />
                    </div>
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
                <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white shadow-sm">
                  <div className="grid grid-cols-[110px_1fr_130px_80px] sm:grid-cols-[140px_110px_1fr_140px_80px] gap-4 px-4 py-2.5 text-xs uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-200">
                    <div>Artículo</div>
                    <div className="hidden sm:block">Marca</div>
                    <div>Descripción</div>
                    <div className="text-right">Disponible</div>
                    <div className="text-right">Bodega</div>
                  </div>
                  {(filtered || []).map((it) => {
                    const cached = it.available !== null && it.available !== 'error';
                    const errored = it.available === 'error';
                    const n = parseInt(it.available || '', 10);
                    const positive = !isNaN(n) && n > 0;
                    return (
                      <div
                        key={it.articleNum}
                        className="grid grid-cols-[110px_1fr_130px_80px] sm:grid-cols-[140px_110px_1fr_140px_80px] gap-4 px-4 py-3 border-t first:border-t-0 border-gray-100 items-center hover:bg-gray-50/60 transition-colors"
                      >
                        <div className="font-mono text-sm text-gray-900">{it.articleNum}</div>
                        <div className="hidden sm:block text-sm text-gray-600">{it.brand}</div>
                        <div className="text-sm text-gray-800 break-words">{it.description}</div>
                        <div className="text-right">
                          {!it.shown ? (
                            <button
                              onClick={() => reveal(it.articleNum)}
                              className={
                                'text-xs rounded-xl px-3 py-1.5 border transition-colors font-medium ' +
                                (cached
                                  ? 'border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-amber-500 hover:text-amber-700')
                              }
                            >
                              {cached ? 'Ver' : 'Mostrar'}
                            </button>
                          ) : errored ? (
                            <button
                              onClick={() => reveal(it.articleNum)}
                              className="text-xs rounded-xl px-3 py-1.5 border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                            >
                              reintentar
                            </button>
                          ) : !cached ? (
                            <span className="inline-flex items-center gap-2 text-xs text-gray-500">
                              <span className="inline-block h-3 w-8 rounded bg-gray-200 animate-pulse" />
                              cargando
                            </span>
                          ) : (
                            <span
                              className={
                                'font-mono text-base ' +
                                (positive
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-gray-400')
                              }
                            >
                              {it.available || '—'}
                            </span>
                          )}
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          {it.shown && cached ? it.warehouse || '—' : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
