"use client";

import React, { useState, useEffect, useCallback } from 'react';
import DashboardNavbar from '../navbar';
import { useSession } from 'next-auth/react';
import {
  ClipboardList,
  Search,
  Save,
  CheckCircle,
  AlertCircle,
  Car,
  User2,
  Wrench,
  Calendar,
  X,
} from 'lucide-react';

// Canonical service rows printed on the MERQUELLANTAS "Orden de trabajo".
const SERVICIOS = [
  'Alineación',
  'Cambio de aceite',
  'Filtro de aire primario',
  'Filtro de aire secundario',
  'Filtro aceite',
  'Filtro combustible separador',
  'Filtro refrigeración',
  'Filtro transmisión',
  'Batería',
  'Engrase',
  'Calibración',
  'Análisis de laboratorio',
  'Inspección de baterías',
  'Inspección de llantas',
  'Otros',
];

const FORMAS_PAGO = ['Crédito', 'Tarjeta', 'Efectivo'];

interface ServicioLinea {
  servicio: string;
  referencia: string; // '' | 'sencilla' | 'doble'
  unidad: string;
  valor_unitario: string;
  subtotal: string;
}

// Plain text fields on the order. Everything starts empty; nothing is required.
const emptyFields = {
  orden_no: '',
  fecha: '',
  nombre: '',
  cedula_nit: '',
  fecha_cumpleanos: '',
  direccion: '',
  celular: '',
  correo: '',
  forma_pago: '',
  factura_no: '',
  placa: '',
  marca: '',
  tipo: '',
  km_actual: '',
  frec_cambio_km: '',
  proximo_cambio_meses: '',
  asesor_servicio: '',
  cliente: '',
  observaciones: '',
  subtotal: '',
  iva: '',
  total: '',
};

type Fields = typeof emptyFields;

interface Orden extends Fields {
  _id: string;
  servicios: ServicioLinea[];
  created_at: string;
  created_by_nombre?: string | null;
}

const emptyServicios = (): ServicioLinea[] =>
  SERVICIOS.map((servicio) => ({
    servicio,
    referencia: '',
    unidad: '',
    valor_unitario: '',
    subtotal: '',
  }));

// Small labelled text input used across the form.
function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 py-2 px-3 text-sm"
      />
    </label>
  );
}

export default function LubricentrosPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'nueva' | 'buscar'>('nueva');

  // ---- Form state ----
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [servicios, setServicios] = useState<ServicioLinea[]>(emptyServicios());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const setField = (key: keyof Fields, value: string) =>
    setFields((f) => ({ ...f, [key]: value }));

  const setServicio = (i: number, key: keyof ServicioLinea, value: string) =>
    setServicios((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const resetForm = () => {
    setFields(emptyFields);
    setServicios(emptyServicios());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/lubricentros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, servicios }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar');
      }
      setSaved(true);
      resetForm();
      // Refresh search results in the background so the new order shows up.
      runSearch(query);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ---- Search state ----
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Orden[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [detail, setDetail] = useState<Orden | null>(null);

  const runSearch = useCallback(
    async (q: string) => {
      if (!session) return;
      setLoadingSearch(true);
      try {
        const url = q.trim()
          ? `/api/lubricentros?q=${encodeURIComponent(q.trim())}&limit=200`
          : '/api/lubricentros?limit=200';
        const res = await fetch(url);
        if (res.ok) setResults(await res.json());
      } catch {
        // ignore
      } finally {
        setLoadingSearch(false);
      }
    },
    [session],
  );

  // Debounced search as the user types (and initial load of recent orders).
  useEffect(() => {
    if (tab !== 'buscar') return;
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, tab, runSearch]);

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));

  return (
    <>
      <DashboardNavbar activePage="lubricentros" />
      <div className="pt-20 min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-10 px-4 sm:px-6 lg:px-8 text-black">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
              <Wrench className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Lubricentros</h1>
              <p className="text-sm text-gray-500">Órdenes de trabajo MERQUELLANTAS</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('nueva')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'nueva'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <ClipboardList size={16} />
              Nueva orden
            </button>
            <button
              onClick={() => setTab('buscar')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'buscar'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Search size={16} />
              Buscar
            </button>
          </div>

          {/* ---------- NUEVA ORDEN ---------- */}
          {tab === 'nueva' && (
            <form onSubmit={handleSave} className="space-y-6">
              {saved && (
                <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl flex items-center gap-3 border border-emerald-100">
                  <CheckCircle size={20} />
                  <p className="text-sm font-medium">Orden guardada correctamente.</p>
                  <button
                    type="button"
                    onClick={() => setSaved(false)}
                    className="ml-auto text-emerald-700 hover:text-emerald-900"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              {saveError && (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 border border-red-100">
                  <AlertCircle size={20} />
                  <p className="text-sm">{saveError}</p>
                </div>
              )}

              {/* Datos generales */}
              <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                  <ClipboardList size={18} className="text-amber-500" /> Datos de la orden
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="No. orden de trabajo" value={fields.orden_no} onChange={(v) => setField('orden_no', v)} />
                  <Field label="Fecha" value={fields.fecha} onChange={(v) => setField('fecha', v)} type="date" />
                  <Field label="Factura No." value={fields.factura_no} onChange={(v) => setField('factura_no', v)} />
                  <div>
                    <span className="block text-xs font-medium text-gray-500 mb-1">Forma de pago</span>
                    <div className="flex flex-wrap gap-2">
                      {FORMAS_PAGO.map((fp) => (
                        <button
                          type="button"
                          key={fp}
                          onClick={() => setField('forma_pago', fields.forma_pago === fp ? '' : fp)}
                          className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                            fields.forma_pago === fp
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {fp}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field label="Asesor de servicio" value={fields.asesor_servicio} onChange={(v) => setField('asesor_servicio', v)} />
                </div>
              </section>

              {/* Cliente */}
              <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                  <User2 size={18} className="text-amber-500" /> Cliente
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Nombre" value={fields.nombre} onChange={(v) => setField('nombre', v)} />
                  <Field label="Cédula y/o NIT" value={fields.cedula_nit} onChange={(v) => setField('cedula_nit', v)} />
                  <Field label="Fecha de cumpleaños" value={fields.fecha_cumpleanos} onChange={(v) => setField('fecha_cumpleanos', v)} />
                  <Field label="Dirección" value={fields.direccion} onChange={(v) => setField('direccion', v)} />
                  <Field label="Celular" value={fields.celular} onChange={(v) => setField('celular', v)} />
                  <Field label="Correo electrónico" value={fields.correo} onChange={(v) => setField('correo', v)} />
                  <Field label="Cliente" value={fields.cliente} onChange={(v) => setField('cliente', v)} />
                </div>
              </section>

              {/* Vehículo */}
              <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                  <Car size={18} className="text-amber-500" /> Vehículo
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Placa" value={fields.placa} onChange={(v) => setField('placa', v)} />
                  <Field label="Marca" value={fields.marca} onChange={(v) => setField('marca', v)} />
                  <Field label="Tipo" value={fields.tipo} onChange={(v) => setField('tipo', v)} />
                  <Field label="KM actual vehículo" value={fields.km_actual} onChange={(v) => setField('km_actual', v)} />
                  <Field label="Frec. cambio (km)" value={fields.frec_cambio_km} onChange={(v) => setField('frec_cambio_km', v)} />
                  <Field label="Próximo cambio (meses)" value={fields.proximo_cambio_meses} onChange={(v) => setField('proximo_cambio_meses', v)} />
                </div>
              </section>

              {/* Servicios */}
              <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                  <Wrench size={18} className="text-amber-500" /> Servicios
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                        <th className="py-2 pr-3 font-medium">Servicio</th>
                        <th className="py-2 px-2 font-medium">Referencia</th>
                        <th className="py-2 px-2 font-medium">Unidad</th>
                        <th className="py-2 px-2 font-medium">Valor unitario</th>
                        <th className="py-2 pl-2 font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servicios.map((row, i) => (
                        <tr key={row.servicio} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{row.servicio}</td>
                          <td className="py-2 px-2">
                            <div className="flex gap-1">
                              {['sencilla', 'doble'].map((ref) => (
                                <button
                                  type="button"
                                  key={ref}
                                  onClick={() => setServicio(i, 'referencia', row.referencia === ref ? '' : ref)}
                                  className={`px-2 py-1 rounded text-xs border capitalize transition-colors ${
                                    row.referencia === ref
                                      ? 'bg-amber-500 text-white border-amber-500'
                                      : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {ref}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              value={row.unidad}
                              onChange={(e) => setServicio(i, 'unidad', e.target.value)}
                              className="w-20 rounded border border-gray-300 py-1 px-2 text-sm focus:ring-amber-500 focus:border-amber-500"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              value={row.valor_unitario}
                              onChange={(e) => setServicio(i, 'valor_unitario', e.target.value)}
                              className="w-28 rounded border border-gray-300 py-1 px-2 text-sm focus:ring-amber-500 focus:border-amber-500"
                            />
                          </td>
                          <td className="py-2 pl-2">
                            <input
                              value={row.subtotal}
                              onChange={(e) => setServicio(i, 'subtotal', e.target.value)}
                              className="w-28 rounded border border-gray-300 py-1 px-2 text-sm focus:ring-amber-500 focus:border-amber-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Totales y observaciones */}
              <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <label className="block lg:row-span-3">
                    <span className="block text-xs font-medium text-gray-500 mb-1">Observaciones</span>
                    <textarea
                      rows={5}
                      value={fields.observaciones}
                      onChange={(e) => setField('observaciones', e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 py-2 px-3 text-sm resize-y h-full"
                    />
                  </label>
                  <Field label="Subtotal" value={fields.subtotal} onChange={(v) => setField('subtotal', v)} />
                  <Field label="IVA" value={fields.iva} onChange={(v) => setField('iva', v)} />
                  <Field label="Total" value={fields.total} onChange={(v) => setField('total', v)} />
                </div>
              </section>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Limpiar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium shadow-md hover:from-amber-600 hover:to-amber-700 transition-colors disabled:opacity-50"
                >
                  <Save size={18} />
                  {saving ? 'Guardando...' : 'Guardar orden'}
                </button>
              </div>
            </form>
          )}

          {/* ---------- BUSCAR ---------- */}
          {tab === 'buscar' && (
            <div className="space-y-5">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre, cédula, placa, factura, servicio, asesor..."
                  className="block w-full rounded-2xl border border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 py-3.5 pl-12 pr-4 text-sm"
                />
              </div>

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  {loadingSearch
                    ? 'Buscando...'
                    : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`}
                </span>
              </div>

              {results.length === 0 && !loadingSearch ? (
                <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
                  <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No se encontraron órdenes.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {results.map((o) => (
                    <button
                      key={o._id}
                      onClick={() => setDetail(o)}
                      className="text-left bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:border-amber-300 hover:shadow transition-all"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-semibold text-gray-900">
                          {o.orden_no ? `Orden ${o.orden_no}` : 'Orden sin número'}
                        </span>
                        {o.placa && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            {o.placa}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 truncate">{o.nombre || 'Sin nombre'}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[o.cedula_nit, o.marca, o.tipo].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(o.created_at)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4 backdrop-blur-sm"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl relative border border-gray-100 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setDetail(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
              aria-label="Cerrar"
            >
              <X size={22} />
            </button>

            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {detail.orden_no ? `Orden ${detail.orden_no}` : 'Orden de trabajo'}
            </h2>
            <p className="text-xs text-gray-400 mb-5">
              Registrada {formatDate(detail.created_at)}
              {detail.created_by_nombre ? ` · ${detail.created_by_nombre}` : ''}
            </p>

            <DetailGrid
              rows={[
                ['Fecha', detail.fecha],
                ['Factura No.', detail.factura_no],
                ['Forma de pago', detail.forma_pago],
                ['Asesor', detail.asesor_servicio],
                ['Nombre', detail.nombre],
                ['Cédula / NIT', detail.cedula_nit],
                ['Cumpleaños', detail.fecha_cumpleanos],
                ['Dirección', detail.direccion],
                ['Celular', detail.celular],
                ['Correo', detail.correo],
                ['Cliente', detail.cliente],
                ['Placa', detail.placa],
                ['Marca', detail.marca],
                ['Tipo', detail.tipo],
                ['KM actual', detail.km_actual],
                ['Frec. cambio (km)', detail.frec_cambio_km],
                ['Próximo cambio (meses)', detail.proximo_cambio_meses],
              ]}
            />

            {detail.servicios && detail.servicios.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Servicios</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="py-1.5 pr-3">Servicio</th>
                        <th className="py-1.5 px-2">Ref.</th>
                        <th className="py-1.5 px-2">Unidad</th>
                        <th className="py-1.5 px-2">V. unitario</th>
                        <th className="py-1.5 pl-2">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.servicios.map((s, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="py-1.5 pr-3 text-gray-700">{s.servicio}</td>
                          <td className="py-1.5 px-2 capitalize">{s.referencia || '—'}</td>
                          <td className="py-1.5 px-2">{s.unidad || '—'}</td>
                          <td className="py-1.5 px-2">{s.valor_unitario || '—'}</td>
                          <td className="py-1.5 pl-2">{s.subtotal || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.observaciones && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Observaciones</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{detail.observaciones}</p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <span className="text-gray-500">Subtotal: <span className="text-gray-800">{detail.subtotal || '—'}</span></span>
              <span className="text-gray-500">IVA: <span className="text-gray-800">{detail.iva || '—'}</span></span>
              <span className="text-gray-500">Total: <span className="font-semibold text-gray-900">{detail.total || '—'}</span></span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
  const visible = rows.filter(([, v]) => v && v.trim());
  if (visible.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
      {visible.map(([label, value]) => (
        <div key={label}>
          <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
          <div className="text-sm text-gray-800 break-words">{value}</div>
        </div>
      ))}
    </div>
  );
}
