"use client";

/**
 * Digital replacement for the printed "SOLICITUD DE PRÉSTAMO" PDF used by
 * Fonalmerque. Every field on the paper form is captured here, plus a
 * canvas-based e-signature for the deudor and up to two codeudores, so the
 * request can be completed end-to-end from a phone or laptop instead of
 * being printed, filled by hand, and scanned back in.
 *
 * The form POSTs to /api/fondo/cartera; the backend accepts the legacy
 * fields (valor_prestamo, numero_cuotas, etc.) and stores the full
 * structured payload under `solicitud` on the fondo_cartera document.
 */

import React, { useEffect, useRef, useState } from "react";
import { X, CreditCard, PenLine, Trash2, UserPlus, AlertCircle, Check } from "lucide-react";

type LineaCredito = "educativo" | "libre_inversion" | "calamidad" | "otro";
type Frecuencia = "quincenal" | "mensual";
type QuincenaDel = "15" | "30" | "";

interface Codeudor {
  nombre: string;
  cedula: string;
  firma: string; // data URL
}

interface AsociadoInfo {
  primer_apellido: string;
  segundo_apellido: string;
  nombres: string;
  cedula: string;
  empresa: string;
  seccion: string;
  cargo: string;
  antiguedad: string;
  direccion_residencia: string;
  barrio: string;
  telefono_fijo: string;
  celular: string;
  ciudad: string;
}

interface Documentos {
  educativo: { orden_matricula: boolean; recibos_pago: boolean };
  libre_inversion: { compra_promesa: boolean; pignoracion: boolean; reparacion_cotizacion: boolean };
  seguros: { cotizacion_poliza: boolean; soat_tarjeta: boolean };
  calamidad: { facturas_recibos: boolean; certificacion_calamidad: boolean };
}

export interface SolicitudPayload {
  // Legacy fields the backend already knows about
  valor_prestamo: number;
  numero_cuotas: number;
  frecuencia_pago: Frecuencia;
  motivo_solicitud: string | null;
  // Populated in fondoMode — fondo creates credits as `activo` and needs
  // to set these at creation time. The backend's POST /api/fondo/cartera
  // already honours them when session.user.rol === 'fondo'.
  user_id?: string;
  fecha_desembolso?: string;
  fecha_cuota_1?: string;
  credito_id?: string;
  // Full structured Solicitud
  solicitud: {
    fecha_solicitud: string;
    linea_credito: LineaCredito;
    linea_credito_otro_text: string;
    destinacion_credito: string;
    monto_solicitado: number;
    cuota_fija: number;
    cuota_intereses: number;
    frecuencia_pago: Frecuencia;
    quincena_del: QuincenaDel;
    garantias: string[];
    info_asociado: AsociadoInfo;
    codeudores: Codeudor[];
    documentos: Documentos;
    autorizacion_aceptada: boolean;
    firma_deudor: string; // data URL
    observaciones?: string;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: SolicitudPayload) => Promise<void>;
  submitting?: boolean;
  error?: string | null;
  // When true, the form is used by the fondo admin to create an active
  // credit on behalf of a user. Adds fecha_desembolso / fecha_cuota_1 /
  // credito_id fields, relaxes the deudor-signature requirement (fondo
  // can capture it on paper and upload later), and changes the submit
  // label to "Crear crédito".
  fondoMode?: boolean;
  // Prefill for info_asociado
  prefill: Partial<AsociadoInfo>;
}

/* ---------- Signature canvas ---------- */

function SignaturePad({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(!!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
      setHasInk(true);
    } else {
      setHasInk(false);
    }
  }, [value]);

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    if ("touches" in e) e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setHasInk(true);
    onChange(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{label}</label>
        <button
          type="button"
          onClick={clear}
          className="text-[11px] text-red-600 hover:underline"
        >
          Limpiar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={150}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        className="w-full h-32 bg-white border-2 border-dashed border-gray-300 rounded-xl cursor-crosshair touch-none"
        style={{ touchAction: "none" }}
      />
      <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
        {hasInk ? (
          <><Check className="h-3 w-3 text-emerald-600" /> Firmado</>
        ) : (
          <>Dibuja tu firma con el mouse o el dedo</>
        )}
      </p>
    </div>
  );
}

/* ---------- Helpers ---------- */

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(n || 0);
}

// Split a full name into { primer_apellido, segundo_apellido, nombres }
// assuming the Colombian convention: "NOMBRES PRIMER_APELLIDO SEGUNDO_APELLIDO".
// This is a best-effort prefill only — the user can edit every field.
function splitNombre(full: string): { nombres: string; primer_apellido: string; segundo_apellido: string } {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombres: "", primer_apellido: "", segundo_apellido: "" };
  if (parts.length === 1) return { nombres: parts[0], primer_apellido: "", segundo_apellido: "" };
  if (parts.length === 2) return { nombres: parts[0], primer_apellido: parts[1], segundo_apellido: "" };
  if (parts.length === 3) return { nombres: parts[0], primer_apellido: parts[1], segundo_apellido: parts[2] };
  // 4+ words: assume last two are apellidos, rest are nombres.
  const segundo = parts[parts.length - 1];
  const primer = parts[parts.length - 2];
  const nombres = parts.slice(0, parts.length - 2).join(" ");
  return { nombres, primer_apellido: primer, segundo_apellido: segundo };
}

interface AmortRow {
  num: number;
  fecha: Date;
  saldoInicial: number;
  cuota: number;
  interes: number;
  capital: number;
  saldoFinal: number;
}

function computeAmortization(valor: number, cuotas: number, frecuencia: Frecuencia) {
  if (!valor || !cuotas || cuotas <= 0) {
    return { cuotaFija: 0, totalInteres: 0, totalAPagar: 0, tasa: 0, schedule: [] as AmortRow[] };
  }
  const cuotasComoMeses = frecuencia === "quincenal" ? cuotas / 2 : cuotas;
  const tasa = cuotasComoMeses <= 12 ? 1.0 : cuotasComoMeses <= 24 ? 1.2 : 1.3;
  const tasaPorPeriodo = (frecuencia === "quincenal" ? tasa / 2 : tasa) / 100;
  const cuotaFija = tasaPorPeriodo === 0
    ? valor / cuotas
    : valor * (tasaPorPeriodo * Math.pow(1 + tasaPorPeriodo, cuotas)) / (Math.pow(1 + tasaPorPeriodo, cuotas) - 1);

  const today = new Date();
  const daysBetween = frecuencia === "quincenal" ? 15 : 30;
  const schedule: AmortRow[] = [];
  let balance = valor;
  let totalInteres = 0;
  for (let i = 0; i < cuotas; i++) {
    const fecha = new Date(today);
    fecha.setDate(fecha.getDate() + daysBetween * (i + 1));
    const interes = Math.round(balance * tasaPorPeriodo * 100) / 100;
    let pago = Math.round(cuotaFija * 100) / 100;
    let capital = pago - interes;
    if (i === cuotas - 1 || capital > balance) {
      capital = Math.round(balance * 100) / 100;
      pago = capital + interes;
    }
    const saldoFinal = Math.max(0, Math.round((balance - capital) * 100) / 100);
    schedule.push({
      num: i + 1,
      fecha,
      saldoInicial: Math.round(balance * 100) / 100,
      cuota: pago,
      interes,
      capital,
      saldoFinal,
    });
    totalInteres += interes;
    balance = saldoFinal;
  }
  return {
    cuotaFija: Math.round(cuotaFija * 100) / 100,
    totalInteres: Math.round(totalInteres * 100) / 100,
    totalAPagar: Math.round((valor + totalInteres) * 100) / 100,
    tasa,
    schedule,
  };
}

/* ---------- Main form ---------- */

const GARANTIA_OPTIONS: { value: string; label: string }[] = [
  { value: "aportes_ahorros", label: "Aportes y ahorros" },
  { value: "codeudor", label: "Codeudor" },
  { value: "cesantias", label: "Cesantías" },
  { value: "primas", label: "Primas" },
  { value: "hipoteca", label: "Hipoteca" },
];

export default function SolicitudCreditoForm({
  open,
  onClose,
  onSubmit,
  submitting,
  error,
  prefill,
  fondoMode = false,
}: Props) {
  // Línea de crédito
  const [lineaCredito, setLineaCredito] = useState<LineaCredito>("libre_inversion");
  const [lineaOtroText, setLineaOtroText] = useState("");
  const [destinacion, setDestinacion] = useState("");
  // Condiciones
  const [valor, setValor] = useState("");
  const [cuotas, setCuotas] = useState("12");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("mensual");
  const [quincenaDel, setQuincenaDel] = useState<QuincenaDel>("");
  // Garantías
  const [garantias, setGarantias] = useState<Set<string>>(new Set(["aportes_ahorros"]));
  // Info asociado — seeded from prefill on mount
  const seeded = splitNombre(prefill.nombres || "");
  const [info, setInfo] = useState<AsociadoInfo>({
    primer_apellido: prefill.primer_apellido || seeded.primer_apellido,
    segundo_apellido: prefill.segundo_apellido || seeded.segundo_apellido,
    nombres: prefill.nombres || seeded.nombres,
    cedula: prefill.cedula || "",
    empresa: prefill.empresa || "Merquellantas",
    seccion: prefill.seccion || "",
    cargo: prefill.cargo || "",
    antiguedad: prefill.antiguedad || "",
    direccion_residencia: prefill.direccion_residencia || "",
    barrio: prefill.barrio || "",
    telefono_fijo: prefill.telefono_fijo || "",
    celular: prefill.celular || "",
    ciudad: prefill.ciudad || "",
  });
  // Codeudores
  const [codeudores, setCodeudores] = useState<Codeudor[]>([]);
  // Documentos
  const [documentos, setDocumentos] = useState<Documentos>({
    educativo: { orden_matricula: false, recibos_pago: false },
    libre_inversion: { compra_promesa: false, pignoracion: false, reparacion_cotizacion: false },
    seguros: { cotizacion_poliza: false, soat_tarjeta: false },
    calamidad: { facturas_recibos: false, certificacion_calamidad: false },
  });
  // Observaciones libres
  const [observaciones, setObservaciones] = useState("");
  // Firma + autorización
  const [firmaDeudor, setFirmaDeudor] = useState("");
  const [autorizacion, setAutorizacion] = useState(false);
  // Fondo-only approval fields. Sensible defaults: disbursement today,
  // first cuota today + one period.
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultCuota1Iso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();
  const [fechaDesembolso, setFechaDesembolso] = useState(todayIso);
  const [fechaCuota1, setFechaCuota1] = useState(defaultCuota1Iso);
  const [creditoCode, setCreditoCode] = useState("");
  // Local error for validation
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  const valorN = Number(valor) || 0;
  const cuotasN = Math.max(1, Math.min(120, Number(cuotas) || 0));
  const amort = computeAmortization(valorN, cuotasN, frecuencia);
  const cuotaIntereses = amort.totalInteres;

  const toggleGarantia = (v: string) => {
    setGarantias((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };

  const updateDocumentos = <K extends keyof Documentos>(group: K, field: keyof Documentos[K], val: boolean) => {
    setDocumentos((prev) => ({
      ...prev,
      [group]: { ...prev[group], [field]: val },
    }));
  };

  const validate = (): string | null => {
    if (!valorN || valorN <= 0) return "Ingresa un monto válido.";
    if (!cuotasN || cuotasN < 1) return "Ingresa el número de cuotas.";
    if (!destinacion.trim()) return "Describe la destinación del crédito.";
    if (lineaCredito === "otro" && !lineaOtroText.trim()) return "Especifica la línea de crédito 'Otro'.";
    if (garantias.size === 0) return "Selecciona al menos una garantía.";
    if (!info.primer_apellido.trim() || !info.nombres.trim() || !info.cedula.trim()) {
      return "Completa apellidos, nombres y cédula.";
    }
    if (!autorizacion) return "Debes aceptar la autorización para continuar.";
    // In fondoMode firmas are optional — the admin may capture them on
    // paper and scan later. For self-service solicitudes they're still
    // required evidence that the user consented.
    if (!fondoMode && !firmaDeudor) return "Firma como deudor antes de enviar.";
    for (const c of codeudores) {
      if (!c.nombre.trim() || !c.cedula.trim()) return "Completa nombre y cédula de cada codeudor.";
      if (!fondoMode && !c.firma) return "Cada codeudor debe firmar.";
    }
    if (fondoMode) {
      if (!fechaDesembolso) return "Ingresa la fecha de desembolso.";
      if (!fechaCuota1) return "Ingresa la fecha de la primera cuota.";
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    const payload: SolicitudPayload = {
      valor_prestamo: valorN,
      numero_cuotas: cuotasN,
      frecuencia_pago: frecuencia,
      motivo_solicitud: destinacion || null,
      ...(fondoMode
        ? {
            fecha_desembolso: fechaDesembolso,
            fecha_cuota_1: fechaCuota1,
            credito_id: creditoCode.trim() || undefined,
          }
        : {}),
      solicitud: {
        fecha_solicitud: new Date().toISOString(),
        linea_credito: lineaCredito,
        linea_credito_otro_text: lineaOtroText,
        destinacion_credito: destinacion,
        monto_solicitado: valorN,
        cuota_fija: amort.cuotaFija,
        cuota_intereses: cuotaIntereses,
        frecuencia_pago: frecuencia,
        quincena_del: frecuencia === "quincenal" ? quincenaDel : "",
        garantias: Array.from(garantias),
        info_asociado: info,
        codeudores,
        documentos,
        autorizacion_aceptada: autorizacion,
        firma_deudor: firmaDeudor,
        observaciones: observaciones.trim() || undefined,
      },
    };
    await onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#f4a900]" />
            Solicitud de Crédito
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          {/* 1. Línea de crédito */}
          <Section title="1. Línea de crédito solicitada">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { v: "educativo", l: "Educativo" },
                { v: "libre_inversion", l: "Libre inversión" },
                { v: "calamidad", l: "Calamidad" },
                { v: "otro", l: "Otro" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setLineaCredito(opt.v as LineaCredito)}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-semibold transition ${
                    lineaCredito === opt.v
                      ? "border-[#f4a900] bg-orange-50 text-orange-900"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            {lineaCredito === "otro" && (
              <input
                type="text"
                value={lineaOtroText}
                onChange={(e) => setLineaOtroText(e.target.value)}
                placeholder="Especifica..."
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
              />
            )}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Destinación del crédito</label>
              <textarea
                value={destinacion}
                onChange={(e) => setDestinacion(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 resize-y"
                placeholder="¿Para qué necesitas el crédito?"
              />
            </div>
          </Section>

          {/* 2. Condiciones del crédito */}
          <Section title="2. Condiciones">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Monto solicitado ($)">
                <input
                  type="number"
                  min={1}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
                  placeholder="Ej: 5000000"
                />
              </Field>
              <Field label="Número de cuotas (1-120)">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={cuotas}
                  onChange={(e) => setCuotas(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
                />
              </Field>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Frecuencia de pago">
                <div className="grid grid-cols-2 gap-2">
                  {(["quincenal", "mensual"] as Frecuencia[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrecuencia(f)}
                      className={`px-3 py-2 rounded-xl border-2 text-xs font-semibold transition ${
                        frecuencia === f
                          ? "border-[#f4a900] bg-orange-50 text-orange-900"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {f === "quincenal" ? "Quincenal (15 días)" : "Mensual (30 días)"}
                    </button>
                  ))}
                </div>
              </Field>
              {frecuencia === "mensual" && (
                <Field label="Quincena del">
                  <div className="grid grid-cols-2 gap-2">
                    {(["15", "30"] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuincenaDel(q)}
                        className={`px-3 py-2 rounded-xl border-2 text-xs font-semibold transition ${
                          quincenaDel === q
                            ? "border-[#f4a900] bg-orange-50 text-orange-900"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </div>

            {/* Summary */}
            {valorN > 0 && cuotasN > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 p-3 rounded-xl bg-orange-50 border border-orange-100">
                <Stat label="Tasa" value={`${amort.tasa}% mensual`} />
                <Stat label="Total a pagar" value={fmtCurrency(amort.totalAPagar)} />
              </div>
            )}

            {/* Tabla de amortización — informational. The real dates get set
                by the fondo admin on approval. We show the schedule here so
                the user sees exactly how each payment breaks down before
                committing. */}
            {valorN > 0 && cuotasN > 0 && (
              <details className="mt-3 rounded-xl border border-gray-200 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-700 select-none flex items-center justify-between">
                  <span>Ver tabla de amortización ({cuotasN} cuotas)</span>
                  <span className="text-[10px] font-normal text-gray-400">las fechas finales las define el fondo al aprobar</span>
                </summary>
                <div className="max-h-64 overflow-y-auto border-t border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2 text-right">Saldo inicial</th>
                        <th className="px-3 py-2 text-right">Cuota</th>
                        <th className="px-3 py-2 text-right">Interés</th>
                        <th className="px-3 py-2 text-right">Capital</th>
                        <th className="px-3 py-2 text-right">Saldo final</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {amort.schedule.map((row) => (
                        <tr key={row.num} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-700">{row.num}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-600">{fmtCurrency(row.saldoInicial)}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-900">{fmtCurrency(row.cuota)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-700">{fmtCurrency(row.interes)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-700">{fmtCurrency(row.capital)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-500">{fmtCurrency(row.saldoFinal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </Section>

          {/* 3. Garantías */}
          <Section title="3. Garantías (selecciona una o más)">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GARANTIA_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-semibold cursor-pointer transition ${
                    garantias.has(opt.value)
                      ? "border-[#f4a900] bg-orange-50 text-orange-900"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={garantias.has(opt.value)}
                    onChange={() => toggleGarantia(opt.value)}
                    className="accent-[#f4a900]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </Section>

          {/* 4. Información del asociado */}
          <Section title="4. Información del asociado">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="1er apellido">
                <TextInput value={info.primer_apellido} onChange={(v) => setInfo({ ...info, primer_apellido: v })} />
              </Field>
              <Field label="2° apellido">
                <TextInput value={info.segundo_apellido} onChange={(v) => setInfo({ ...info, segundo_apellido: v })} />
              </Field>
              <Field label="Nombres">
                <TextInput value={info.nombres} onChange={(v) => setInfo({ ...info, nombres: v })} />
              </Field>
              <Field label="C.C. N°">
                <TextInput value={info.cedula} onChange={(v) => setInfo({ ...info, cedula: v })} />
              </Field>
              <Field label="Empresa">
                <TextInput value={info.empresa} onChange={(v) => setInfo({ ...info, empresa: v })} />
              </Field>
              <Field label="Sección">
                <TextInput value={info.seccion} onChange={(v) => setInfo({ ...info, seccion: v })} />
              </Field>
              <Field label="Cargo">
                <TextInput value={info.cargo} onChange={(v) => setInfo({ ...info, cargo: v })} />
              </Field>
              <Field label="Antigüedad">
                <TextInput value={info.antiguedad} onChange={(v) => setInfo({ ...info, antiguedad: v })} />
              </Field>
              <Field label="Ciudad">
                <TextInput value={info.ciudad} onChange={(v) => setInfo({ ...info, ciudad: v })} />
              </Field>
              <Field label="Dirección residencia" className="sm:col-span-2">
                <TextInput value={info.direccion_residencia} onChange={(v) => setInfo({ ...info, direccion_residencia: v })} />
              </Field>
              <Field label="Barrio">
                <TextInput value={info.barrio} onChange={(v) => setInfo({ ...info, barrio: v })} />
              </Field>
              <Field label="Teléfono fijo">
                <TextInput value={info.telefono_fijo} onChange={(v) => setInfo({ ...info, telefono_fijo: v })} />
              </Field>
              <Field label="Celular">
                <TextInput value={info.celular} onChange={(v) => setInfo({ ...info, celular: v })} />
              </Field>
            </div>
          </Section>

          {/* 5. Codeudores */}
          <Section
            title="5. Codeudores"
            right={
              codeudores.length < 2 ? (
                <button
                  type="button"
                  onClick={() => setCodeudores([...codeudores, { nombre: "", cedula: "", firma: "" }])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f4a900]/10 text-[#9a6b00] border border-[#f4a900]/30 text-xs font-semibold hover:bg-[#f4a900]/20"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Agregar codeudor
                </button>
              ) : null
            }
          >
            {codeudores.length === 0 ? (
              <p className="text-xs text-gray-500">
                Si tu garantía es &quot;Codeudor&quot;, agrega al menos uno. Hasta 2 codeudores.
              </p>
            ) : (
              <div className="space-y-3">
                {codeudores.map((c, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">Codeudor {idx + 1}</p>
                      <button
                        type="button"
                        onClick={() => setCodeudores(codeudores.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <TextInput
                        placeholder="Nombre completo"
                        value={c.nombre}
                        onChange={(v) => {
                          const next = [...codeudores];
                          next[idx] = { ...c, nombre: v };
                          setCodeudores(next);
                        }}
                      />
                      <TextInput
                        placeholder="Cédula"
                        value={c.cedula}
                        onChange={(v) => {
                          const next = [...codeudores];
                          next[idx] = { ...c, cedula: v };
                          setCodeudores(next);
                        }}
                      />
                    </div>
                    <SignaturePad
                      label={`Firma codeudor ${idx + 1}`}
                      value={c.firma}
                      onChange={(v) => {
                        const next = [...codeudores];
                        next[idx] = { ...c, firma: v };
                        setCodeudores(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 6. Documentos adjuntos (conditional) */}
          <Section title="6. Documentos adjuntos">
            <p className="text-[11px] text-gray-500 mb-2">
              Marca los documentos que adjuntarás según la línea de crédito.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DocGroup title="Educativo">
                <CheckItem
                  checked={documentos.educativo.orden_matricula}
                  onChange={(v) => updateDocumentos("educativo", "orden_matricula", v)}
                  label="Orden de matrícula"
                />
                <CheckItem
                  checked={documentos.educativo.recibos_pago}
                  onChange={(v) => updateDocumentos("educativo", "recibos_pago", v)}
                  label="Recibos de pago"
                />
              </DocGroup>
              <DocGroup title="Libre inversión (vehículo)">
                <CheckItem
                  checked={documentos.libre_inversion.compra_promesa}
                  onChange={(v) => updateDocumentos("libre_inversion", "compra_promesa", v)}
                  label="Compra: promesa de compraventa"
                />
                <CheckItem
                  checked={documentos.libre_inversion.pignoracion}
                  onChange={(v) => updateDocumentos("libre_inversion", "pignoracion", v)}
                  label="Pignoración"
                />
                <CheckItem
                  checked={documentos.libre_inversion.reparacion_cotizacion}
                  onChange={(v) => updateDocumentos("libre_inversion", "reparacion_cotizacion", v)}
                  label="Reparación: cotización"
                />
              </DocGroup>
              <DocGroup title="Seguros">
                <CheckItem
                  checked={documentos.seguros.cotizacion_poliza}
                  onChange={(v) => updateDocumentos("seguros", "cotizacion_poliza", v)}
                  label="Cotización póliza"
                />
                <CheckItem
                  checked={documentos.seguros.soat_tarjeta}
                  onChange={(v) => updateDocumentos("seguros", "soat_tarjeta", v)}
                  label="SOAT / Tarjeta de propiedad"
                />
              </DocGroup>
              <DocGroup title="Calamidad">
                <CheckItem
                  checked={documentos.calamidad.facturas_recibos}
                  onChange={(v) => updateDocumentos("calamidad", "facturas_recibos", v)}
                  label="Facturas o recibos de pago"
                />
                <CheckItem
                  checked={documentos.calamidad.certificacion_calamidad}
                  onChange={(v) => updateDocumentos("calamidad", "certificacion_calamidad", v)}
                  label="Certificación calamidad"
                />
              </DocGroup>
            </div>
          </Section>

          {/* fondo-only: approval dates + credit code. Shown before the
              autorización so the admin sees it set up for activo state. */}
          {fondoMode && (
            <Section title="Datos de aprobación (solo fondo)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Fecha de desembolso">
                  <input
                    type="date"
                    value={fechaDesembolso}
                    onChange={(e) => setFechaDesembolso(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
                  />
                </Field>
                <Field label="Fecha primera cuota">
                  <input
                    type="date"
                    value={fechaCuota1}
                    onChange={(e) => setFechaCuota1(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40"
                  />
                </Field>
                <Field label="Código del crédito (opcional)">
                  <TextInput
                    value={creditoCode}
                    onChange={setCreditoCode}
                    placeholder="Ej: CR-2026-001"
                  />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                El crédito se creará en estado <b>activo</b> y el usuario lo verá inmediatamente en su cartera.
              </p>
            </Section>
          )}

          {/* 7. Autorización + Firma */}
          <Section title="7. Autorización y firma">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-[11px] text-gray-600 leading-relaxed max-h-36 overflow-y-auto">
              Autorizamos de manera irrevocable para que con fines estadísticos, de control,
              supervisión e información comercial, <b>Fonalmerque</b> reporte a la central de
              información de la Asociación Bancaria y de entidades financieras de Colombia
              el nacimiento, modificación y extinción de las obligaciones contraídas con
              Fonalmerque. La presente autorización comprende además el reporte de información
              sobre deudas vencidas y/o la utilización indebida de los servicios financieros.
              Declaramos también que conocemos y aceptamos los reglamentos de <b>Fonalmerque</b>.
              Adjuntamos pagaré en blanco firmado y libranza firmada por el asociado y el
              pagador.
            </div>
            <label className="mt-2 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autorizacion}
                onChange={(e) => setAutorizacion(e.target.checked)}
                className="mt-0.5 accent-[#f4a900]"
              />
              <span className="text-xs text-gray-700">
                He leído y acepto la autorización y los reglamentos de Fonalmerque.
              </span>
            </label>

            <div className="mt-4">
              <SignaturePad
                label={<><PenLine className="inline h-3 w-3 mr-1" />Firma del deudor</>}
                value={firmaDeudor}
                onChange={setFirmaDeudor}
              />
            </div>
          </Section>

          {/* 8. Observaciones */}
          <Section title="8. Observaciones">
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 resize-y"
              placeholder="Quiero empezar a pagar tal fecha, o cualquier comentario adicional..."
            />
          </Section>

          {(localError || error) && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {localError || error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 font-medium text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-[#f4a900] text-white font-semibold text-sm shadow-md shadow-[#f4a900]/25 hover:bg-[#e68a00] disabled:opacity-50"
          >
            {submitting
              ? fondoMode ? "Creando..." : "Enviando..."
              : fondoMode ? "Crear crédito" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small presentational helpers ---------- */

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold text-gray-900">{title}</h4>
        {right}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900]/40 focus:border-[#f4a900]"
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-orange-700 uppercase">{label}</p>
      <p className="text-xs font-bold text-gray-900">{value}</p>
    </div>
  );
}

function DocGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl border border-gray-200 bg-white">
      <p className="text-xs font-semibold text-gray-800 mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function CheckItem({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[#f4a900]"
      />
      {label}
    </label>
  );
}
