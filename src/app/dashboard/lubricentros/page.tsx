"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { addMonths } from 'date-fns';
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
  Bell,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Phone,
  PhoneOff,
  CalendarPlus,
  CalendarClock,
  FilePlus,
  Settings2,
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

const FORMAS_PAGO = [
  'Solunion',
  'Mundo Financiera',
  'Crédito Directo',
  'Crédito',
  'Tarjeta',
  'Efectivo',
];

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

// Local YYYY-MM-DD, used to default <input type="date"> to today.
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fresh form values: everything blank except Fecha, which defaults to today
// (still editable). The order number is assigned by the server on save.
const freshFields = (): Fields => ({ ...emptyFields, fecha: todayStr() });

interface Orden extends Fields {
  _id: string;
  servicios: ServicioLinea[];
  created_at: string;
  created_by_nombre?: string | null;
  proximo_cambio_fecha?: string | null;
  gestion_tipo?: string | null;
  gestion_fecha?: string | null;
  gestion_nota?: string | null;
}

// Shapes returned by the autocomplete suggestion endpoints.
interface ClienteSug {
  cedula_nit: string;
  nombre: string;
  fecha_cumpleanos: string;
  direccion: string;
  celular: string;
  correo: string;
  cliente: string;
}
interface VehiculoSug {
  placa: string;
  marca: string;
  tipo: string;
  frec_cambio_km: string;
  proximo_cambio_meses: string;
}

const ALERTAS_PAGE_SIZE = 20;

// Required fields: customer identity + the whole vehicle block. Everything else
// (and all services) stays optional.
const REQUIRED: { key: keyof Fields; label: string }[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'cedula_nit', label: 'Cédula y/o NIT' },
  { key: 'celular', label: 'Celular' },
  { key: 'placa', label: 'Placa' },
  { key: 'marca', label: 'Marca' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'km_actual', label: 'KM actual vehículo' },
  { key: 'frec_cambio_km', label: 'Frec. cambio (km)' },
  { key: 'proximo_cambio_meses', label: 'Próximo cambio (meses)' },
];

// Compute the next-change date from the months interval. Base is the service
// date (YYYY-MM-DD) when present, otherwise today — mirroring the server so the
// form preview matches what gets stored. Returns null only when months is
// missing/invalid.
function computeNextChange(fecha: string, meses: string): Date | null {
  const m = parseInt(meses, 10);
  if (!Number.isFinite(m)) return null;
  let base = new Date();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (match) {
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(parsed.getTime())) base = parsed;
  }
  return addMonths(base, m);
}

type StatusColor = 'red' | 'yellow' | 'green';

// Classify a next-change date relative to today:
//   red    = already passed (overdue)
//   yellow = due within the next month
//   green  = further out
function changeStatus(iso?: string | null): StatusColor | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  if (t < today) return 'red';
  if (t <= addMonths(today, 1)) return 'yellow';
  return 'green';
}

const STATUS_STYLES: Record<StatusColor, { border: string; badge: string; label: string }> = {
  red: { border: 'border-l-red-500', badge: 'bg-red-100 text-red-700 border-red-200', label: 'Vencido' },
  yellow: { border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Próximo mes' },
  green: { border: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Al día' },
};

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
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 py-2 px-3 text-sm"
      />
    </label>
  );
}

interface AutoOption {
  value: string;
  secondary?: string;
}

// Labelled input with a custom, scrollable suggestions dropdown. Unlike a
// native <datalist> it styles each option (primary + secondary line) and
// scrolls cleanly when there are many matches. Used outside scroll containers
// so the absolute dropdown isn't clipped; z-50 keeps it above the cards below.
function Autocomplete({
  label,
  value,
  onChange,
  onSelect,
  required = false,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (opt: AutoOption) => void;
  required?: boolean;
  placeholder?: string;
  options: AutoOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
        <input
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 py-2 px-3 text-sm"
        />
      </label>
      {open && options.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg divide-y divide-gray-100">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                // Prevent the input blur from firing before the click registers.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(o);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-amber-50 transition-colors"
              >
                <div className="text-sm font-medium text-gray-900 truncate">{o.value}</div>
                {o.secondary && <div className="text-xs text-gray-500 truncate">{o.secondary}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LubricentrosPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'nueva' | 'buscar' | 'alertas' | 'revisiones'>('nueva');

  // ---- Form state ----
  const [fields, setFields] = useState<Fields>(freshFields);
  const [servicios, setServicios] = useState<ServicioLinea[]>(emptyServicios());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedNo, setSavedNo] = useState<string | null>(null);
  const [savedEdit, setSavedEdit] = useState(false);
  // When set, the form edits this existing order instead of creating a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNo, setEditingNo] = useState<string | null>(null);
  // Preview of the next consecutive order number that will be assigned on save.
  const [nextNo, setNextNo] = useState<string | null>(null);

  const fetchNextNo = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/lubricentros?next=true');
      if (res.ok) {
        const d = await res.json();
        setNextNo(d.next || null);
      }
    } catch {
      // ignore
    }
  }, [session]);

  useEffect(() => {
    fetchNextNo();
  }, [fetchNextNo]);

  // ---- Autocomplete suggestions (reuse existing client / vehicle / product data) ----
  const [clienteSugs, setClienteSugs] = useState<ClienteSug[]>([]);
  const [vehiculoSugs, setVehiculoSugs] = useState<VehiculoSug[]>([]);
  const [productoSugs, setProductoSugs] = useState<string[]>([]);
  const [productoQuery, setProductoQuery] = useState('');

  // As the cédula is typed, suggest matching customers; when it exactly matches
  // an existing one (e.g. picked from the list), pull that customer's data.
  // Skipped while editing so we don't clobber the order being edited.
  useEffect(() => {
    const q = fields.cedula_nit.trim();
    if (!q) {
      setClienteSugs([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lubricentros?suggest=cliente&q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const list: ClienteSug[] = await res.json();
        setClienteSugs(list);
        if (editingId) return;
        const exact = list.find((s) => s.cedula_nit.toLowerCase() === q.toLowerCase());
        if (exact) {
          setFields((f) => ({
            ...f,
            nombre: exact.nombre,
            fecha_cumpleanos: exact.fecha_cumpleanos,
            direccion: exact.direccion,
            celular: exact.celular,
            correo: exact.correo,
            cliente: exact.cliente,
          }));
        }
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(t);
  }, [fields.cedula_nit, editingId]);

  // Same idea for the plate — fill the vehicle block on an exact match, but
  // never KM actual (the person must always enter the latest reading).
  useEffect(() => {
    const q = fields.placa.trim();
    if (!q) {
      setVehiculoSugs([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lubricentros?suggest=vehiculo&q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const list: VehiculoSug[] = await res.json();
        setVehiculoSugs(list);
        if (editingId) return;
        const exact = list.find((s) => s.placa.toUpperCase() === q.toUpperCase());
        if (exact) {
          setFields((f) => ({
            ...f,
            marca: exact.marca,
            tipo: exact.tipo,
            frec_cambio_km: exact.frec_cambio_km,
            proximo_cambio_meses: exact.proximo_cambio_meses,
          }));
        }
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(t);
  }, [fields.placa, editingId]);

  // Product suggestions for the open-text service rows.
  useEffect(() => {
    const q = productoQuery.trim();
    if (!q) {
      setProductoSugs([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lubricentros?suggest=producto&q=${encodeURIComponent(q)}`);
        if (res.ok) setProductoSugs(await res.json());
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(t);
  }, [productoQuery]);

  const setField = (key: keyof Fields, value: string) =>
    setFields((f) => ({ ...f, [key]: value }));

  const setServicio = (i: number, key: keyof ServicioLinea, value: string) =>
    setServicios((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const updated = { ...r, [key]: value };
        // Subtotal is always unidad × valor unitario — never typed directly.
        if (key === 'unidad' || key === 'valor_unitario') {
          const u = parseInt(updated.unidad, 10) || 0;
          const v = parseInt(updated.valor_unitario, 10) || 0;
          updated.subtotal = u && v ? String(u * v) : '';
        }
        return updated;
      }),
    );

  // Fill the whole client / vehicle block from a chosen suggestion. Vehicle fill
  // never touches km_actual — the latest reading must always be entered.
  const fillCliente = (s: ClienteSug) =>
    setFields((f) => ({
      ...f,
      cedula_nit: s.cedula_nit,
      nombre: s.nombre,
      fecha_cumpleanos: s.fecha_cumpleanos,
      direccion: s.direccion,
      celular: s.celular,
      correo: s.correo,
      cliente: s.cliente,
    }));
  const fillVehiculo = (s: VehiculoSug) =>
    setFields((f) => ({
      ...f,
      placa: s.placa.toUpperCase(),
      marca: s.marca,
      tipo: s.tipo,
      frec_cambio_km: s.frec_cambio_km,
      proximo_cambio_meses: s.proximo_cambio_meses,
    }));

  const resetForm = () => {
    setFields(freshFields());
    setServicios(emptyServicios());
    setEditingId(null);
    setEditingNo(null);
  };

  // Load an existing order into the form for editing.
  const startEdit = (o: Orden) => {
    const next = { ...emptyFields };
    (Object.keys(emptyFields) as (keyof Fields)[]).forEach((k) => {
      next[k] = (o[k] as string) || '';
    });
    const rows = emptyServicios();
    (o.servicios || []).forEach((s) => {
      const idx = rows.findIndex((r) => r.servicio === s.servicio);
      if (idx >= 0) {
        rows[idx] = {
          servicio: s.servicio,
          referencia: s.referencia || '',
          unidad: s.unidad || '',
          valor_unitario: s.valor_unitario || '',
          subtotal: s.subtotal || '',
        };
      }
    });
    setFields(next);
    setServicios(rows);
    setEditingId(o._id);
    setEditingNo(o.orden_no || null);
    setSaved(false);
    setSaveError(null);
    setDetail(null);
    setTab('nueva');
  };

  // Start a brand-new order (new consecutive number) pre-filled with an existing
  // order's client + vehicle data. KM actual is left blank on purpose.
  const prefillNewOrder = (o: Orden) => {
    const next = freshFields();
    next.nombre = o.nombre || '';
    next.cedula_nit = o.cedula_nit || '';
    next.fecha_cumpleanos = o.fecha_cumpleanos || '';
    next.direccion = o.direccion || '';
    next.celular = o.celular || '';
    next.correo = o.correo || '';
    next.cliente = o.cliente || '';
    next.placa = (o.placa || '').toUpperCase();
    next.marca = o.marca || '';
    next.tipo = o.tipo || '';
    next.frec_cambio_km = o.frec_cambio_km || '';
    next.proximo_cambio_meses = o.proximo_cambio_meses || '';
    setFields(next);
    setServicios(emptyServicios());
    setEditingId(null);
    setEditingNo(null);
    setSaved(false);
    setSaveError(null);
    setDetail(null);
    setGestionTarget(null);
    setTab('nueva');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const missing = REQUIRED.filter((r) => !fields[r.key].trim()).map((r) => r.label);
    if (missing.length) {
      setSaveError(`Completa los campos requeridos: ${missing.join(', ')}.`);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const editing = editingId;
      const res = await fetch('/api/lubricentros', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing, ...fields, servicios } : { ...fields, servicios }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar');
      }
      setSavedNo(data.orden_no || editingNo || null);
      setSavedEdit(!!editing);
      setSaved(true);
      resetForm();
      // Refresh search results and the next-number preview in the background.
      runSearch(query);
      if (!editing) fetchNextNo();
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

  // ---- Alerts state ----
  const [alertas, setAlertas] = useState<Orden[]>([]);
  const [alertasPage, setAlertasPage] = useState(1);
  const [alertasTotal, setAlertasTotal] = useState(0);
  const [loadingAlertas, setLoadingAlertas] = useState(false);
  const totalPages = Math.max(1, Math.ceil(alertasTotal / ALERTAS_PAGE_SIZE));

  const fetchAlertas = useCallback(
    async (page: number) => {
      if (!session) return;
      setLoadingAlertas(true);
      try {
        const res = await fetch(`/api/lubricentros?alertas=true&page=${page}&pageSize=${ALERTAS_PAGE_SIZE}`);
        if (res.ok) {
          const data = await res.json();
          setAlertas(data.results || []);
          setAlertasTotal(data.total || 0);
        }
      } catch {
        // ignore
      } finally {
        setLoadingAlertas(false);
      }
    },
    [session],
  );

  useEffect(() => {
    if (tab === 'alertas') fetchAlertas(alertasPage);
  }, [tab, alertasPage, fetchAlertas]);

  // ---- Scheduled revisions state ----
  const [revisiones, setRevisiones] = useState<Orden[]>([]);
  const [revisionesPage, setRevisionesPage] = useState(1);
  const [revisionesTotal, setRevisionesTotal] = useState(0);
  const [loadingRevisiones, setLoadingRevisiones] = useState(false);
  const revisionesTotalPages = Math.max(1, Math.ceil(revisionesTotal / ALERTAS_PAGE_SIZE));

  const fetchRevisiones = useCallback(
    async (page: number) => {
      if (!session) return;
      setLoadingRevisiones(true);
      try {
        const res = await fetch(`/api/lubricentros?revisiones=true&page=${page}&pageSize=${ALERTAS_PAGE_SIZE}`);
        if (res.ok) {
          const data = await res.json();
          setRevisiones(data.results || []);
          setRevisionesTotal(data.total || 0);
        }
      } catch {
        // ignore
      } finally {
        setLoadingRevisiones(false);
      }
    },
    [session],
  );

  useEffect(() => {
    if (tab === 'revisiones') fetchRevisiones(revisionesPage);
  }, [tab, revisionesPage, fetchRevisiones]);

  // ---- Manage ("gestionar") an alert ----
  const [gestionTarget, setGestionTarget] = useState<Orden | null>(null);
  const [gestionFecha, setGestionFecha] = useState('');
  const [gestionSaving, setGestionSaving] = useState(false);

  const gestionar = async (tipo: string, fecha?: string) => {
    if (!gestionTarget) return;
    setGestionSaving(true);
    try {
      const res = await fetch('/api/lubricentros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gestionTarget._id, gestion_tipo: tipo, gestion_fecha: fecha }),
      });
      if (res.ok) {
        setGestionTarget(null);
        setGestionFecha('');
        fetchAlertas(alertasPage);
        if (tab === 'revisiones') fetchRevisiones(revisionesPage);
      }
    } catch {
      // ignore
    } finally {
      setGestionSaving(false);
    }
  };

  // Remove a scheduled revision from the list (mark handled).
  const quitarRevision = async (id: string) => {
    try {
      const res = await fetch('/api/lubricentros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, gestion_tipo: 'atendida' }),
      });
      if (res.ok) fetchRevisiones(revisionesPage);
    } catch {
      // ignore
    }
  };

  const formatDateOnly = (date: string | Date) =>
    new Intl.DateTimeFormat('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }).format(
      new Date(date),
    );

  const formatMoney = (n: number) => `$ ${new Intl.NumberFormat('es-CO').format(n)}`;

  // Totals derived live from the service rows (mirrors the server).
  const totalSubtotal = servicios.reduce((sum, r) => sum + (parseInt(r.subtotal, 10) || 0), 0);
  const totalIva = Math.round(totalSubtotal * 0.19);
  const totalTotal = totalSubtotal + totalIva;

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
              <p className="text-sm text-gray-500">Órdenes de trabajo MERQUELLANTAS S.A.S</p>
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
              {editingId ? 'Editar orden' : 'Nueva orden'}
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
            <button
              onClick={() => setTab('alertas')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'alertas'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Bell size={16} />
              Alertas
            </button>
            <button
              onClick={() => setTab('revisiones')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'revisiones'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <CalendarClock size={16} />
              Revisiones programadas
            </button>
          </div>

          {/* ---------- NUEVA ORDEN ---------- */}
          {tab === 'nueva' && (
            <form onSubmit={handleSave} className="space-y-6">
              {editingId && (
                <div className="p-4 bg-blue-50 text-blue-800 rounded-xl flex items-center gap-3 border border-blue-100">
                  <ClipboardList size={20} />
                  <p className="text-sm font-medium">
                    Editando la orden {editingNo || ''}.
                  </p>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="ml-auto text-sm text-blue-700 hover:text-blue-900 underline"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {saved && (
                <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl flex items-center gap-3 border border-emerald-100">
                  <CheckCircle size={20} />
                  <p className="text-sm font-medium">
                    {savedNo
                      ? `Orden ${savedNo} ${savedEdit ? 'actualizada' : 'guardada'} correctamente.`
                      : `Orden ${savedEdit ? 'actualizada' : 'guardada'} correctamente.`}
                  </p>
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
                  <div>
                    <span className="block text-xs font-medium text-gray-500 mb-1">No. orden de trabajo</span>
                    {editingId ? (
                      <div className="rounded-lg border border-gray-300 bg-gray-50 py-2 px-3 text-sm font-medium text-gray-900">
                        {editingNo || '—'}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-2 px-3 text-sm">
                        <span className="font-semibold text-gray-900">{nextNo || '—'}</span>
                        <span className="text-gray-400"> · se asigna al guardar</span>
                      </div>
                    )}
                  </div>
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
                  <Field label="Nombre conductor" value={fields.nombre} onChange={(v) => setField('nombre', v)} required />
                  <Autocomplete
                    label="Cédula y/o NIT"
                    value={fields.cedula_nit}
                    onChange={(v) => setField('cedula_nit', v)}
                    onSelect={(opt) => {
                      const full = clienteSugs.find((s) => s.cedula_nit === opt.value);
                      if (full) fillCliente(full);
                      else setField('cedula_nit', opt.value);
                    }}
                    required
                    options={clienteSugs.map((s) => ({ value: s.cedula_nit, secondary: s.nombre }))}
                  />
                  <Field label="Fecha de cumpleaños" value={fields.fecha_cumpleanos} onChange={(v) => setField('fecha_cumpleanos', v)} />
                  <Field label="Dirección" value={fields.direccion} onChange={(v) => setField('direccion', v)} />
                  <Field label="Celular" value={fields.celular} onChange={(v) => setField('celular', v)} required />
                  <Field label="Correo electrónico" value={fields.correo} onChange={(v) => setField('correo', v)} />
                  <Field label="Nombre empresa" value={fields.cliente} onChange={(v) => setField('cliente', v)} />
                </div>
              </section>

              {/* Vehículo */}
              <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                  <Car size={18} className="text-amber-500" /> Vehículo
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Autocomplete
                    label="Placa"
                    value={fields.placa}
                    onChange={(v) => setField('placa', v.toUpperCase())}
                    onSelect={(opt) => {
                      const full = vehiculoSugs.find((s) => s.placa.toUpperCase() === opt.value.toUpperCase());
                      if (full) fillVehiculo(full);
                      else setField('placa', opt.value.toUpperCase());
                    }}
                    required
                    options={vehiculoSugs.map((s) => ({
                      value: s.placa,
                      secondary: [s.marca, s.tipo].filter(Boolean).join(' · '),
                    }))}
                  />
                  <Field label="Marca" value={fields.marca} onChange={(v) => setField('marca', v)} required />
                  <Field label="Tipo" value={fields.tipo} onChange={(v) => setField('tipo', v)} required />
                  <Field label="KM actual vehículo" value={fields.km_actual} onChange={(v) => setField('km_actual', v)} required />
                  <Field label="Frec. cambio (km)" value={fields.frec_cambio_km} onChange={(v) => setField('frec_cambio_km', v)} required />
                  <div>
                    <Field label="Próximo cambio (meses)" value={fields.proximo_cambio_meses} onChange={(v) => setField('proximo_cambio_meses', v)} required />
                    {(() => {
                      const next = computeNextChange(fields.fecha, fields.proximo_cambio_meses);
                      return next ? (
                        <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Próximo cambio: {formatDateOnly(next)}
                        </p>
                      ) : null;
                    })()}
                  </div>
                </div>
              </section>

              {/* Servicios */}
              <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-1">
                  <Wrench size={18} className="text-amber-500" /> Servicios
                </h2>
                <p className="text-xs text-gray-400 mb-4">
                  Opcional. Alineación usa referencia sencilla/doble; en los demás escribe el producto/referencia
                  aplicado. Unidad y valor unitario son enteros; el subtotal (unidad × valor) y los totales se
                  calculan solos.
                </p>
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
                            {row.servicio === 'Alineación' ? (
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
                            ) : (
                              <input
                                list="producto-list"
                                value={row.referencia}
                                onChange={(e) => {
                                  setServicio(i, 'referencia', e.target.value);
                                  setProductoQuery(e.target.value);
                                }}
                                placeholder="Producto / referencia"
                                autoComplete="off"
                                className="w-44 rounded border border-gray-300 py-1 px-2 text-sm focus:ring-amber-500 focus:border-amber-500"
                              />
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.unidad}
                              onChange={(e) => setServicio(i, 'unidad', e.target.value)}
                              className="w-20 rounded border border-gray-300 py-1 px-2 text-sm focus:ring-amber-500 focus:border-amber-500"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.valor_unitario}
                              onChange={(e) => setServicio(i, 'valor_unitario', e.target.value)}
                              className="w-28 rounded border border-gray-300 py-1 px-2 text-sm focus:ring-amber-500 focus:border-amber-500"
                            />
                          </td>
                          <td className="py-2 pl-2">
                            <div className="w-28 py-1 px-2 text-sm text-gray-900">
                              {row.subtotal ? formatMoney(parseInt(row.subtotal, 10) || 0) : '—'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Shared product suggestions for the open-text service rows. */}
                <datalist id="producto-list">
                  {productoSugs.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
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
                  <div>
                    <span className="block text-xs font-medium text-gray-500 mb-1">Subtotal</span>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-900">
                      {formatMoney(totalSubtotal)}
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-500 mb-1">IVA (19%)</span>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-900">
                      {formatMoney(totalIva)}
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-500 mb-1">Total</span>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 py-2 px-3 text-sm font-semibold text-gray-900">
                      {formatMoney(totalTotal)}
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  {editingId ? 'Cancelar edición' : 'Limpiar'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium shadow-md hover:from-amber-600 hover:to-amber-700 transition-colors disabled:opacity-50"
                >
                  <Save size={18} />
                  {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar orden'}
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

          {/* ---------- ALERTAS ---------- */}
          {tab === 'alertas' && (
            <div className="space-y-5">
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" /> Vencido</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500" /> Próximo mes</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Al día</span>
              </div>

              <div className="text-sm text-gray-500">
                {loadingAlertas
                  ? 'Cargando...'
                  : `${alertasTotal} ${alertasTotal === 1 ? 'orden' : 'órdenes'} con próximo cambio`}
              </div>

              {alertas.length === 0 && !loadingAlertas ? (
                <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay órdenes con fecha de próximo cambio.</p>
                  <p className="text-xs mt-1">
                    Registra la <strong>Fecha</strong> y los <strong>meses de próximo cambio</strong> en una orden para verla aquí.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alertas.map((o) => {
                    const status = changeStatus(o.proximo_cambio_fecha);
                    const s = status ? STATUS_STYLES[status] : null;
                    const llamado = o.gestion_tipo === 'llamado_rechazado';
                    return (
                      <div
                        key={o._id}
                        className={`bg-white p-4 rounded-2xl border border-gray-100 border-l-4 ${
                          s?.border || 'border-l-gray-300'
                        } shadow-sm flex items-center justify-between gap-4`}
                      >
                        <button onClick={() => setDetail(o)} className="min-w-0 flex-1 text-left hover:opacity-80 transition">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-gray-900 truncate">
                              {o.orden_no ? `Orden ${o.orden_no}` : o.nombre || 'Orden sin número'}
                            </span>
                            {o.placa && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                {o.placa}
                              </span>
                            )}
                            {llamado && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                                <Phone className="h-3 w-3" /> Contactado · rechazó
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {[o.nombre, o.marca, o.tipo].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </button>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            {s && (
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.badge} mb-1`}>
                                {s.label}
                              </span>
                            )}
                            <p className="text-xs text-gray-500 flex items-center gap-1 justify-end">
                              <Calendar className="h-3 w-3" />
                              {o.proximo_cambio_fecha ? formatDateOnly(o.proximo_cambio_fecha) : '—'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setGestionTarget(o);
                              setGestionFecha('');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
                          >
                            <Settings2 size={14} /> Gestionar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {alertasTotal > ALERTAS_PAGE_SIZE && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setAlertasPage((p) => Math.max(1, p - 1))}
                    disabled={alertasPage <= 1 || loadingAlertas}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <span className="text-sm text-gray-500">
                    Página {alertasPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setAlertasPage((p) => Math.min(totalPages, p + 1))}
                    disabled={alertasPage >= totalPages || loadingAlertas}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Siguiente <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---------- REVISIONES PROGRAMADAS ---------- */}
          {tab === 'revisiones' && (
            <div className="space-y-5">
              <div className="text-sm text-gray-500">
                {loadingRevisiones
                  ? 'Cargando...'
                  : `${revisionesTotal} ${revisionesTotal === 1 ? 'revisión programada' : 'revisiones programadas'}`}
              </div>

              {revisiones.length === 0 && !loadingRevisiones ? (
                <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
                  <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay revisiones programadas.</p>
                  <p className="text-xs mt-1">Prográmalas desde una alerta con el botón “Gestionar”.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {revisiones.map((o) => (
                    <div
                      key={o._id}
                      className="bg-white p-4 rounded-2xl border border-gray-100 border-l-4 border-l-blue-500 shadow-sm flex items-center justify-between gap-4"
                    >
                      <button onClick={() => setDetail(o)} className="min-w-0 flex-1 text-left hover:opacity-80 transition">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-gray-900 truncate">
                            {o.nombre || (o.orden_no ? `Orden ${o.orden_no}` : 'Sin nombre')}
                          </span>
                          {o.placa && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {o.placa}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {[o.marca, o.tipo, o.celular].filter(Boolean).join(' · ') || '—'}
                        </p>
                        <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                          <CalendarClock className="h-3 w-3" />
                          Revisión: {o.gestion_fecha ? formatDateOnly(o.gestion_fecha) : '—'}
                        </p>
                      </button>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => prefillNewOrder(o)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
                        >
                          <FilePlus size={14} /> Crear nueva orden
                        </button>
                        <button
                          onClick={() => quitarRevision(o._id)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
                        >
                          <X size={14} /> Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {revisionesTotal > ALERTAS_PAGE_SIZE && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setRevisionesPage((p) => Math.max(1, p - 1))}
                    disabled={revisionesPage <= 1 || loadingRevisiones}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <span className="text-sm text-gray-500">
                    Página {revisionesPage} de {revisionesTotalPages}
                  </span>
                  <button
                    onClick={() => setRevisionesPage((p) => Math.min(revisionesTotalPages, p + 1))}
                    disabled={revisionesPage >= revisionesTotalPages || loadingRevisiones}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Siguiente <ChevronRight size={16} />
                  </button>
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
                ['Nombre conductor', detail.nombre],
                ['Cédula / NIT', detail.cedula_nit],
                ['Cumpleaños', detail.fecha_cumpleanos],
                ['Dirección', detail.direccion],
                ['Celular', detail.celular],
                ['Correo', detail.correo],
                ['Nombre empresa', detail.cliente],
                ['Placa', detail.placa],
                ['Marca', detail.marca],
                ['Tipo', detail.tipo],
                ['KM actual', detail.km_actual],
                ['Frec. cambio (km)', detail.frec_cambio_km],
                ['Próximo cambio (meses)', detail.proximo_cambio_meses],
                ['Próximo cambio (fecha)', detail.proximo_cambio_fecha ? formatDateOnly(detail.proximo_cambio_fecha) : ''],
              ]}
            />

            {detail.servicios && detail.servicios.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Servicios</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-gray-900">
                    <thead>
                      <tr className="text-left text-gray-900 border-b border-gray-200">
                        <th className="py-1.5 pr-3 font-semibold">Servicio</th>
                        <th className="py-1.5 px-2 font-semibold">Ref.</th>
                        <th className="py-1.5 px-2 font-semibold">Unidad</th>
                        <th className="py-1.5 px-2 font-semibold">V. unitario</th>
                        <th className="py-1.5 pl-2 font-semibold">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.servicios.map((s, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="py-1.5 pr-3">{s.servicio}</td>
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
              <span className="text-gray-500">Subtotal: <span className="text-gray-800">{detail.subtotal ? formatMoney(parseInt(detail.subtotal, 10) || 0) : '—'}</span></span>
              <span className="text-gray-500">IVA: <span className="text-gray-800">{detail.iva ? formatMoney(parseInt(detail.iva, 10) || 0) : '—'}</span></span>
              <span className="text-gray-500">Total: <span className="font-semibold text-gray-900">{detail.total ? formatMoney(parseInt(detail.total, 10) || 0) : '—'}</span></span>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                onClick={() => prefillNewOrder(detail)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 transition-colors"
              >
                <FilePlus size={16} />
                Crear nueva orden al cliente
              </button>
              <button
                onClick={() => startEdit(detail)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium shadow-md hover:from-amber-600 hover:to-amber-700 transition-colors"
              >
                <Pencil size={16} />
                Editar orden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gestionar (manage alert) modal */}
      {gestionTarget && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4 backdrop-blur-sm"
          onClick={() => setGestionTarget(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl relative border border-gray-100 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setGestionTarget(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
              aria-label="Cerrar"
            >
              <X size={22} />
            </button>

            <h2 className="text-lg font-bold text-gray-900 mb-1">Gestionar alerta</h2>
            <p className="text-sm text-gray-500 mb-5">
              {gestionTarget.orden_no ? `Orden ${gestionTarget.orden_no} · ` : ''}
              {[gestionTarget.nombre, gestionTarget.placa].filter(Boolean).join(' · ')}
            </p>

            <div className="space-y-3">
              <button
                disabled={gestionSaving}
                onClick={() => gestionar('llamado_rechazado')}
                className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-orange-50 hover:border-orange-200 transition-colors disabled:opacity-50"
              >
                <Phone className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-gray-900">Llamé — el cliente rechazó</div>
                  <div className="text-xs text-gray-500">Seguir alertando en el futuro.</div>
                </div>
              </button>

              <button
                disabled={gestionSaving}
                onClick={() => gestionar('no_llamar')}
                className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50"
              >
                <PhoneOff className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-gray-900">No volver a llamar</div>
                  <div className="text-xs text-gray-500">Quitar de las alertas.</div>
                </div>
              </button>

              <div className="p-3 rounded-xl border border-gray-200">
                <div className="flex items-start gap-3 mb-2">
                  <CalendarPlus className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Programar nueva revisión</div>
                    <div className="text-xs text-gray-500">Se mostrará en Revisiones programadas.</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={gestionFecha}
                    onChange={(e) => setGestionFecha(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 py-2 px-3 text-sm focus:ring-amber-500 focus:border-amber-500"
                  />
                  <button
                    disabled={!gestionFecha || gestionSaving}
                    onClick={() => gestionar('revision_programada', gestionFecha)}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Programar
                  </button>
                </div>
              </div>

              <button
                onClick={() => prefillNewOrder(gestionTarget)}
                className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <FilePlus className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-gray-900">Crear nueva orden ahora</div>
                  <div className="text-xs text-gray-600">Sin programar — formulario con datos del cliente y vehículo.</div>
                </div>
              </button>
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
