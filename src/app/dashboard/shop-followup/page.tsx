"use client";

import React, { useState, useEffect, useCallback } from 'react';
import DashboardNavbar from '../navbar';
import { useSession } from 'next-auth/react';
import {
  Store, Camera, Upload, Trash2, X, ImageOff, CheckCircle2, Clock,
  ShieldAlert, MapPin, ClipboardList, History, Star, Loader2, AlertCircle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// Photo slots a shop documents each week. Keys mirror the API (route.ts).
const FOTO_ITEMS = [
  { key: 'fachada', label: 'Fachada' },
  { key: 'punto_pago', label: 'Punto de pago' },
  { key: 'panoramica_interna', label: 'Panorámica interna' },
  { key: 'bodega', label: 'Bodega' },
  { key: 'lubricentro_exhibicion', label: 'Lubricentro / Exhibición' },
] as const;

// Scorecard dimensions the admin rates 1–5. Keys mirror the API.
const SCORE_ITEMS = [
  { key: 'brand_compliance', label: 'Cumplimiento de marca' },
  { key: 'visual_standards', label: 'Estándares visuales' },
  { key: 'reviews', label: 'Reseñas' },
  { key: 'customer_satisfaction', label: 'Satisfacción del cliente' },
] as const;

const BRAND = '#f4a900';

interface Foto { id: string; url: string; name: string }
type FotoMap = Record<string, Foto | null>;
interface Scorecard {
  brand_compliance: number;
  visual_standards: number;
  reviews: number;
  customer_satisfaction: number;
  promedio: number;
}
interface Report {
  _id: string;
  ciudad: string;
  semana: string;
  fotos: FotoMap;
  comentario: string;
  images_purged?: boolean;
  scorecard: Scorecard | null;
  scorecard_comentario?: string;
  scored_by_nombre?: string | null;
  scored_at?: string;
  created_by_nombre?: string | null;
  created_at?: string;
  updated_at?: string;
}

async function uploadFile(file: File): Promise<Foto> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', 'shop-followup');
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al subir la imagen');
  return { id: data.id, url: data.url, name: data.name };
}

function fmtDate(s?: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// "2026-W26" -> "Semana 26 · 2026"
function fmtSemana(s?: string): string {
  if (!s) return '';
  const m = /^(\d{4})-W(\d{2})$/.exec(s);
  return m ? `Semana ${Number(m[2])} · ${m[1]}` : s;
}

function scoreColor(v: number): string {
  if (v >= 4) return 'text-green-600';
  if (v >= 3) return 'text-amber-600';
  return 'text-red-600';
}

// ---------------------------------------------------------------------------

export default function ShopFollowupPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND }} />
      </div>
    );
  }

  const rol = session?.user?.rol;
  if (!session || rol === 'externo' || rol === 'fondo') {
    return (
      <>
        <DashboardNavbar activePage="shop-followup" />
        <div className="min-h-screen flex items-center justify-center bg-gray-50 pt-16">
          <div className="text-center p-8">
            <ShieldAlert className="h-16 w-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Acceso denegado</h1>
            <p className="text-gray-600">No tienes permisos para esta sección.</p>
          </div>
        </div>
      </>
    );
  }

  const isAdmin = rol === 'admin';

  return (
    <>
      <DashboardNavbar activePage="shop-followup" />
      <div className="min-h-screen bg-gray-50 pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {isAdmin
            ? <AdminView />
            : <SubmitView ciudad={session.user.ciudad || ''} />}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lightbox

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 text-white p-2" onClick={onClose}>
        <X className="h-7 w-7" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Foto"
        className="max-h-[90vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shop submit view

function SubmitView({ ciudad }: { ciudad: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [fotos, setFotos] = useState<FotoMap>({});
  const [comentario, setComentario] = useState('');
  const [semana, setSemana] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [savingComment, setSavingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<Report[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shop-followup?view=current');
      const data = await res.json();
      setSemana(data.semana || '');
      setReport(data.report || null);
      setFotos(data.report?.fotos || {});
      setComentario(data.report?.comentario || '');
      const hres = await fetch('/api/shop-followup?view=historial');
      const hdata = await hres.json();
      setHistory(Array.isArray(hdata.results) ? hdata.results : []);
    } catch {
      setError('No se pudo cargar la información.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Persist the report (photos + comment) and refresh local state from server.
  const persist = useCallback(async (nextFotos: FotoMap, nextComentario: string) => {
    const res = await fetch('/api/shop-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fotos: nextFotos, comentario: nextComentario }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error al guardar');
  }, []);

  const handlePhoto = async (slot: string, file: File | undefined) => {
    if (!file) return;
    setError(null);
    setOkMsg(null);
    setUploading(slot);
    try {
      const foto = await uploadFile(file);
      const next = { ...fotos, [slot]: foto };
      setFotos(next);
      await persist(next, comentario);
      setOkMsg('Foto guardada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la foto');
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (slot: string) => {
    setError(null);
    setOkMsg(null);
    try {
      const next = { ...fotos, [slot]: null };
      setFotos(next);
      await persist(next, comentario);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la foto');
    }
  };

  const saveComment = async () => {
    setSavingComment(true);
    setError(null);
    setOkMsg(null);
    try {
      await persist(fotos, comentario);
      setOkMsg('Comentario guardado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSavingComment(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" style={{ color: BRAND }} /></div>;
  }

  if (!ciudad) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-800">Sin ciudad asignada</h2>
        <p className="text-gray-500 mt-1">No tienes una tienda asignada. Contacta al administrador para poder enviar tu reporte semanal.</p>
      </div>
    );
  }

  const done = FOTO_ITEMS.filter((i) => fotos[i.key]).length;

  return (
    <div>
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Store className="h-6 w-6" style={{ color: BRAND }} /> Seguimiento de tienda
        </h1>
        <p className="text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {ciudad}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {fmtSemana(semana)}</span>
          <span className="inline-flex items-center gap-1 font-medium" style={{ color: BRAND }}>{done}/{FOTO_ITEMS.length} fotos</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}
      {okMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 text-green-700 px-4 py-2 text-sm">
          <CheckCircle2 className="h-4 w-4" /> {okMsg}
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FOTO_ITEMS.map((item) => {
          const foto = fotos[item.key];
          const busy = uploading === item.key;
          return (
            <div key={item.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                {foto
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : <Camera className="h-4 w-4 text-gray-300" />}
              </div>
              <div className="aspect-video bg-gray-50 flex items-center justify-center relative">
                {busy ? (
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                ) : foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={foto.url}
                    alt={item.label}
                    className="h-full w-full object-cover cursor-pointer"
                    onClick={() => setLightbox(foto.url)}
                  />
                ) : (
                  <Camera className="h-8 w-8 text-gray-300" />
                )}
              </div>
              <div className="px-4 py-3 flex items-center gap-2">
                <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ backgroundColor: BRAND }}>
                  <Upload className="h-4 w-4" />
                  {foto ? 'Reemplazar' : 'Subir'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => handlePhoto(item.key, e.target.files?.[0])}
                  />
                </label>
                {foto && (
                  <button
                    onClick={() => handleRemove(item.key)}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-red-500 hover:border-red-200"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comment */}
      <div className="mt-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Comentario (opcional)</label>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={3}
          placeholder="Algo que quieras destacar de la tienda esta semana…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-amber-500 focus:border-amber-500"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={saveComment}
            disabled={savingComment}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: BRAND }}
          >
            {savingComment && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar comentario
          </button>
        </div>
      </div>

      {/* Admin feedback on this week's report */}
      {report?.scorecard && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Evaluación del administrador</h2>
          <ScorecardReadonly report={report} />
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3">
            <History className="h-5 w-5" style={{ color: BRAND }} /> Historial
          </h2>
          <div className="space-y-3">
            {history.map((r) => (
              <div key={r._id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-800">{fmtSemana(r.semana)}</p>
                  <p className="text-xs text-gray-400">{fmtDate(r.created_at)}</p>
                </div>
                {r.scorecard ? (
                  <span className={`text-2xl font-bold ${scoreColor(r.scorecard.promedio)}`}>
                    {r.scorecard.promedio.toFixed(1)}<span className="text-sm text-gray-400 font-normal">/5</span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Sin evaluar</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScorecardReadonly({ report }: { report: Report }) {
  const sc = report.scorecard!;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">
          {report.scored_by_nombre ? `Por ${report.scored_by_nombre}` : 'Evaluado'} · {fmtDate(report.scored_at)}
        </span>
        <span className={`text-2xl font-bold ${scoreColor(sc.promedio)}`}>
          {sc.promedio.toFixed(1)}<span className="text-sm text-gray-400 font-normal">/5</span>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCORE_ITEMS.map((i) => (
          <div key={i.key} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-sm text-gray-700">{i.label}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-gray-800">
              {sc[i.key]} <Star className="h-3.5 w-3.5" style={{ color: BRAND }} fill={BRAND} />
            </span>
          </div>
        ))}
      </div>
      {report.scorecard_comentario && (
        <p className="mt-3 text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{report.scorecard_comentario}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin view

function AdminView() {
  const [tab, setTab] = useState<'current' | 'historial'>('current');
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <div>
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList className="h-6 w-6" style={{ color: BRAND }} /> Seguimiento de tiendas
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Revisa las fotos de cada tienda y registra su calificación semanal.</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-full sm:w-auto sm:inline-flex">
        <TabBtn active={tab === 'current'} onClick={() => setTab('current')} icon={<Camera className="h-4 w-4" />} label="Esta semana" />
        <TabBtn active={tab === 'historial'} onClick={() => setTab('historial')} icon={<History className="h-4 w-4" />} label="Histórico" />
      </div>

      {tab === 'current'
        ? <AdminCurrent onZoom={setLightbox} />
        : <AdminHistorial onZoom={setLightbox} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
        active ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function AdminCurrent({ onZoom }: { onZoom: (url: string) => void }) {
  const [shops, setShops] = useState<{ ciudad: string; report: Report | null }[]>([]);
  const [semana, setSemana] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/shop-followup?view=current');
    const data = await res.json();
    setSemana(data.semana || '');
    setShops(Array.isArray(data.shops) ? data.shops : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" style={{ color: BRAND }} /></div>;
  }

  if (!shops.length) {
    return <EmptyState text="No hay tiendas configuradas todavía." />;
  }

  const submitted = shops.filter((s) => s.report).length;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {fmtSemana(semana)} · <span className="font-medium text-gray-700">{submitted}/{shops.length}</span> tiendas con reporte
      </p>
      <div className="space-y-5">
        {shops.map((s) => (
          <ShopCard key={s.ciudad} ciudad={s.ciudad} report={s.report} onZoom={onZoom} onSaved={load} />
        ))}
      </div>
    </div>
  );
}

function ShopCard({ ciudad, report, onZoom, onSaved }: {
  ciudad: string;
  report: Report | null;
  onZoom: (url: string) => void;
  onSaved: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4" style={{ color: BRAND }} />
          <span className="font-semibold text-gray-800">{ciudad}</span>
        </div>
        {report ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {report.created_by_nombre && <span>Enviado por {report.created_by_nombre}</span>}
            <span>· {fmtDate(report.updated_at || report.created_at)}</span>
            {report.scorecard
              ? <span className={`ml-1 font-bold text-sm ${scoreColor(report.scorecard.promedio)}`}>{report.scorecard.promedio.toFixed(1)}/5</span>
              : <span className="ml-1 inline-flex items-center gap-1 text-amber-600"><Clock className="h-3.5 w-3.5" /> Sin evaluar</span>}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 px-3 py-1 text-xs font-medium">
            <Clock className="h-3.5 w-3.5" /> Pendiente
          </span>
        )}
      </div>

      {report ? (
        <div className="p-5">
          <PhotoRow fotos={report.fotos} purged={report.images_purged} onZoom={onZoom} />
          {report.comentario && (
            <p className="mt-4 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-medium text-gray-700">Comentario de la tienda: </span>{report.comentario}
            </p>
          )}
          <div className="mt-5 border-t border-gray-100 pt-4">
            <ScorecardForm report={report} onSaved={onSaved} />
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-gray-400 text-sm">La tienda aún no ha subido su reporte de esta semana.</div>
      )}
    </div>
  );
}

function PhotoRow({ fotos, purged, onZoom }: { fotos: FotoMap; purged?: boolean; onZoom: (url: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {FOTO_ITEMS.map((item) => {
        const foto = fotos?.[item.key];
        return (
          <div key={item.key}>
            <div className="aspect-video rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto.url} alt={item.label} className="h-full w-full object-cover cursor-pointer" onClick={() => onZoom(foto.url)} />
              ) : purged ? (
                <div className="text-center text-gray-300"><ImageOff className="h-5 w-5 mx-auto" /></div>
              ) : (
                <Camera className="h-5 w-5 text-gray-300" />
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500 text-center truncate">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function ScorecardForm({ report, onSaved }: { report: Report; onSaved: () => void }) {
  const sc = report.scorecard;
  const [vals, setVals] = useState<Record<string, number>>({
    brand_compliance: sc?.brand_compliance || 0,
    visual_standards: sc?.visual_standards || 0,
    reviews: sc?.reviews || 0,
    customer_satisfaction: sc?.customer_satisfaction || 0,
  });
  const [comentario, setComentario] = useState(report.scorecard_comentario || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const complete = SCORE_ITEMS.every((i) => (vals[i.key] || 0) >= 1);

  const save = async () => {
    if (!complete) { setError('Califica las cuatro dimensiones.'); return; }
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch('/api/shop-followup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: report._id, scorecard: vals, scorecard_comentario: comentario }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      setOk(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <Star className="h-4 w-4" style={{ color: BRAND }} /> Scorecard
      </h3>
      <div className="space-y-1">
        {SCORE_ITEMS.map((i) => (
          <RatingRow
            key={i.key}
            label={i.label}
            value={vals[i.key] || 0}
            onChange={(n) => setVals((v) => ({ ...v, [i.key]: n }))}
          />
        ))}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={2}
        placeholder="Comentario / plan de acción (opcional)"
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-amber-500 focus:border-amber-500"
      />
      <div className="mt-2 flex items-center justify-end gap-3">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {ok && <span className="text-xs text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Guardado</span>}
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: BRAND }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {sc ? 'Actualizar calificación' : 'Guardar calificación'}
        </button>
      </div>
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-8 w-8 rounded-md text-sm font-semibold border transition ${
              value >= n ? 'text-white' : 'bg-white border-gray-300 text-gray-400 hover:border-amber-400'
            }`}
            style={value >= n ? { backgroundColor: BRAND, borderColor: BRAND } : undefined}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminHistorial({ onZoom }: { onZoom: (url: string) => void }) {
  const [ciudades, setCiudades] = useState<string[]>([]);
  const [ciudad, setCiudad] = useState('');
  const [results, setResults] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/shop-followup?ciudades=true')
      .then((r) => r.json())
      .then((d) => setCiudades(Array.isArray(d.ciudades) ? d.ciudades : []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const url = ciudad ? `/api/shop-followup?view=historial&ciudad=${encodeURIComponent(ciudad)}` : '/api/shop-followup?view=historial';
    const res = await fetch(url);
    const data = await res.json();
    setResults(Array.isArray(data.results) ? data.results : []);
    setLoading(false);
  }, [ciudad]);

  useEffect(() => { load(); }, [load]);

  // Trend chart: only meaningful when narrowed to one city with ≥2 scores.
  const trend = ciudad
    ? results
        .filter((r) => r.scorecard)
        .slice()
        .reverse()
        .map((r) => ({ semana: fmtSemana(r.semana).replace(' · ', "\n"), promedio: r.scorecard!.promedio }))
    : [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="h-4 w-4 text-gray-400" />
        <select
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm text-gray-900 focus:ring-amber-500 focus:border-amber-500"
        >
          <option value="">Todas las ciudades</option>
          {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {trend.length >= 2 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tendencia · promedio semanal</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="promedio" stroke={BRAND} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" style={{ color: BRAND }} /></div>
      ) : !results.length ? (
        <EmptyState text="No hay reportes en el histórico todavía." />
      ) : (
        <div className="space-y-4">
          {results.map((r) => (
            <div key={r._id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" style={{ color: BRAND }} />
                  <span className="font-semibold text-gray-800">{r.ciudad}</span>
                  <span className="text-xs text-gray-400">· {fmtSemana(r.semana)}</span>
                </div>
                {r.scorecard
                  ? <span className={`font-bold ${scoreColor(r.scorecard.promedio)}`}>{r.scorecard.promedio.toFixed(1)}/5</span>
                  : <span className="text-xs text-amber-600 inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Sin evaluar</span>}
              </div>
              <PhotoRow fotos={r.fotos} purged={r.images_purged} onZoom={onZoom} />
              {r.comentario && (
                <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-700">Tienda: </span>{r.comentario}
                </p>
              )}
              {r.scorecard && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SCORE_ITEMS.map((i) => (
                    <div key={i.key} className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                      <p className="text-[11px] text-gray-500">{i.label}</p>
                      <p className="font-semibold text-gray-800">{r.scorecard![i.key]}<span className="text-xs text-gray-400">/5</span></p>
                    </div>
                  ))}
                </div>
              )}
              {r.scorecard_comentario && (
                <p className="mt-3 text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-700">Admin: </span>{r.scorecard_comentario}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
      <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-2" />
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}
