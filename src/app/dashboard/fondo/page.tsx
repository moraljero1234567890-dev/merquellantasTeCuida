"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Search,
  Users,
  DollarSign,
  CreditCard,
  Check,
  Clock,
  ShieldAlert,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  X,
  UserPlus,
  Send,
  AlertCircle,
  History,
  Wallet,
  Activity,
  Landmark,
  Upload,
  FileText,
  Trash2,
} from "lucide-react";
import DashboardNavbar from "../navbar";
import FondoUserView from "./user-view";
import SolicitudCreditoForm, { type SolicitudPayload } from "./SolicitudCreditoForm";
import {
  getCurrentCyclePeriodo,
  formatPeriodoLabel as formatPeriodoLabelLib,
} from "../../../lib/fondo-period";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FondoMember {
  id: string;
  user_id: string;
  nombre: string;
  cedula: string;
  frecuencia: "quincenal" | "mensual";
  monto_aporte: number;
}

interface CreditPayment {
  cartera_id: string;
  credito_id: string;
  monto: number;
  saldo_total: number;
  cuota_esperada: number;
}

interface CycleRow {
  user_id: string;
  nombre: string;
  cedula: string;
  frecuencia: "quincenal" | "mensual";
  aporte: number;
  permanente: number;
  social: number;
  actividad: number;
  creditos: CreditPayment[];
  credito_pago_total?: number;
}

interface BudgetAdjustment {
  user_id: string;
  nombre: string;
  total_anterior: number;
  total_nuevo: number;
}

interface Ciclo {
  _id?: string;
  id?: string;
  periodo: string;
  estado: "enviado_admin" | "ajustes_admin" | "aprobado" | "rechazado";
  movimientos: CycleRow[];
  movimientos_admin?: BudgetAdjustment[] | null;
  ajustes_admin_at?: string;
  revision_count?: number;
  created_at: string;
}

interface Saldos {
  permanente: number;
  social: number;
  actividad: number;
  intereses: number;
}

interface AporteHistorial {
  _id?: string;
  periodo: string;
  monto_total: number;
  monto_permanente: number;
  monto_social: number;
  fecha_ejecucion: string;
}

interface ActividadHistorial {
  _id?: string;
  tipo: "aporte" | "retiro";
  monto: number;
  descripcion?: string;
  fecha: string;
}

interface Credito {
  _id?: string;
  credito_id?: string;
  valor_prestamo: number;
  saldo_total: number;
  tasa_interes?: number;
  numero_cuotas?: number;
  cuotas_pagadas: number;
  cuotas_restantes: number;
  frecuencia_pago?: string;
  fecha_desembolso?: string;
  fecha_cuota_1?: string;
  estado: string;
  pagos?: { numero_cuota: number; fecha_pago: string; monto_total: number; flagged?: boolean; monto_esperado?: number; diferencia?: number }[];
}

interface SearchUser {
  id: string;
  user_id?: string;
  nombre: string;
  cedula: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(n);

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const estadoBadge = (estado: string) => {
  const map: Record<string, string> = {
    enviado_admin: "bg-yellow-100 text-yellow-800 border-yellow-300",
    aprobado: "bg-green-100 text-green-800 border-green-300",
    rechazado: "bg-red-100 text-red-800 border-red-300",
  };
  const labels: Record<string, string> = {
    enviado_admin: "Enviado",
    aprobado: "Aprobado",
    rechazado: "Rechazado",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        map[estado] ?? "bg-gray-100 text-gray-800 border-gray-300"
      }`}
    >
      {labels[estado] ?? estado}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

type TabId = "ciclo" | "solicitudes" | "historial" | "buscar" | "nuevo" | "csv";

interface TabDef { id: TabId; label: string; icon: React.ReactNode }

// Grouped tabs — the nav renders a thin divider between groups so the
// three concerns (cycle work / member work / data ingest) read
// semantically instead of as one flat bar of buttons.
const TAB_GROUPS: TabDef[][] = [
  [
    { id: "ciclo", label: "Ciclo Actual", icon: <DollarSign size={16} /> },
    { id: "solicitudes", label: "Solicitudes", icon: <CreditCard size={16} /> },
    { id: "historial", label: "Historial", icon: <History size={16} /> },
  ],
  [
    { id: "buscar", label: "Buscar Afiliado", icon: <Search size={16} /> },
    { id: "nuevo", label: "Nuevo Afiliado", icon: <UserPlus size={16} /> },
  ],
  [
    { id: "csv", label: "Cargar CSV", icon: <Wallet size={16} /> },
  ],
];

/* ================================================================== */
/*  MAIN PAGE                                                          */
/* ================================================================== */

interface AdminStats {
  total_afiliados: number;
  total_ahorrado: number;
  creditos_activos: number;
  creditos_pendientes: number;
  retiros_pendientes: number;
  solicitudes_pendientes: number;
}

export default function FondoPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>("ciclo");
  const [stats, setStats] = useState<AdminStats | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/fondo/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (session?.user?.rol === "fondo") refreshStats();
  }, [session, refreshStats]);

  /* ---- auth gate ---- */

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#f4a900] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // Non-fondo users see their own fondo data (read-only user view)
  if (session.user.rol !== "fondo") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900" translate="no">
        <DashboardNavbar activePage="fondo" />
        <div className="pt-20 text-gray-900">
          <FondoUserView />
        </div>
      </div>
    );
  }

  const pendingCount = stats?.solicitudes_pendientes ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" translate="no">
      <DashboardNavbar activePage="fondo" />

      <div className="pt-20 px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* HERO — title on the left, live KPIs on the right. Clicking a
              KPI jumps to the tab that owns that metric. */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 via-gray-900 to-gray-900 text-white shadow-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 8% 15%, #f4a900 0, transparent 45%), radial-gradient(circle at 95% 95%, #f4a900 0, transparent 40%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
                backgroundSize: "36px 36px",
              }}
            />
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#f4a900] to-transparent" />

            <div className="relative p-5 sm:p-7 grid gap-6 lg:grid-cols-[1fr_2fr] lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#f4a900]/15 text-[#f4a900] text-[10px] font-bold uppercase tracking-wider border border-[#f4a900]/30">
                  <Landmark className="h-3 w-3" /> Fonalmerque · Admin
                </span>
                <h1 className="mt-2.5 text-2xl sm:text-3xl font-extrabold leading-tight">
                  Panel del <span className="text-[#f4a900]">Fonalmerque</span>
                </h1>
                <p className="mt-1.5 text-sm text-white/60 max-w-md">
                  Ciclos de nómina, solicitudes, afiliados y cartera — todo en un solo lugar.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <KpiCard
                  icon={<Users className="h-4 w-4" />}
                  label="Afiliados activos"
                  value={stats ? String(stats.total_afiliados) : "—"}
                  tint="emerald"
                />
                <KpiCard
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Total ahorrado"
                  value={stats ? formatCompactCOP(stats.total_ahorrado) : "—"}
                  tint="blue"
                />
                <KpiCard
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Créditos activos"
                  value={stats ? String(stats.creditos_activos) : "—"}
                  tint="amber"
                />
                <KpiCard
                  icon={<Clock className="h-4 w-4" />}
                  label="Pendientes"
                  value={stats ? String(stats.solicitudes_pendientes) : "—"}
                  tint={pendingCount > 0 ? "red" : "slate"}
                  onClick={() => setActiveTab("solicitudes")}
                  pulse={pendingCount > 0}
                />
              </div>
            </div>
          </section>

          {/* Tab nav — pills grouped into three sections, horizontally
              scrollable on narrow viewports, with a live count badge on
              Solicitudes. Hugging a thin container so the active pill
              reads as a real segmented control. */}
          <div className="bg-white rounded-2xl border border-gray-200 p-1.5 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {TAB_GROUPS.map((group, gi) => (
                <React.Fragment key={gi}>
                  {gi > 0 && <div className="h-6 w-px bg-gray-200 mx-1 flex-shrink-0" />}
                  {group.map((t) => (
                    <TabPill
                      key={t.id}
                      icon={t.icon}
                      label={t.label}
                      active={activeTab === t.id}
                      badge={t.id === "solicitudes" && pendingCount > 0 ? pendingCount : undefined}
                      onClick={() => setActiveTab(t.id)}
                    />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div>
            {activeTab === "ciclo" && <CicloActualTab />}
            {activeTab === "solicitudes" && <SolicitudesTab />}
            {activeTab === "historial" && <HistorialTab />}
            {activeTab === "buscar" && <BuscarAfiliadoTab />}
            {activeTab === "nuevo" && <NuevoAfiliadoTab />}
            {activeTab === "csv" && <CargarCsvTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin shell bits                                                   */
/* ------------------------------------------------------------------ */

// "$35M" / "$850K" / "$1.2B" — compact currency for tight KPI cards.
// Falls back to full COP format for values below a million.
function formatCompactCOP(n: number | null | undefined): string {
  const v = Math.abs(Number(n) || 0);
  if (v < 1_000_000) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(v);
  }
  if (v < 1_000_000_000) {
    return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  }
  return `$${(v / 1_000_000_000).toFixed(1)}B`;
}

type KpiTint = "emerald" | "blue" | "amber" | "red" | "slate";

const KPI_TINT: Record<KpiTint, { icon: string; text: string }> = {
  emerald: { icon: "bg-emerald-500/15 text-emerald-300", text: "text-white" },
  blue:    { icon: "bg-sky-500/15 text-sky-300",          text: "text-white" },
  amber:   { icon: "bg-amber-500/15 text-amber-300",      text: "text-white" },
  red:     { icon: "bg-red-500/20 text-red-300",          text: "text-white" },
  slate:   { icon: "bg-white/10 text-white/70",           text: "text-white/80" },
};

function KpiCard({
  icon,
  label,
  value,
  tint,
  onClick,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: KpiTint;
  onClick?: () => void;
  pulse?: boolean;
}) {
  const palette = KPI_TINT[tint];
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`relative group text-left p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm transition-all ${
        onClick ? "hover:bg-white/10 hover:border-white/20 active:scale-[0.98] cursor-pointer" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${palette.icon}`}>
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 truncate">
          {label}
        </span>
      </div>
      <p className={`text-xl sm:text-2xl font-extrabold leading-none ${palette.text}`}>
        {value}
      </p>
      {pulse && (
        <span
          aria-hidden
          className="absolute top-2 right-2 inline-flex h-2 w-2 rounded-full bg-red-400"
        >
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
        </span>
      )}
    </Wrapper>
  );
}

function CicloKpi({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-3 sm:p-4 ${
        highlight ? "bg-[#f4a900]/[0.06]" : "bg-white"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`w-6 h-6 rounded-md flex items-center justify-center ${
            highlight ? "bg-[#f4a900]/20 text-[#9a6b00]" : "bg-gray-100 text-gray-600"
          }`}
        >
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 truncate">
          {label}
        </span>
      </div>
      <p
        className={`text-base sm:text-lg font-extrabold leading-tight ${
          highlight ? "text-[#9a6b00]" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TabPill({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition ${
        active
          ? "bg-[#f4a900] text-black shadow-md shadow-[#f4a900]/20"
          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={`ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
            active ? "bg-black/15 text-black" : "bg-red-100 text-red-700"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ================================================================== */
/*  CICLO ACTUAL TAB                                                   */
/* ================================================================== */

interface PdfUploadResult {
  success: boolean;
  total_en_pdf: number;
  actualizados: number;
  no_encontrados: number;
  cedulas_no_encontradas: string[];
  detalle: { cedula: string; name: string; credits: number; savings: boolean; activities: number }[];
}

interface CicloActualData {
  credits: { credit_id: string; interest: number; capital: number; total: number }[];
  savings: { ahorro_permanente: number; ahorro_social: number; total: number } | null;
  activities: { description: string; amount: number }[];
  order?: number;
  uploaded_at?: string;
}

function CicloActualTab() {
  const [rows, setRows] = useState<CycleRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [periodo, setPeriodo] = useState<string>("");
  const [periodoLabel, setPeriodoLabel] = useState<string>("");
  const [existingCiclo, setExistingCiclo] = useState<Ciclo | null>(null);
  const [budgetMap, setBudgetMap] = useState<Record<string, number>>({});

  // PDF upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<PdfUploadResult | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [cicloActualMap, setCicloActualMap] = useState<Record<string, CicloActualData>>({});
  const [expandedPdf, setExpandedPdf] = useState<string | null>(null);
  const [pdfUploaded, setPdfUploaded] = useState(false);
  const [manuallyAddedUsers, setManuallyAddedUsers] = useState<Set<string>>(new Set());
  const [showAddUser, setShowAddUser] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const currentPeriodo = getCurrentCyclePeriodo();
        setPeriodo(currentPeriodo);
        setPeriodoLabel(formatPeriodoLabelLib(currentPeriodo));

        // Check for existing cycle for this periodo first
        const ciclosRes = await fetch(`/api/fondo/ciclos?periodo=${currentPeriodo}`);
        const ciclos: Ciclo[] = ciclosRes.ok ? await ciclosRes.json() : [];
        const existing = ciclos.find(c => c.estado === "enviado_admin" || c.estado === "ajustes_admin" || c.estado === "aprobado");

        if (existing) {
          setExistingCiclo(existing);
          // If we're in ajustes_admin state, we still need to load and show the rows
          if (existing.estado !== "ajustes_admin") {
            setLoading(false);
            return;
          }
        }

        // Fetch members and active credits
        const [memRes, cartRes] = await Promise.all([
          fetch("/api/fondo/members"),
          fetch("/api/fondo/cartera?estado=activo"),
        ]);
        if (!memRes.ok) throw new Error("Error cargando miembros");
        const data: FondoMember[] = await memRes.json();

        // Group active credits by user
        const creditsByUser = new Map<string, CreditPayment[]>();
        if (cartRes.ok) {
          const credits: Array<{
            _id: string;
            user_id: string;
            credito_id?: string;
            cuotas_restantes: number;
            numero_cuotas?: number;
            saldo_total: number;
            fecha_desembolso?: string | null;
            source?: string;
          }> = await cartRes.json();
          for (const c of credits) {
            if (c.cuotas_restantes <= 0) continue;
            // CSV-imported rows are just a snapshot of the outstanding
            // CARTERA balance with placeholder cuotas (numero_cuotas=1,
            // cuotas_restantes=1, no fecha_desembolso). Doing saldo/1 for
            // those gives a "default cuota" equal to the ENTIRE remaining
            // balance — that's how a user ended up with a 139M monto in
            // the ciclo. Skip that auto-default until the fondo has filled
            // in real cuotas: leave monto at 0 so the row either gets
            // overwritten by the PDF value on upload or is filled in
            // manually.
            const isPlaceholder =
              c.source === "csv_import" && (!c.fecha_desembolso || (c.numero_cuotas ?? 0) <= 1);
            const cuota = isPlaceholder
              ? 0
              : Math.round(c.saldo_total / c.cuotas_restantes);
            const arr = creditsByUser.get(c.user_id) || [];
            arr.push({
              cartera_id: c._id,
              credito_id: c.credito_id || c._id.slice(-6),
              monto: cuota,
              saldo_total: c.saldo_total,
              cuota_esperada: cuota,
            });
            creditsByUser.set(c.user_id, arr);
          }
        }

        // If existing is in ajustes_admin, build budget map from admin's adjustments
        if (existing && existing.estado === "ajustes_admin" && existing.movimientos_admin) {
          const bm: Record<string, number> = {};
          for (const adj of existing.movimientos_admin) {
            bm[adj.user_id] = adj.total_nuevo;
          }
          setBudgetMap(bm);
        }

        setRows(
          data.map((m) => {
            const aporte = m.monto_aporte;
            const creditos = creditsByUser.get(m.user_id) || [];
            return {
              user_id: m.user_id,
              nombre: m.nombre,
              cedula: m.cedula,
              frecuencia: m.frecuencia,
              aporte,
              permanente: +(aporte * 0.9).toFixed(0),
              social: +(aporte * 0.1).toFixed(0),
              actividad: 0,
              creditos,
            };
          })
        );
      } catch {
        setError("No se pudieron cargar los miembros de Fonalmerque.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch cicloActual data for all members after PDF upload
  const fetchCicloActualData = useCallback(async () => {
    try {
      const res = await fetch("/api/fondo/members?include_ciclo=1");
      if (!res.ok) return;
      const members: { user_id: string; cedula: string; cicloActual?: CicloActualData }[] = await res.json();
      const map: Record<string, CicloActualData> = {};
      for (const m of members) {
        if (m.cicloActual) map[m.user_id] = m.cicloActual;
      }
      setCicloActualMap(map);
      // If members already have cicloActual data, a PDF was uploaded previously —
      // restore the "PDF uploaded" view so non-PDF users stay hidden across reloads.
      if (Object.keys(map).length > 0) setPdfUploaded(true);
    } catch { /* ignore */ }
  }, []);

  // Load cicloActual data on mount
  useEffect(() => { fetchCicloActualData(); }, [fetchCicloActualData]);

  // Auto-fill rows from cicloActual when PDF data arrives
  const [appliedPdfUsers, setAppliedPdfUsers] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (Object.keys(cicloActualMap).length === 0 || rows.length === 0) return;
    let changed = false;
    const newApplied = new Set(appliedPdfUsers);
    const updated = rows.map((row) => {
      if (newApplied.has(row.user_id)) return row;
      const ca = cicloActualMap[row.user_id];
      if (!ca) return row;
      newApplied.add(row.user_id);
      changed = true;
      const aporte = ca.savings ? ca.savings.total : row.aporte;
      const actividad = ca.activities.reduce((sum, a) => sum + a.amount, 0) || row.actividad;
      // PDF credits always show up in the row — if a cartera entry
      // matches by credit_id we link them (so approving the ciclo
      // updates the right cartera balance), otherwise the PDF credit
      // appears standalone. Cartera entries without a PDF match keep
      // monto=0 — no payment proposed this cycle — which protects us
      // from csv_import placeholders leaking saldo_total as the default.
      const pdfMatchedIds = new Set<string>();
      const creditos: CreditPayment[] = [];
      for (const cr of row.creditos) {
        const pdfCredit = ca.credits.find((pc) => pc.credit_id === cr.credito_id);
        if (pdfCredit) {
          pdfMatchedIds.add(pdfCredit.credit_id);
          creditos.push({ ...cr, monto: pdfCredit.total });
        } else {
          creditos.push({ ...cr, monto: 0 });
        }
      }
      for (const pc of ca.credits) {
        if (pdfMatchedIds.has(pc.credit_id)) continue;
        creditos.push({
          cartera_id: "", // not linked to a cartera row yet
          credito_id: pc.credit_id,
          monto: pc.total,
          saldo_total: 0,
          cuota_esperada: pc.total,
        });
      }
      return {
        ...row,
        aporte,
        permanente: ca.savings ? ca.savings.ahorro_permanente : +(aporte * 0.9).toFixed(0),
        social: ca.savings ? ca.savings.ahorro_social : +(aporte * 0.1).toFixed(0),
        actividad,
        creditos,
      };
    });
    if (changed) {
      setRows(updated);
      setAppliedPdfUsers(newApplied);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloActualMap, rows.length]);

  const handlePdfUpload = async (file: File) => {
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/fondo/upload-pdf", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al subir el PDF");
      setUploadResult(data);
      setAppliedPdfUsers(new Set());
      setPdfUploaded(true);
      setManuallyAddedUsers(new Set());
      await fetchCicloActualData();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setUploading(false);
    }
  };

  const updateRowField = useCallback(
    (idx: number, field: "frecuencia" | "aporte" | "actividad", value: string | number) => {
      setRows((prev) => {
        const next = [...prev];
        const row = { ...next[idx] };
        if (field === "frecuencia") {
          row.frecuencia = value as "quincenal" | "mensual";
        } else if (field === "aporte") {
          const n = Number(value) || 0;
          row.aporte = n;
          row.permanente = +(n * 0.9).toFixed(0);
          row.social = +(n * 0.1).toFixed(0);
        } else if (field === "actividad") {
          row.actividad = Number(value) || 0;
        }
        next[idx] = row;
        return next;
      });
    },
    []
  );

  const updateCreditPayment = useCallback(
    (rowIdx: number, creditIdx: number, value: string) => {
      setRows((prev) => {
        const next = [...prev];
        const row = { ...next[rowIdx] };
        const creditos = [...row.creditos];
        creditos[creditIdx] = { ...creditos[creditIdx], monto: Number(value) || 0 };
        row.creditos = creditos;
        next[rowIdx] = row;
        return next;
      });
    },
    []
  );

  const computeRowTotal = (row: CycleRow): number => {
    const creditTotal = row.creditos.reduce((s, c) => s + (c.monto || 0), 0);
    return (row.aporte || 0) + (row.actividad || 0) + creditTotal;
  };

  // In ajustes_admin mode, only show users who actually have budget adjustments
  // When PDF uploaded, only show users in the PDF + manually added.
  // Order: with a PDF uploaded we respect the PDF's document order
  // (cicloActual.order set by /api/fondo/upload-pdf). Manually added users
  // come after the PDF users in the order they were picked. Without a PDF
  // we keep the default API ordering (name asc).
  const isAjustesMode = existingCiclo?.estado === "ajustes_admin";
  const visibleRows = useMemo(() => {
    if (isAjustesMode) return rows.filter((r) => budgetMap[r.user_id] !== undefined);
    if (pdfUploaded) {
      const filtered = rows.filter(
        (r) => cicloActualMap[r.user_id] || manuallyAddedUsers.has(r.user_id),
      );
      return [...filtered].sort((a, b) => {
        const aInPdf = cicloActualMap[a.user_id];
        const bInPdf = cicloActualMap[b.user_id];
        // PDF users before manually added users
        if (aInPdf && !bInPdf) return -1;
        if (!aInPdf && bInPdf) return 1;
        if (aInPdf && bInPdf) {
          const ao = aInPdf.order ?? Number.MAX_SAFE_INTEGER;
          const bo = bInPdf.order ?? Number.MAX_SAFE_INTEGER;
          return ao - bo;
        }
        return 0;
      });
    }
    return rows;
  }, [rows, isAjustesMode, budgetMap, pdfUploaded, cicloActualMap, manuallyAddedUsers]);

  const filtered = useMemo(
    () => {
      const q = filter.toLowerCase().trim();
      if (!q) return visibleRows;
      return visibleRows.filter((r) =>
        r.nombre.toLowerCase().includes(q) ||
        (r.cedula || "").toLowerCase().includes(q)
      );
    },
    [visibleRows, filter]
  );

  // Rolling KPIs for the cycle header. Broken out per-category so the
  // admin can see what's driving the total at a glance (e.g. "this cycle
  // is heavy on actividad, not so much aporte").
  const kpis = useMemo(() => {
    let aportes = 0;
    let actividad = 0;
    let creditos = 0;
    for (const row of visibleRows) {
      aportes += row.aporte || 0;
      actividad += row.actividad || 0;
      for (const c of row.creditos) creditos += c.monto || 0;
    }
    return {
      usuarios: visibleRows.length,
      aportes,
      actividad,
      creditos,
      total: aportes + actividad + creditos,
    };
  }, [visibleRows]);

  const cycleTotal = kpis.total;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    setSuccess(false);
    try {
      // Add credito_pago_total computed for backwards compat
      const movimientos = rows.map(r => ({
        ...r,
        credito_pago_total: r.creditos.reduce((s, c) => s + (c.monto || 0), 0),
      }));

      const res = await fetch("/api/fondo/ciclos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo, movimientos }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error al enviar el ciclo");
      }
      setSuccess(true);
      // Mark cycle as existing now — if we were in ajustes_admin mode this is now aprobado
      const data = await res.json();
      const newEstado = isAjustesMode ? "aprobado" : "enviado_admin";
      setExistingCiclo({ ...existingCiclo, _id: data.id, estado: newEstado, periodo, movimientos: rows, created_at: new Date().toISOString() });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-[#f4a900] border-t-transparent rounded-full" />
      </div>
    );
  }

  // If a cycle already exists for this period and it's NOT in ajustes_admin state,
  // show a "already submitted" card with the submitted summary so the
  // admin remembers exactly what was sent.
  if (existingCiclo && existingCiclo.estado !== "ajustes_admin") {
    const stateInfo: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
      enviado_admin: {
        label: "Enviado al administrador",
        tone: "bg-amber-50 text-amber-900 border-amber-200",
        icon: <Clock className="w-4 h-4" />,
      },
      aprobado: {
        label: "Aprobado",
        tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
        icon: <Check className="w-4 h-4" />,
      },
      rechazado: {
        label: "Rechazado",
        tone: "bg-red-50 text-red-700 border-red-200",
        icon: <X className="w-4 h-4" />,
      },
    };
    const info = stateInfo[existingCiclo.estado] || {
      label: existingCiclo.estado,
      tone: "bg-gray-50 text-gray-700 border-gray-200",
      icon: <Clock className="w-4 h-4" />,
    };
    const submittedTotal = (existingCiclo.movimientos || []).reduce((s, m) => {
      const credTotal = Array.isArray(m.creditos)
        ? m.creditos.reduce((a, c) => a + (Number(c.monto) || 0), 0)
        : Number(m.credito_pago_total) || 0;
      return s + (Number(m.aporte) || 0) + (Number(m.actividad) || 0) + credTotal;
    }, 0);
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-gray-100 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Ciclo</p>
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1">{periodoLabel}</h2>
            <span className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${info.tone}`}>
              {info.icon} {info.label}
            </span>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total enviado</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">{fmt(submittedTotal)}</p>
            <p className="text-xs text-gray-500 mt-1">
              {(existingCiclo.movimientos || []).length} usuarios
            </p>
          </div>
        </div>
        <div className="p-6 text-sm text-gray-500 text-center">
          El próximo ciclo estará disponible cuando inicie la siguiente quincena.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ============== Top card: header + KPIs + submit ============== */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Ciclo actual</p>
              {isAjustesMode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">
                  <Clock className="h-3 w-3" /> Ajustes pendientes
                </span>
              )}
              {!isAjustesMode && pdfUploaded && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                  <Check className="h-3 w-3" /> PDF cargado
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1 flex items-center gap-2">
              <Clock size={22} className="text-[#f4a900]" />
              {periodoLabel}
            </h2>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#f4a900] text-black font-bold text-sm shadow-md shadow-[#f4a900]/30 hover:bg-[#e68a00] disabled:opacity-50 transition-all"
          >
            {submitting ? (
              <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full" />
            ) : (
              <Send size={16} />
            )}
            {isAjustesMode ? "Aprobar y aplicar" : "Aprobar y enviar"}
          </button>
        </div>

        {/* KPI strip — every card is a running count that refreshes as
            the fondo user tweaks rows. Grand total on the right so
            "how big is this cycle" is the first thing your eye sees. */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-100 border-t border-b border-gray-100">
          <CicloKpi icon={<Users className="h-4 w-4" />} label="Usuarios" value={String(kpis.usuarios)} />
          <CicloKpi icon={<DollarSign className="h-4 w-4" />} label="Aportes" value={fmt(kpis.aportes)} />
          <CicloKpi icon={<Activity className="h-4 w-4" />} label="Actividad" value={fmt(kpis.actividad)} />
          <CicloKpi icon={<CreditCard className="h-4 w-4" />} label="Créditos" value={fmt(kpis.creditos)} />
          <CicloKpi
            icon={<Landmark className="h-4 w-4" />}
            label="Total del ciclo"
            value={fmt(kpis.total)}
            highlight
          />
        </div>
      </section>

      {/* Ajustes banner — only when fondo is fixing admin's budgets. */}
      {isAjustesMode && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-900">
          <p className="font-semibold text-sm mb-1">El administrador ajustó los presupuestos de estos usuarios.</p>
          <p className="text-xs leading-relaxed">
            Solo se muestran los usuarios cuyo presupuesto cambió. Redistribuye el dinero entre
            las categorías sin sobrepasar el presupuesto. Al aprobar, los movimientos se
            aplicarán inmediatamente sin pasar por el administrador.
          </p>
        </div>
      )}

      {/* Status messages */}
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-700 text-sm flex items-center gap-2">
          <Check size={16} /> {isAjustesMode ? "Ciclo aprobado y aplicado correctamente." : "Ciclo enviado exitosamente al administrador."}
        </div>
      )}

      {/* ============== PDF upload zone ============== */}
      {/* Before upload: a big, obvious dropzone. After a successful
          upload we collapse to a compact summary chip so it doesn't
          dominate the page while the admin is editing rows. */}
      {!uploadResult ? (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-xl bg-[#f4a900]/10 text-[#f4a900] flex items-center justify-center flex-shrink-0">
              <FileText className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <p className="text-sm font-bold text-gray-900">Cargar nómina (PDF)</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Sube el PDF de la nómina para autocompletar aportes, actividades y abonos de
                crédito por usuario, en el orden del PDF.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f4a900] text-black text-sm font-bold cursor-pointer hover:bg-[#e68a00] transition disabled:opacity-50">
              <Upload size={16} />
              {uploading ? "Procesando..." : "Seleccionar PDF"}
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePdfUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {uploadError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={14} /> {uploadError}
            </div>
          )}
        </section>
      ) : (
        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 sm:p-4 flex items-center gap-3 flex-wrap">
          <Check className="h-5 w-5 text-emerald-700 flex-shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-bold text-emerald-900">Nómina cargada</p>
            <p className="text-xs text-emerald-800/80">
              {uploadResult.total_en_pdf} en PDF · {uploadResult.actualizados} actualizados
              {uploadResult.no_encontrados > 0 ? ` · ${uploadResult.no_encontrados} no encontrados` : ""}
            </p>
            {uploadResult.cedulas_no_encontradas.length > 0 && (
              <details className="mt-1">
                <summary className="text-[11px] text-amber-800 cursor-pointer font-semibold">Ver cédulas no encontradas</summary>
                <p className="mt-1 text-[11px] text-amber-700 break-words">
                  {uploadResult.cedulas_no_encontradas.join(", ")}
                </p>
              </details>
            )}
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 text-xs font-semibold cursor-pointer hover:bg-emerald-100 transition">
            <Upload size={13} />
            Reemplazar PDF
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePdfUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        </section>
      )}

      {/* ============== Search + count ============== */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filtrar por nombre o cédula..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
          />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {filtered.length} {filtered.length === 1 ? "usuario" : "usuarios"}
          {pdfUploaded && manuallyAddedUsers.size > 0 ? ` · ${manuallyAddedUsers.size} agregados` : ""}
        </span>
      </section>

      {/* ============== Per-user cards ============== */}
      <section className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-12 text-center text-gray-400 text-sm">
            No se encontraron miembros.
          </div>
        )}
        {filtered.map((row) => {
          const idx = rows.findIndex((r) => r.user_id === row.user_id);
          const total = computeRowTotal(row);
          const budget = budgetMap[row.user_id];
          const overBudget = budget !== undefined && total > budget;
          return (
            <div
              key={row.user_id}
              className={`rounded-2xl border shadow-sm transition ${
                overBudget
                  ? "border-red-300 bg-red-50/40"
                  : "border-gray-200 bg-white hover:border-[#f4a900]/40"
              } p-4 sm:p-5`}
            >
              <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{row.nombre}</p>
                  <p className="text-xs text-gray-500 font-mono">CC {row.cedula}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {budget !== undefined && (
                    <div
                      className={`px-2.5 py-1 rounded-lg text-[11px] ${
                        overBudget
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      <span className="font-semibold">Presupuesto:</span> {fmt(budget)}
                    </div>
                  )}
                  <div
                    className={`px-3 py-1.5 rounded-lg ${
                      overBudget
                        ? "bg-red-100 text-red-900"
                        : total > 0
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Total</span>
                    <span className="ml-1.5 text-sm font-extrabold">{fmt(total)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Frecuencia</label>
                  <select
                    value={row.frecuencia}
                    onChange={(e) => updateRowField(idx, "frecuencia", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                  >
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Aporte ($) — 90% perm / 10% social</label>
                  <input
                    type="number"
                    min={0}
                    value={row.aporte}
                    onChange={(e) => updateRowField(idx, "aporte", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                  />
                  <p className="text-[9px] text-gray-400 mt-0.5">Permanente: {fmt(row.permanente)} · Social: {fmt(row.social)}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Actividad ($)</label>
                  <input
                    type="number"
                    min={0}
                    value={row.actividad}
                    onChange={(e) => updateRowField(idx, "actividad", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                  />
                </div>
              </div>

              {/* Credits — one input per active loan */}
              {row.creditos.length > 0 && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Créditos activos ({row.creditos.length})
                  </label>
                  <div className="space-y-2">
                    {row.creditos.map((cr, ci) => {
                      const unlinked = !cr.cartera_id;
                      return (
                      <div key={cr.cartera_id || `pdf-${cr.credito_id}-${ci}`} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 truncate">
                            Crédito {cr.credito_id}
                            {unlinked && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                                Sin vincular
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {unlinked
                              ? "Del PDF — enlaza este crédito en Cartera para que el pago descuente saldo"
                              : cr.saldo_total > 0 || cr.cuota_esperada > 0
                              ? `Saldo: ${fmt(cr.saldo_total)}${cr.cuota_esperada > 0 ? ` · Cuota esperada: ${fmt(cr.cuota_esperada)}` : ""}`
                              : "Crédito sin cuotas configuradas — edítalo en Cartera"}
                          </p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={cr.monto}
                          onChange={(e) => updateCreditPayment(idx, ci, e.target.value)}
                          className="w-32 text-right rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                        />
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ciclo Actual from PDF */}
              {cicloActualMap[row.user_id] && (() => {
                const ca = cicloActualMap[row.user_id];
                const isExpanded = expandedPdf === row.user_id;
                return (
                  <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedPdf(isExpanded ? null : row.user_id)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                    >
                      <span className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                        <FileText size={13} />
                        Datos nómina (PDF)
                        <span className="text-[10px] font-normal text-blue-600">
                          — {ca.credits.length} crédito(s), {ca.savings ? "ahorro" : "sin ahorro"}, {ca.activities.length} actividad(es)
                        </span>
                      </span>
                      {isExpanded ? <ChevronDown size={14} className="text-blue-600" /> : <ChevronRight size={14} className="text-blue-600" />}
                    </button>
                    {isExpanded && (
                      <div className="p-3 space-y-3 bg-white">
                        {ca.credits.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Abonos a crédito</p>
                            <div className="space-y-1">
                              {ca.credits.map((cr, i) => (
                                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-xs">
                                  <span className="font-semibold text-gray-700">Crédito {cr.credit_id}</span>
                                  <div className="flex gap-4 text-gray-600">
                                    <span>Interés: {fmt(cr.interest)}</span>
                                    <span>Capital: {fmt(cr.capital)}</span>
                                    <span className="font-bold text-gray-900">Total: {fmt(cr.total)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {ca.savings && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Ahorros</p>
                            <div className="flex items-center gap-4 p-2 rounded-lg bg-gray-50 text-xs text-gray-600">
                              <span>Permanente: {fmt(ca.savings.ahorro_permanente)}</span>
                              <span>Social: {fmt(ca.savings.ahorro_social)}</span>
                              <span className="font-bold text-gray-900">Total: {fmt(ca.savings.total)}</span>
                            </div>
                          </div>
                        )}
                        {ca.activities.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Actividades</p>
                            <div className="space-y-1">
                              {ca.activities.map((act, i) => (
                                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-xs">
                                  <span className="text-gray-700">{act.description}</span>
                                  <span className="font-bold text-gray-900">{fmt(act.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </section>

      {/* Add user button (visible after PDF upload) — outside the cards
          section so it doesn't look like a user row. */}
      {pdfUploaded && (
        <div>
          {!showAddUser ? (
            <button
              onClick={() => setShowAddUser(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-300 bg-white text-gray-500 hover:border-[#f4a900] hover:text-[#f4a900] transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <UserPlus size={16} />
              Agregar usuario no incluido en el PDF
            </button>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Seleccionar usuario</p>
                <button onClick={() => setShowAddUser(false)} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} className="text-gray-400" /></button>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {rows
                  .filter((r) => !cicloActualMap[r.user_id] && !manuallyAddedUsers.has(r.user_id))
                  .map((r) => (
                    <button
                      key={r.user_id}
                      onClick={() => {
                        setManuallyAddedUsers((prev) => new Set(prev).add(r.user_id));
                        setShowAddUser(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm transition-colors"
                    >
                      <span className="font-medium text-gray-900">{r.nombre}</span>
                      <span className="ml-2 text-xs text-gray-500">CC {r.cedula}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============== Sticky-feel footer with running total + submit ============== */}
      {filtered.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total del ciclo</p>
            <p className="text-2xl font-extrabold text-gray-900">{fmt(cycleTotal)}</p>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#f4a900] text-black font-bold text-sm shadow-md shadow-[#f4a900]/30 hover:bg-[#e68a00] disabled:opacity-50"
          >
            {submitting ? (
              <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full" />
            ) : (
              <Send size={16} />
            )}
            {isAjustesMode ? "Aprobar y aplicar" : "Aprobar y enviar"}
          </button>
        </section>
      )}
    </div>
  );
}

/* ================================================================== */
/*  HISTORIAL CICLOS TAB                                               */
/* ================================================================== */

function HistorialTab() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fondo/ciclos");
        if (!res.ok) throw new Error("Error cargando ciclos");
        const data: Ciclo[] = await res.json();
        setCiclos(data);
      } catch {
        setError("No se pudieron cargar los ciclos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-[#f4a900] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <History size={20} className="text-[#f4a900]" />
          Historial de Ciclos
        </h2>
      </div>

      {ciclos.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-400">
          No hay ciclos registrados.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {ciclos.map((c) => (
            <div key={(c._id || c.id) as string}>
              <button
                onClick={() => {
                  const cid = (c._id || c.id) as string;
                  setExpanded(expanded === cid ? null : cid);
                }}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-gray-900">
                    {c.periodo}
                  </span>
                  {estadoBadge(c.estado)}
                  {(c.revision_count || 0) > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                      Revisión {c.revision_count}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-gray-400">
                  <span className="text-xs">
                    {new Date(c.created_at).toLocaleDateString("es-CO")}
                  </span>
                  {expanded === (c._id || c.id) ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </div>
              </button>

              {expanded === (c._id || c.id) && (
                <div className="px-5 pb-5 space-y-4">
                  {(() => {
                    const movimientos = c.movimientos || [];
                    const cid = (c._id || c.id) as string;
                    const computeTotal = (m: CycleRow): number => {
                      const credTotal = Array.isArray(m.creditos)
                        ? m.creditos.reduce((s, x) => s + (Number(x.monto) || 0), 0)
                        : (m.credito_pago_total || 0);
                      return (Number(m.aporte) || 0) + (Number(m.actividad) || 0) + credTotal;
                    };
                    const grandTotal = movimientos.reduce((s, m) => s + computeTotal(m), 0);

                    return (
                      <>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-xs text-gray-500">
                            {movimientos.length} asociado{movimientos.length === 1 ? "" : "s"}
                            {" · "}
                            <span className="font-semibold text-gray-900">Total: {fmt(grandTotal)}</span>
                          </div>
                          <a
                            href={`/api/fondo/ciclos/${cid}/reporte-pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-700 transition"
                          >
                            <FileText size={13} /> Descargar PDF
                          </a>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <th className="px-3 py-2">Nombre</th>
                                <th className="px-3 py-2 text-right">Aporte</th>
                                <th className="px-3 py-2 text-right">Actividad</th>
                                <th className="px-3 py-2 text-right">Créditos</th>
                                <th className="px-3 py-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {movimientos.map((r, i) => {
                                const credTotal = Array.isArray(r.creditos)
                                  ? r.creditos.reduce((s, x) => s + (Number(x.monto) || 0), 0)
                                  : (r.credito_pago_total || 0);
                                return (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 font-medium text-gray-900">{r.nombre}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{fmt(r.aporte || 0)}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{fmt(r.actividad || 0)}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{fmt(credTotal)}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(computeTotal(r))}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {c.estado === "aprobado" && (
                          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
                            <Check size={16} />
                            Aprobado sin cambios por el administrador.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  BUSCAR AFILIADO TAB                                                */
/* ================================================================== */

function BuscarAfiliadoTab() {
  const [query, setQuery] = useState("");
  // Load all members up front so the fondo user can scan the list without
  // guessing a search term. The backend already sorts by nombre asc when no
  // search param is passed.
  const [allMembers, setAllMembers] = useState<SearchUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selected, setSelected] = useState<SearchUser | null>(null);

  /* profile data */
  const [saldos, setSaldos] = useState<Saldos | null>(null);
  const [aportes, setAportes] = useState<AporteHistorial[]>([]);
  const [actividades, setActividades] = useState<ActividadHistorial[]>([]);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [saving, setSaving] = useState(false);

  /* manual-entry forms */
  const [showAddAporte, setShowAddAporte] = useState(false);
  const [showAddActividad, setShowAddActividad] = useState(false);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [addError, setAddError] = useState("");

  /* editable credito_id */
  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [editCreditIdValue, setEditCreditIdValue] = useState("");

  const handleSaveCreditId = async (carteraId: string) => {
    if (!editCreditIdValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/fondo/cartera", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartera_id: carteraId, action: "update_credito_id", credito_id: editCreditIdValue.trim() }),
      });
      if (res.ok) {
        setCreditos(prev => prev.map(c => c._id === carteraId ? { ...c, credito_id: editCreditIdValue.trim() } : c));
        setEditingCreditId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  // Save saldo field
  const handleSaveSaldo = async (field: string, value: number) => {
    if (!selected) return;
    setSaving(true);
    try {
      const userId = selected.user_id || selected.id;
      const res = await fetch("/api/fondo/saldos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, [field]: value }),
      });
      if (res.ok && saldos) {
        const key = field.replace("saldo_", "") as keyof Saldos;
        setSaldos({ ...saldos, [key]: value });
      }
    } finally {
      setSaving(false);
    }
  };

  // Save credit fields
  const handleSaveCreditFields = async (carteraId: string, fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/fondo/cartera", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartera_id: carteraId, action: "update_fields", fields }),
      });
      if (res.ok) {
        // Refresh the user profile
        const userId = selected?.user_id || selected?.id;
        if (userId) {
          const sRes = await fetch(`/api/fondo/saldos?user_id=${userId}`);
          if (sRes.ok) {
            const data = await sRes.json();
            if (data.saldos) setSaldos(data.saldos);
            if (Array.isArray(data.cartera)) setCreditos(data.cartera);
          }
        }
      }
    } finally {
      setSaving(false);
    }
  };

  /* collapsible sections */
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    saldos: true,
    aportes: true,
    actividades: false,
    cartera: true,
  });

  const toggleSection = (key: string) =>
    setOpenSections((p) => ({ ...p, [key]: !p[key] }));

  // Load all members on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fondo/members");
        if (res.ok) {
          const data = await res.json();
          setAllMembers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Load members error:", err);
      } finally {
        setLoadingMembers(false);
      }
    })();
  }, []);

  // Client-side filter — lets the user scan by name or cédula without
  // round-tripping to the server on every keystroke. String()-coerce both
  // sides defensively: a stray numeric cedula in the API response would
  // otherwise blow up .toLowerCase() and take the whole tab down.
  const filteredMembers = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return allMembers;
    return allMembers.filter((m) =>
      String(m.nombre || "").toLowerCase().includes(q) ||
      String(m.cedula || "").toLowerCase().includes(q),
    );
  }, [allMembers, query]);

  // Shared fetch. When `background` is true we skip the loader + the
  // optimistic blanking of the saldos/aportes/etc. state, so an edit-save
  // cycle doesn't flash the whole profile out and back in. Fewer mount/
  // unmount cycles also means less surface for DOM-mutating extensions
  // (e.g. Google Translate) to trip up React's reconciler — we've seen
  // removeChild errors coming from that interaction.
  const loadProfile = async (user: SearchUser, background = false) => {
    if (!background) {
      setLoadingProfile(true);
      setSaldos(null);
      setAportes([]);
      setActividades([]);
      setCreditos([]);
    }
    try {
      const userId = user.user_id || user.id;
      const sRes = await fetch(`/api/fondo/saldos?user_id=${userId}`);
      if (sRes.ok) {
        const data = await sRes.json();
        if (data.saldos) setSaldos(data.saldos);
        if (Array.isArray(data.aportes)) setAportes(data.aportes);
        if (Array.isArray(data.actividad)) setActividades(data.actividad);
        if (Array.isArray(data.cartera)) setCreditos(data.cartera);
      }
    } finally {
      if (!background) setLoadingProfile(false);
    }
  };

  const selectUser = async (user: SearchUser) => {
    setSelected(user);
    setShowAddAporte(false);
    setShowAddActividad(false);
    setShowAddCredit(false);
    setAddError("");
    await loadProfile(user);
  };

  const refreshProfile = async () => {
    if (selected) await loadProfile(selected, /* background = */ true);
  };

  const handlePatchAporte = async (id: string, patch: Record<string, unknown>) => {
    if (!id) return;
    setSaving(true);
    setAddError("");
    try {
      const res = await fetch("/api/fondo/aportes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      await refreshProfile();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAporte = async (id: string) => {
    if (!id) return;
    if (!confirm("¿Eliminar este aporte? El saldo del afiliado se ajustará en consecuencia.")) return;
    setSaving(true);
    setAddError("");
    try {
      const res = await fetch(`/api/fondo/aportes?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      await refreshProfile();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddAporte = async (values: { monto_total: number; periodo: string; descripcion: string }) => {
    if (!selected) return;
    setSaving(true);
    setAddError("");
    try {
      const userId = selected.user_id || selected.id;
      const res = await fetch("/api/fondo/aportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...values, tipo: "manual" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      setShowAddAporte(false);
      await refreshProfile();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddActividad = async (values: { tipo: "aporte" | "retiro"; monto: number; descripcion: string }) => {
    if (!selected) return;
    setSaving(true);
    setAddError("");
    try {
      const userId = selected.user_id || selected.id;
      const res = await fetch("/api/fondo/actividad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...values }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      setShowAddActividad(false);
      await refreshProfile();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCredit = async (values: {
    valor_prestamo: number;
    numero_cuotas: number;
    frecuencia_pago: "mensual" | "quincenal";
    credito_id: string;
    fecha_cuota_1: string;
    motivo_solicitud: string;
  }) => {
    if (!selected) return;
    setSaving(true);
    setAddError("");
    try {
      const userId = selected.user_id || selected.id;
      const res = await fetch("/api/fondo/cartera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...values }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      setShowAddCredit(false);
      await refreshProfile();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search + full members list */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Search size={20} className="text-[#f4a900]" />
            Buscar Afiliado
            {!loadingMembers && (
              <span className="text-xs font-normal text-gray-400">
                ({filteredMembers.length}{query ? ` de ${allMembers.length}` : ""})
              </span>
            )}
          </h2>
        </div>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Filtrar por nombre o cédula..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
          />
        </div>

        {/* Members list — always shown (scrollable). Clicking one expands the
            profile below. */}
        {!selected && (
          loadingMembers ? (
            <div className="mt-4 p-6 rounded-xl border border-gray-200 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-[#f4a900] border-t-transparent rounded-full" />
              Cargando afiliados...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="mt-4 p-6 rounded-xl border border-dashed border-gray-200 text-center text-sm text-gray-500">
              {query ? "Ningún afiliado coincide con ese filtro." : "No hay afiliados registrados."}
            </div>
          ) : (
            <div className="mt-4 max-h-[480px] overflow-y-auto divide-y divide-gray-100 rounded-xl border border-gray-200">
              {filteredMembers.map((u, i) => (
                <button
                  key={u.id ? `m-${u.id}` : `m-idx-${i}`}
                  onClick={() => selectUser(u)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f4a900]/[0.04] transition-colors text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900">{u.nombre || "Sin nombre"}</p>
                    <p className="text-xs text-gray-500">CC: {u.cedula || "—"}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              ))}
            </div>
          )
        )}
      </div>

      {/* Profile */}
      {selected && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">
              {selected.nombre}{" "}
              <span className="text-sm font-normal text-gray-500">
                CC: {selected.cedula}
              </span>
            </h3>
            <button
              onClick={() => {
                setSelected(null);
                setSaldos(null);
                setAportes([]);
                setActividades([]);
                setCreditos([]);
              }}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {addError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {addError}
            </div>
          )}

          {loadingProfile ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-[#f4a900] border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {/* Saldos */}
              <CollapsibleSection
                title="Saldos"
                icon={<Wallet size={18} className="text-[#f4a900]" />}
                open={openSections.saldos}
                onToggle={() => toggleSection("saldos")}
              >
                {saldos ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {([
                      { label: "Permanente", field: "saldo_permanente", value: saldos.permanente },
                      { label: "Social", field: "saldo_social", value: saldos.social },
                      { label: "Actividad", field: "saldo_actividad", value: saldos.actividad },
                      { label: "Intereses", field: "saldo_intereses", value: saldos.intereses },
                    ] as const).map((s) => (
                      <div
                        key={s.label}
                        className="bg-gray-50 rounded-xl p-3 border border-gray-100"
                      >
                        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
                          {s.label}
                        </p>
                        <input
                          type="number"
                          defaultValue={s.value}
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (v !== s.value) handleSaveSaldo(s.field, v);
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className="w-full text-lg font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#f4a900] focus:outline-none transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    No se encontraron saldos.
                  </p>
                )}
              </CollapsibleSection>

              {/* Estado de Cuenta (Aportes) */}
              <CollapsibleSection
                title="Estado de Cuenta"
                icon={<DollarSign size={18} className="text-[#f4a900]" />}
                open={openSections.aportes}
                onToggle={() => toggleSection("aportes")}
              >
                <div className="mb-3 flex justify-end">
                  {!showAddAporte ? (
                    <button
                      onClick={() => setShowAddAporte(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f4a900]/10 text-[#9a6b00] border border-[#f4a900]/30 text-xs font-semibold hover:bg-[#f4a900]/20"
                    >
                      <UserPlus size={14} /> Agregar aporte
                    </button>
                  ) : (
                    <AddAporteForm
                      saving={saving}
                      onCancel={() => setShowAddAporte(false)}
                      onSubmit={handleAddAporte}
                    />
                  )}
                </div>
                {aportes.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          <th className="px-3 py-2">Periodo</th>
                          <th className="px-3 py-2 text-right">Aporte</th>
                          <th className="px-3 py-2 text-right">Permanente</th>
                          <th className="px-3 py-2 text-right">Social</th>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {aportes.map((a, i) => {
                          const id = a._id as string | undefined;
                          // Guard against invalid/missing dates so a bad row
                          // doesn't throw `RangeError: Invalid time value`
                          // from toISOString() and blank the tab.
                          const fechaStr = (() => {
                            if (!a.fecha_ejecucion) return "";
                            const d = new Date(a.fecha_ejecucion);
                            if (isNaN(d.getTime())) return "";
                            return d.toISOString().slice(0, 10);
                          })();
                          const onBlurPatch = (field: string, parse: (v: string) => unknown, current: unknown) =>
                            (e: React.FocusEvent<HTMLInputElement>) => {
                              const next = parse(e.target.value);
                              if (next === current || !id) return;
                              handlePatchAporte(id, { [field]: next });
                            };
                          return (
                            <tr key={id ? `a-${id}` : `a-idx-${i}`} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2">
                                <input
                                  defaultValue={a.periodo}
                                  onBlur={onBlurPatch("periodo", (v) => v.trim(), a.periodo)}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                  className="w-24 font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#f4a900] focus:outline-none transition-colors"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  defaultValue={a.monto_total || 0}
                                  onBlur={onBlurPatch("monto_total", (v) => Number(v) || 0, a.monto_total || 0)}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                  className="w-28 text-right text-gray-600 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#f4a900] focus:outline-none transition-colors"
                                />
                              </td>
                              <td className="px-3 py-2 text-right text-gray-400">
                                {fmt(a.monto_permanente || 0)}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-400">
                                {fmt(a.monto_social || 0)}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  defaultValue={fechaStr}
                                  onBlur={onBlurPatch("fecha_ejecucion", (v) => v, fechaStr)}
                                  className="text-xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#f4a900] focus:outline-none transition-colors"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => id && handleDeleteAporte(id)}
                                  disabled={!id || saving}
                                  title="Eliminar aporte"
                                  className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[10px] text-gray-400">
                      Permanente y Social se recalculan automáticamente (90% / 10% del aporte).
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    Sin historial de aportes.
                  </p>
                )}
              </CollapsibleSection>

              {/* Actividades */}
              <CollapsibleSection
                title="Actividades"
                icon={<Activity size={18} className="text-[#f4a900]" />}
                open={openSections.actividades}
                onToggle={() => toggleSection("actividades")}
              >
                <div className="mb-3 flex justify-end">
                  {!showAddActividad ? (
                    <button
                      onClick={() => setShowAddActividad(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f4a900]/10 text-[#9a6b00] border border-[#f4a900]/30 text-xs font-semibold hover:bg-[#f4a900]/20"
                    >
                      <UserPlus size={14} /> Agregar actividad
                    </button>
                  ) : (
                    <AddActividadForm
                      saving={saving}
                      onCancel={() => setShowAddActividad(false)}
                      onSubmit={handleAddActividad}
                    />
                  )}
                </div>
                {actividades.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2 text-right">Monto</th>
                          <th className="px-3 py-2">Descripcion</th>
                          <th className="px-3 py-2">Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {actividades.map((a, i) => (
                          <tr
                            key={a._id ? `act-${a._id}` : `act-idx-${i}`}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  a.tipo === "aporte"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {a.tipo === "aporte" ? "Aporte" : "Retiro"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-700">
                              {fmt(a.monto || 0)}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {a.descripcion || "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs">
                              {a.fecha ? new Date(a.fecha).toLocaleDateString("es-CO") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    Sin actividades registradas.
                  </p>
                )}
              </CollapsibleSection>

              {/* Cartera / Creditos */}
              <CollapsibleSection
                title="Cartera"
                icon={<CreditCard size={18} className="text-[#f4a900]" />}
                open={openSections.cartera}
                onToggle={() => toggleSection("cartera")}
              >
                <div className="mb-3 flex justify-end">
                  {!showAddCredit ? (
                    <button
                      onClick={() => setShowAddCredit(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f4a900]/10 text-[#9a6b00] border border-[#f4a900]/30 text-xs font-semibold hover:bg-[#f4a900]/20"
                    >
                      <UserPlus size={14} /> Agregar crédito
                    </button>
                  ) : (
                    <AddCreditForm
                      saving={saving}
                      onCancel={() => setShowAddCredit(false)}
                      onSubmit={handleAddCredit}
                    />
                  )}
                </div>
                {creditos.length > 0 ? (
                  <div className="space-y-4">
                    {creditos.map((cr, idx) => {
                      const totalCuotas = (cr.numero_cuotas || (cr.cuotas_pagadas + cr.cuotas_restantes));
                      return (
                      <div
                        key={cr._id ? `cr-${cr._id}` : `cr-idx-${idx}`}
                        className="rounded-xl border border-gray-200 overflow-hidden"
                      >
                        {/* Credit header with editable ID */}
                        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            {editingCreditId === cr._id ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500">ID:</span>
                                <input
                                  type="text"
                                  value={editCreditIdValue}
                                  onChange={(e) => setEditCreditIdValue(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && handleSaveCreditId(cr._id!)}
                                  className="w-24 px-2 py-1 rounded-lg border border-[#f4a900] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
                                  autoFocus
                                />
                                <button onClick={() => handleSaveCreditId(cr._id!)} disabled={saving} className="p-1 rounded-lg bg-[#f4a900] text-white hover:bg-[#e68a00] disabled:opacity-50"><Check size={14} /></button>
                                <button onClick={() => setEditingCreditId(null)} className="p-1 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300"><X size={14} /></button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingCreditId(cr._id!); setEditCreditIdValue(cr.credito_id || cr._id || ""); }}
                                className="font-semibold text-gray-900 text-sm hover:text-[#f4a900] transition-colors cursor-pointer"
                                title="Click para editar ID"
                              >
                                Crédito {cr.credito_id || cr._id}
                                <span className="ml-1 text-[10px] text-gray-400">(editar)</span>
                              </button>
                            )}
                          </div>
                          <select
                            defaultValue={cr.estado}
                            onChange={(e) => handleSaveCreditFields(cr._id!, { estado: e.target.value })}
                            className="text-xs font-semibold rounded-full px-2.5 py-0.5 border bg-white focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
                          >
                            <option value="activo">activo</option>
                            <option value="pagado">pagado</option>
                            <option value="pendiente">pendiente</option>
                            <option value="rechazado">rechazado</option>
                          </select>
                        </div>

                        {/* Editable credit fields */}
                        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {([
                            { label: "Valor Préstamo", field: "valor_prestamo", value: cr.valor_prestamo, type: "number" },
                            { label: "Saldo Total", field: "saldo_total", value: cr.saldo_total, type: "number" },
                            { label: "Tasa Interés (%)", field: "tasa_interes", value: cr.tasa_interes ?? 0, type: "number" },
                            { label: "Num. Cuotas", field: "numero_cuotas", value: totalCuotas, type: "number" },
                            { label: "Cuotas Pagadas", field: "cuotas_pagadas", value: cr.cuotas_pagadas, type: "number" },
                            { label: "Cuotas Restantes", field: "", value: cr.cuotas_restantes, type: "readonly" },
                            { label: "Frecuencia", field: "frecuencia_pago", value: cr.frecuencia_pago || "mensual", type: "select" },
                            { label: "Fecha Desembolso", field: "fecha_desembolso", value: (() => {
                              if (!cr.fecha_desembolso) return "";
                              const d = new Date(cr.fecha_desembolso);
                              return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
                            })(), type: "date" },
                          ] as const).map((f) => (
                            <div key={f.label}>
                              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</p>
                              {f.type === "readonly" ? (
                                <p className="text-sm font-bold text-gray-900">{f.value}</p>
                              ) : f.type === "select" ? (
                                <select
                                  defaultValue={String(f.value)}
                                  onChange={(e) => handleSaveCreditFields(cr._id!, { [f.field]: e.target.value })}
                                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
                                >
                                  <option value="mensual">Mensual</option>
                                  <option value="quincenal">Quincenal</option>
                                </select>
                              ) : (
                                <input
                                  type={f.type}
                                  defaultValue={f.value}
                                  onBlur={(e) => {
                                    const v = f.type === "date" ? e.target.value : Number(e.target.value) || 0;
                                    if (String(v) !== String(f.value)) handleSaveCreditFields(cr._id!, { [f.field]: v });
                                  }}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                                  step={f.field === "tasa_interes" ? "0.01" : undefined}
                                />
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Payment history */}
                        {(cr.pagos ?? []).length > 0 && (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                                <th className="px-4 py-2">Cuota</th>
                                <th className="px-4 py-2">Fecha</th>
                                <th className="px-4 py-2 text-right">Monto</th>
                                <th className="px-4 py-2">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {(cr.pagos ?? []).map((p, i) => (
                                <tr key={i} className={`transition-colors ${p.flagged ? "bg-yellow-50" : "hover:bg-gray-50"}`}>
                                  <td className="px-4 py-2 text-gray-700 font-medium">#{p.numero_cuota}</td>
                                  <td className="px-4 py-2 text-gray-600">{p.fecha_pago ? new Date(p.fecha_pago).toLocaleDateString("es-CO") : "—"}</td>
                                  <td className="px-4 py-2 text-right font-mono text-gray-700">{fmt(p.monto_total || 0)}</td>
                                  <td className="px-4 py-2">
                                    {p.flagged ? (
                                      <span className="inline-flex items-center gap-1 text-xs text-yellow-700 font-semibold"><AlertCircle size={14} /> Difiere</span>
                                    ) : (
                                      <span className="text-xs text-green-600 font-semibold">OK</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    Sin creditos registrados.
                  </p>
                )}
              </CollapsibleSection>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  NUEVO AFILIADO TAB                                                 */
/* ================================================================== */

function NuevoAfiliadoTab() {
  const [mode, setMode] = useState<"interno" | "externo">("interno");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [montoAporte, setMontoAporte] = useState("");
  const [frecuencia, setFrecuencia] = useState<"quincenal" | "mensual">(
    "quincenal"
  );
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // External user fields
  const [extNombre, setExtNombre] = useState("");
  const [extCedula, setExtCedula] = useState("");
  const [extEmail, setExtEmail] = useState("");

  const resetForm = () => {
    setSelectedUser(null);
    setMontoAporte("");
    setSearchQuery("");
    setSearchResults([]);
    setExtNombre("");
    setExtCedula("");
    setExtEmail("");
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/fondo/members?search_users=${encodeURIComponent(searchQuery)}`
      );
      if (res.ok) setSearchResults(await res.json());
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    setSuccess(false);
    try {
      let payload: Record<string, unknown>;

      if (mode === "externo") {
        if (!extCedula.trim() || !extNombre.trim() || !montoAporte) return;
        payload = {
          createExternal: true,
          cedula: extCedula.trim(),
          nombre: extNombre.trim(),
          email: extEmail.trim() || undefined,
          monto_aporte: Number(montoAporte),
          frecuencia,
        };
      } else {
        if (!selectedUser || !montoAporte) return;
        payload = {
          user_id: selectedUser.id,
          monto_aporte: Number(montoAporte),
          frecuencia,
        };
      }

      const res = await fetch("/api/fondo/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error al crear afiliado");
      }
      setSuccess(true);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <UserPlus size={20} className="text-[#f4a900]" />
          Nuevo Afiliado
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Enrolla un empleado existente o crea un usuario externo para Fonalmerque.
        </p>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => { setMode("interno"); resetForm(); setSuccess(false); setError(""); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === "interno"
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Empleado existente
          </button>
          <button
            onClick={() => { setMode("externo"); resetForm(); setSuccess(false); setError(""); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === "externo"
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Persona externa
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
            <Check size={16} />
            {mode === "externo"
              ? "Usuario externo creado y afiliado al fondo. La contraseña son los últimos 8 dígitos de la cédula."
              : "Afiliado creado exitosamente."}
          </div>
        )}

        {mode === "interno" ? (
          <>
            {/* Step 1: Search user */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                1. Buscar Usuario
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o cédula..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 disabled:opacity-50 transition-all"
                >
                  {searching ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Search size={16} />
                  )}
                  Buscar
                </button>
              </div>

              {searchResults.length > 0 && !selectedUser && (
                <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f4a900]/[0.04] transition-colors text-left"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{u.nombre}</p>
                        <p className="text-xs text-gray-500">CC: {u.cedula}</p>
                      </div>
                      <ChevronRight size={16} className="text-gray-400" />
                    </button>
                  ))}
                </div>
              )}

              {selectedUser && (
                <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-[#f4a900]/[0.06] border border-[#f4a900]/20">
                  <Users size={18} className="text-[#f4a900]" />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">
                      {selectedUser.nombre}
                    </p>
                    <p className="text-xs text-gray-500">
                      CC: {selectedUser.cedula}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="p-1 rounded-lg hover:bg-white text-gray-400 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Configure */}
            {selectedUser && (
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-700">
                  2. Configurar Aporte
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Monto del Aporte ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={montoAporte}
                      onChange={(e) => setMontoAporte(e.target.value)}
                      placeholder="Ej: 100000"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Frecuencia
                    </label>
                    <select
                      value={frecuencia}
                      onChange={(e) =>
                        setFrecuencia(
                          e.target.value as "quincenal" | "mensual"
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900] bg-white"
                    >
                      <option value="quincenal">Quincenal</option>
                      <option value="mensual">Mensual</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting || !montoAporte}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#f4a900] text-white font-semibold text-sm shadow-md shadow-[#f4a900]/25 hover:bg-[#e68a00] disabled:opacity-50 transition-all"
                >
                  {submitting ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <UserPlus size={16} />
                  )}
                  Crear Afiliado
                </button>
              </div>
            )}
          </>
        ) : (
          /* External user creation form */
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">
              Este usuario solo tendrá acceso al fondo y a la polla. No podrá ver nómina, cesantías, permisos ni otras secciones.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nombre completo *
                </label>
                <input
                  type="text"
                  value={extNombre}
                  onChange={(e) => setExtNombre(e.target.value)}
                  placeholder="Nombre del usuario"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Cédula *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={extCedula}
                  onChange={(e) => setExtCedula(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ej: 1023456789"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Correo (opcional)
                </label>
                <input
                  type="email"
                  value={extEmail}
                  onChange={(e) => setExtEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Monto del Aporte ($) *
                </label>
                <input
                  type="number"
                  min={0}
                  value={montoAporte}
                  onChange={(e) => setMontoAporte(e.target.value)}
                  placeholder="Ej: 100000"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Frecuencia
                </label>
                <select
                  value={frecuencia}
                  onChange={(e) =>
                    setFrecuencia(e.target.value as "quincenal" | "mensual")
                  }
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900] bg-white"
                >
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !extCedula.trim() || !extNombre.trim() || !montoAporte}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#f4a900] text-white font-semibold text-sm shadow-md shadow-[#f4a900]/25 hover:bg-[#e68a00] disabled:opacity-50 transition-all"
            >
              {submitting ? (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <UserPlus size={16} />
              )}
              Crear Usuario Externo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Collapsible Section                                                */
/* ================================================================== */

function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="flex items-center gap-2 font-bold text-gray-900">
          {icon}
          {title}
        </span>
        {open ? (
          <ChevronDown size={18} className="text-gray-400" />
        ) : (
          <ChevronRight size={18} className="text-gray-400" />
        )}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

/* ================================================================== */
/*  ADD-ENTRY FORMS (used inside Buscar Afiliado)                      */
/* ================================================================== */

function AddAporteForm({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: { monto_total: number; periodo: string; descripcion: string }) => void;
}) {
  const [monto, setMonto] = useState("");
  const defaultPeriod = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(defaultPeriod);
  const [descripcion, setDescripcion] = useState("");
  const valid = Number(monto) > 0;
  return (
    <div className="w-full max-w-xl p-3 rounded-xl border border-[#f4a900]/30 bg-[#f4a900]/[0.04] space-y-2">
      <p className="text-xs font-semibold text-gray-700">Nuevo aporte (90% permanente / 10% social)</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="number"
          placeholder="Monto total"
          min={0}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
        <input
          type="text"
          placeholder="Periodo (YYYY-MM)"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
        <input
          type="text"
          placeholder="Descripción (opcional)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200">Cancelar</button>
        <button
          onClick={() => onSubmit({ monto_total: Number(monto), periodo, descripcion })}
          disabled={!valid || saving}
          className="px-3 py-1.5 rounded-lg bg-[#f4a900] text-white text-xs font-bold hover:bg-[#e68a00] disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

function AddActividadForm({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: { tipo: "aporte" | "retiro"; monto: number; descripcion: string }) => void;
}) {
  const [tipo, setTipo] = useState<"aporte" | "retiro">("aporte");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const valid = Number(monto) > 0;
  return (
    <div className="w-full max-w-xl p-3 rounded-xl border border-[#f4a900]/30 bg-[#f4a900]/[0.04] space-y-2">
      <p className="text-xs font-semibold text-gray-700">Nueva actividad</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "aporte" | "retiro")}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        >
          <option value="aporte">Aporte</option>
          <option value="retiro">Retiro</option>
        </select>
        <input
          type="number"
          placeholder="Monto"
          min={0}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
        <input
          type="text"
          placeholder="Descripción"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200">Cancelar</button>
        <button
          onClick={() => onSubmit({ tipo, monto: Number(monto), descripcion })}
          disabled={!valid || saving}
          className="px-3 py-1.5 rounded-lg bg-[#f4a900] text-white text-xs font-bold hover:bg-[#e68a00] disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

function AddCreditForm({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    valor_prestamo: number;
    numero_cuotas: number;
    frecuencia_pago: "mensual" | "quincenal";
    credito_id: string;
    fecha_cuota_1: string;
    motivo_solicitud: string;
  }) => void;
}) {
  const [valor, setValor] = useState("");
  const [cuotas, setCuotas] = useState("12");
  const [frecuencia, setFrecuencia] = useState<"mensual" | "quincenal">("mensual");
  const [creditoId, setCreditoId] = useState("");
  const [fechaCuota1, setFechaCuota1] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("");
  const valid = Number(valor) > 0 && Number(cuotas) > 0 && Number(cuotas) <= 120;
  return (
    <div className="w-full max-w-2xl p-3 rounded-xl border border-[#f4a900]/30 bg-[#f4a900]/[0.04] space-y-2">
      <p className="text-xs font-semibold text-gray-700">Nuevo crédito (se crea activo con amortización estándar)</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <input
          type="number"
          placeholder="Valor préstamo"
          min={0}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
        <input
          type="number"
          placeholder="Número de cuotas"
          min={1}
          max={120}
          value={cuotas}
          onChange={(e) => setCuotas(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
        <select
          value={frecuencia}
          onChange={(e) => setFrecuencia(e.target.value as "mensual" | "quincenal")}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        >
          <option value="mensual">Mensual</option>
          <option value="quincenal">Quincenal</option>
        </select>
        <input
          type="text"
          placeholder="Código (opcional)"
          value={creditoId}
          onChange={(e) => setCreditoId(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
        <input
          type="date"
          value={fechaCuota1}
          onChange={(e) => setFechaCuota1(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
        <input
          type="text"
          placeholder="Motivo (opcional)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200">Cancelar</button>
        <button
          onClick={() =>
            onSubmit({
              valor_prestamo: Number(valor),
              numero_cuotas: Number(cuotas),
              frecuencia_pago: frecuencia,
              credito_id: creditoId,
              fecha_cuota_1: fechaCuota1,
              motivo_solicitud: motivo,
            })
          }
          disabled={!valid || saving}
          className="px-3 py-1.5 rounded-lg bg-[#f4a900] text-white text-xs font-bold hover:bg-[#e68a00] disabled:opacity-50"
        >
          Crear
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  CARGAR CSV TAB                                                     */
/* ================================================================== */

interface CsvUploadResult {
  total_procesados: number;
  actualizados: number;
  creados: number;
  no_encontrados: number;
  errores: { cedula: string; razon: string }[];
}

function CargarCsvTab() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CsvUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/fondo/upload-csv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al procesar el archivo");
      } else {
        setResult(data);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="h-5 w-5 text-[#f4a900]" />
          Cargar Saldos desde CSV
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Sube un archivo CSV con los saldos acumulados de los afiliados. Se conectará por <strong>CEDULA</strong> y se actualizará el campo <strong>ACUMULADO</strong> (90% permanente, 10% social).
        </p>
      </div>

      {/* Format info */}
      <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
        <p className="font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4" />
          Formato del archivo
        </p>
        <ul className="text-blue-800 space-y-1 list-disc list-inside text-xs">
          <li>Separador: <code className="bg-white px-1.5 py-0.5 rounded">;</code> (punto y coma)</li>
          <li>Codificación: UTF-8</li>
          <li>Columnas requeridas: <code className="bg-white px-1.5 py-0.5 rounded">CEDULA</code>, <code className="bg-white px-1.5 py-0.5 rounded">ACUMULADO</code></li>
          <li>Otras columnas son opcionales (NOMBRE, AHORROS, CARTERA, etc.) y serán ignoradas por ahora</li>
          <li>Si el usuario ya está afiliado, se actualizan sus saldos. Si no, se crea su afiliación.</li>
        </ul>
      </div>

      {/* Upload area */}
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-[#f4a900] transition-colors">
        <input
          type="file"
          id="csv-file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
        />
        <label htmlFor="csv-file" className="cursor-pointer flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-[#f4a900]/10 rounded-2xl flex items-center justify-center">
            <Wallet className="h-8 w-8 text-[#f4a900]" />
          </div>
          <div>
            <p className="font-bold text-gray-900">{file ? file.name : "Selecciona un archivo CSV"}</p>
            <p className="text-xs text-gray-500 mt-1">{file ? `${(file.size / 1024).toFixed(1)} KB` : "Click para seleccionar"}</p>
          </div>
        </label>
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#f4a900] text-black font-bold rounded-xl hover:bg-[#f4a900] active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#f4a900]/30"
      >
        {uploading ? (
          <>
            <div className="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full" />
            Procesando...
          </>
        ) : (
          <>
            <Send className="h-5 w-5" />
            Cargar y Procesar
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-xs text-blue-700 font-semibold uppercase">Procesados</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{result.total_procesados}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-xs text-emerald-700 font-semibold uppercase">Actualizados</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{result.actualizados}</p>
            </div>
            <div className="bg-[#f4a900]/10 border border-[#f4a900]/30 rounded-xl p-4 text-center">
              <p className="text-xs text-[#f4a900] font-semibold uppercase">Creados</p>
              <p className="text-2xl font-bold text-orange-900 mt-1">{result.creados}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-xs text-red-700 font-semibold uppercase">No encontrados</p>
              <p className="text-2xl font-bold text-red-900 mt-1">{result.no_encontrados}</p>
            </div>
          </div>

          {result.errores && result.errores.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                Cédulas no encontradas {result.errores.length >= 50 && "(primeras 50)"}
              </p>
              <div className="max-h-60 overflow-y-auto bg-white rounded-lg border border-amber-200">
                <ul className="text-xs divide-y divide-amber-100">
                  {result.errores.map((e, i) => (
                    <li key={i} className="px-3 py-2">
                      <span className="font-mono font-bold text-gray-700">{e.cedula}</span>
                      <span className="text-gray-500 ml-2">— {e.razon}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  SOLICITUDES TAB — pending credit requests + retiros                */
/* ================================================================== */

interface PendingCredito {
  _id: string;
  user_id: string;
  valor_prestamo: number;
  numero_cuotas: number;
  tasa_interes: number;
  saldo_total: number;
  frecuencia_pago?: "quincenal" | "mensual";
  motivo_solicitud?: string | null;
  fecha_solicitud: string;
  estado: string;
}

interface PendingRetiro {
  _id: string;
  user_id: string;
  nombre: string;
  cedula: string;
  monto: number;
  motivo?: string | null;
  fecha_solicitud: string;
  estado: string;
}

interface UserLite {
  _id: string;
  nombre: string;
  cedula: string;
}

function SolicitudesTab() {
  const [pendingCreditos, setPendingCreditos] = useState<PendingCredito[]>([]);
  const [pendingRetiros, setPendingRetiros] = useState<PendingRetiro[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserLite>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Manual creation — pick a user, then open SolicitudCreditoForm in
  // fondoMode. All the line/garantías/codeudores/documentos detail the
  // self-service flow captures, fondo captures too.
  const [showManual, setShowManual] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<UserLite[]>([]);
  const [manualUser, setManualUser] = useState<UserLite | null>(null);
  const [manualPrefill, setManualPrefill] = useState<Record<string, unknown> | null>(null);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Bulk credit upload
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    total_en_archivo: number;
    creados: number;
    actualizados: number;
    no_encontrados: number;
    cedulas_no_encontradas: string[];
    detalle: { credit_id: string; cedula: string; name: string; action: string; valor_prestamo?: number; saldo?: number }[];
  } | null>(null);
  const [bulkError, setBulkError] = useState("");

  const handleBulkUpload = async (file: File) => {
    setBulkUploading(true);
    setBulkError("");
    setBulkResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/fondo/credits/bulk-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al subir el PDF");
      setBulkResult(data);
      await loadAll();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBulkUploading(false);
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cRes, rRes, uRes] = await Promise.all([
        fetch("/api/fondo/cartera?estado=pendiente"),
        fetch("/api/fondo/retiros?estado=pendiente"),
        fetch("/api/fondo/members"),
      ]);

      const credArr: PendingCredito[] = cRes.ok ? await cRes.json() : [];
      const retArr: PendingRetiro[] = rRes.ok ? await rRes.json() : [];
      const members: { user_id: string; nombre: string; cedula: string }[] = uRes.ok ? await uRes.json() : [];

      setPendingCreditos(credArr);
      setPendingRetiros(retArr);

      // Build user lookup
      const map: Record<string, UserLite> = {};
      for (const m of members) {
        map[m.user_id] = { _id: m.user_id, nombre: m.nombre, cedula: m.cedula };
      }
      setUserMap(map);
    } catch {
      setError("Error al cargar las solicitudes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAprobarCredito = async (
    id: string,
    opts: { fecha_desembolso: string; fecha_cuota_1: string; credito_id?: string },
  ) => {
    setProcessingId(id);
    try {
      const res = await fetch("/api/fondo/cartera", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartera_id: id, action: "aprobar", ...opts }),
      });
      if (res.ok) await loadAll();
      else alert(((await res.json().catch(() => ({}))) as { error?: string }).error || "Error al aprobar");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRechazarCredito = async (id: string) => {
    const motivo = prompt("Motivo del rechazo (opcional):") || "";
    setProcessingId(id);
    try {
      const res = await fetch("/api/fondo/cartera", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartera_id: id, action: "rechazar", motivo_respuesta: motivo }),
      });
      if (res.ok) await loadAll();
    } finally {
      setProcessingId(null);
    }
  };

  const handleAprobarRetiro = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch("/api/fondo/retiros", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "aprobar" }),
      });
      if (res.ok) await loadAll();
    } finally {
      setProcessingId(null);
    }
  };

  const handleRechazarRetiro = async (id: string) => {
    const motivo = prompt("Motivo del rechazo (opcional):") || "";
    setProcessingId(id);
    try {
      const res = await fetch("/api/fondo/retiros", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "rechazar", motivo_respuesta: motivo }),
      });
      if (res.ok) await loadAll();
    } finally {
      setProcessingId(null);
    }
  };

  const searchManualUser = async () => {
    if (!manualSearch.trim()) return;
    try {
      const res = await fetch(`/api/fondo/members?search_users=${encodeURIComponent(manualSearch.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setManualResults(Array.isArray(data) ? data.map((u: { id: string; nombre: string; cedula: string }) => ({ _id: u.id, nombre: u.nombre, cedula: u.cedula })) : []);
      }
    } catch {
      // ignore
    }
  };

  // Called after fondo picks a user from the search results. Loads the
  // full user record so we can prefill direccion/barrio/telefono/etc.
  // into the Solicitud form, then opens it.
  const openManualFormFor = async (u: UserLite) => {
    setManualUser(u);
    setManualError(null);
    try {
      const res = await fetch(`/api/users/${u._id}`);
      if (res.ok) setManualPrefill(await res.json());
      else setManualPrefill(null);
    } catch {
      setManualPrefill(null);
    }
    setManualFormOpen(true);
  };

  const submitManualCredito = async (payload: SolicitudPayload) => {
    if (!manualUser) return;
    setManualSubmitting(true);
    setManualError(null);
    try {
      const res = await fetch("/api/fondo/cartera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: manualUser._id, ...payload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || "Error al crear el crédito");
      }
      setManualFormOpen(false);
      setShowManual(false);
      setManualUser(null);
      setManualPrefill(null);
      setManualSearch("");
      setManualResults([]);
      await loadAll();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Error");
    } finally {
      setManualSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-[#f4a900] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* Manual creation — fondo picks a user, then fills the same
          Solicitud de Crédito form the self-service flow uses, plus the
          fondo-only approval fields (fecha_desembolso, fecha_cuota_1,
          credito_id). See SolicitudCreditoForm fondoMode. */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CreditCard size={20} className="text-[#f4a900]" />
            Crear crédito manual
          </h2>
          <button
            onClick={() => setShowManual((v) => !v)}
            className="text-sm font-semibold text-[#f4a900] hover:text-orange-700"
          >
            {showManual ? "Cerrar" : "Crear nuevo"}
          </button>
        </div>
        {showManual && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Busca al afiliado y completa el mismo formulario de solicitud que usan los usuarios.
              Como fondo, además eliges la fecha de desembolso, la primera cuota y el código del crédito;
              el crédito se crea ya <b>activo</b>.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Buscar usuario por nombre o cédula..."
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchManualUser()}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
              />
              <button
                onClick={searchManualUser}
                className="px-4 py-2.5 rounded-xl bg-[#f4a900] text-black font-semibold text-sm hover:bg-[#f4a900]"
              >
                Buscar
              </button>
            </div>
            {manualResults.length > 0 && !manualUser && (
              <div className="border border-gray-200 rounded-xl divide-y max-h-48 overflow-y-auto">
                {manualResults.map((u) => (
                  <button
                    key={u._id}
                    onClick={() => { setManualResults([]); openManualFormFor(u); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm"
                  >
                    <div className="font-medium text-gray-900">{u.nombre}</div>
                    <div className="text-xs text-gray-500">CC: {u.cedula}</div>
                  </button>
                ))}
              </div>
            )}
            {manualUser && !manualFormOpen && (
              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-semibold">{manualUser.nombre}</span>
                  <span className="ml-2 text-gray-500">CC: {manualUser.cedula}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setManualFormOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                  >
                    Abrir formulario
                  </button>
                  <button
                    onClick={() => { setManualUser(null); setManualPrefill(null); }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cambiar
                  </button>
                </div>
              </div>
            )}
            {manualError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{manualError}</div>
            )}
          </div>
        )}
      </div>

      {/* Fondo-mode SolicitudCreditoForm — same schema as the self-service
          form but with approval-date fields and relaxed signature rules. */}
      {manualUser && (
        <SolicitudCreditoForm
          open={manualFormOpen}
          onClose={() => setManualFormOpen(false)}
          fondoMode
          submitting={manualSubmitting}
          error={manualError}
          prefill={{
            nombres: String(manualPrefill?.nombre || manualUser.nombre || ""),
            cedula: String(manualPrefill?.cedula || manualUser.cedula || ""),
            empresa: String(manualPrefill?.empresa || "Merquellantas"),
            seccion: String(manualPrefill?.departamento || manualPrefill?.centro_costo || ""),
            cargo: String(manualPrefill?.cargo_empleado || ""),
            direccion_residencia: String(manualPrefill?.direccion || ""),
            barrio: String(manualPrefill?.barrio || ""),
            telefono_fijo: String(manualPrefill?.telefono || ""),
            celular: String(manualPrefill?.movil || ""),
            ciudad: String(manualPrefill?.ciudad || ""),
          }}
          onSubmit={submitManualCredito}
        />
      )}


      {/* Bulk credit upload */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-3">
          <FileText size={18} className="text-[#f4a900]" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Carga masiva de créditos (PDF)</p>
            <p className="text-xs text-gray-500">Sube el archivo de reporte de créditos (Excel o PDF) para crear o actualizar créditos de todos los usuarios.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 cursor-pointer hover:border-[#f4a900]/40 hover:text-[#f4a900] transition-all">
            <Upload size={16} />
            {bulkUploading ? "Procesando..." : "Seleccionar archivo (Excel/PDF)"}
            <input
              type="file"
              accept=".xlsx,.xls,.pdf"
              className="hidden"
              disabled={bulkUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleBulkUpload(f);
                e.target.value = "";
              }}
            />
          </label>
          {bulkUploading && <div className="animate-spin h-5 w-5 border-2 border-[#f4a900] border-t-transparent rounded-full" />}
        </div>

        {bulkError && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle size={14} /> {bulkError}
          </div>
        )}

        {bulkResult && (
          <div className="mt-3 space-y-3">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
              <p className="font-semibold text-emerald-800 mb-2">Créditos procesados correctamente</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
                  <p className="text-lg font-bold text-gray-900">{bulkResult.total_en_archivo}</p>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">En PDF</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
                  <p className="text-lg font-bold text-emerald-700">{bulkResult.creados}</p>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">Creados</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
                  <p className="text-lg font-bold text-blue-700">{bulkResult.actualizados}</p>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">Actualizados</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
                  <p className="text-lg font-bold text-amber-700">{bulkResult.no_encontrados}</p>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">No encontrados</p>
                </div>
              </div>
              {bulkResult.cedulas_no_encontradas.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Cédulas no encontradas: {bulkResult.cedulas_no_encontradas.join(", ")}
                </p>
              )}
            </div>

            {bulkResult.detalle.length > 0 && (
              <details>
                <summary className="text-xs text-gray-500 cursor-pointer font-semibold">Ver detalle ({bulkResult.detalle.length} créditos)</summary>
                <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase">
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Cédula</th>
                        <th className="px-3 py-2">Nombre</th>
                        <th className="px-3 py-2 text-right">Préstamo</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                        <th className="px-3 py-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bulkResult.detalle.map((d, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-mono font-semibold text-gray-700">{d.credit_id}</td>
                          <td className="px-3 py-1.5 text-gray-600">{d.cedula}</td>
                          <td className="px-3 py-1.5 text-gray-600 truncate max-w-[150px]">{d.name}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-700">{d.valor_prestamo ? fmt(d.valor_prestamo) : "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-500">{d.saldo ? fmt(d.saldo) : "—"}</td>
                          <td className="px-3 py-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${d.action === "creado" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                              {d.action}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Pending credit requests */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CreditCard size={20} className="text-[#f4a900]" />
            Solicitudes de Crédito ({pendingCreditos.length})
          </h2>
        </div>
        {pendingCreditos.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No hay solicitudes de crédito pendientes.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingCreditos.map((c) => (
              <PendingCreditoCard
                key={c._id}
                credito={c}
                user={userMap[c.user_id]}
                processing={processingId === c._id}
                onApprove={(opts) => handleAprobarCredito(c._id, opts)}
                onReject={() => handleRechazarCredito(c._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pending retiros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Wallet size={20} className="text-emerald-600" />
            Solicitudes de Retiro ({pendingRetiros.length})
          </h2>
        </div>
        {pendingRetiros.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No hay solicitudes de retiro pendientes.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingRetiros.map((r) => (
              <div key={r._id} className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-bold text-gray-900">{r.nombre}</p>
                    <p className="text-xs text-gray-500">CC: {r.cedula}</p>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(r.fecha_solicitud).toLocaleDateString("es-CO")}</span>
                </div>
                <div className="mb-3">
                  <p className="text-xs text-gray-500">Monto a retirar</p>
                  <p className="text-2xl font-bold text-emerald-700">{fmt(r.monto)}</p>
                </div>
                {r.motivo && (
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                    <span className="font-semibold text-xs uppercase text-gray-500">Motivo: </span>
                    {r.motivo}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAprobarRetiro(r._id)}
                    disabled={processingId === r._id}
                    className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    <Check size={16} /> Aprobar
                  </button>
                  <button
                    onClick={() => handleRechazarRetiro(r._id)}
                    disabled={processingId === r._id}
                    className="flex-1 px-4 py-2 rounded-xl bg-red-100 text-red-700 font-semibold text-sm hover:bg-red-200 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    <X size={16} /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PendingCreditoCard — inline approval form                          */
/* ------------------------------------------------------------------ */

function PendingCreditoCard({
  credito,
  user,
  processing,
  onApprove,
  onReject,
}: {
  credito: PendingCredito;
  user: UserLite | undefined;
  processing: boolean;
  onApprove: (opts: { fecha_desembolso: string; fecha_cuota_1: string; credito_id?: string }) => void;
  onReject: () => void;
}) {
  // Inline approval drawer. The fondo user picks the disbursement date +
  // first cuota date (used to build the amortization schedule server-side),
  // optionally a credit code, then confirms. Sensible defaults: disbursement
  // is today, first cuota is today + one period.
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultCuota1 = (() => {
    const d = new Date();
    const daysPerCuota = credito.frecuencia_pago === "quincenal" ? 15 : 30;
    d.setDate(d.getDate() + daysPerCuota);
    return d.toISOString().slice(0, 10);
  })();
  const [approving, setApproving] = useState(false);
  const [fechaDesembolso, setFechaDesembolso] = useState(todayIso);
  const [fechaCuota1, setFechaCuota1] = useState(defaultCuota1);
  const [creditoId, setCreditoId] = useState("");

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="font-bold text-gray-900">{user?.nombre || "Usuario no encontrado"}</p>
          {user && <p className="text-xs text-gray-500">CC: {user.cedula}</p>}
        </div>
        <span className="text-xs text-gray-400">
          {new Date(credito.fecha_solicitud).toLocaleDateString("es-CO")}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-500">Valor</p>
          <p className="font-semibold text-gray-900">{fmt(credito.valor_prestamo)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Cuotas</p>
          <p className="font-semibold text-gray-900">
            {credito.numero_cuotas} · {credito.frecuencia_pago === "quincenal" ? "quincenal" : "mensual"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Tasa</p>
          <p className="font-semibold text-gray-900">{credito.tasa_interes}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total a pagar</p>
          <p className="font-semibold text-gray-900">{fmt(credito.saldo_total)}</p>
        </div>
      </div>
      {credito.motivo_solicitud && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
          <span className="font-semibold text-xs uppercase text-gray-500">Motivo: </span>
          {credito.motivo_solicitud}
        </div>
      )}

      {/* Solicitud PDF download — available on any pending credit */}
      <div className="mb-3">
        <a
          href={`/api/fondo/cartera/${credito._id}/solicitud-pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
        >
          <FileText size={14} /> Descargar solicitud (PDF)
        </a>
      </div>

      {!approving ? (
        <div className="flex gap-2">
          <button
            onClick={() => setApproving(true)}
            disabled={processing}
            className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Check size={16} /> Aprobar
          </button>
          <button
            onClick={onReject}
            disabled={processing}
            className="flex-1 px-4 py-2 rounded-xl bg-red-100 text-red-700 font-semibold text-sm hover:bg-red-200 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <X size={16} /> Rechazar
          </button>
        </div>
      ) : (
        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
          <p className="text-xs font-semibold text-emerald-900">Confirmar aprobación</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                Fecha de desembolso
              </label>
              <input
                type="date"
                value={fechaDesembolso}
                onChange={(e) => setFechaDesembolso(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                Fecha primera cuota
              </label>
              <input
                type="date"
                value={fechaCuota1}
                onChange={(e) => setFechaCuota1(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                Código (opcional)
              </label>
              <input
                type="text"
                value={creditoId}
                onChange={(e) => setCreditoId(e.target.value)}
                placeholder="Ej: CR-2026-001"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setApproving(false)}
              disabled={processing}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              onClick={() => onApprove({
                fecha_desembolso: fechaDesembolso,
                fecha_cuota_1: fechaCuota1,
                credito_id: creditoId.trim() || undefined,
              })}
              disabled={processing || !fechaDesembolso || !fechaCuota1}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {processing ? (
                <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Check size={14} />
              )}
              Confirmar aprobación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
