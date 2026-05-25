"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePollaAuth } from "@/lib/polla/use-polla-auth";

const MERQUE_LOGO =
  "https://www.merquellantas.com/assets/images/logo/Logo-Merquellantas.png";

type AttemptSummary = {
  attempt: number;
  status: "draft" | "complete" | "locked";
  champion: { code: string; name: string } | null;
  updatedAt: string;
  completedAt: string | null;
  groupCount: number;
};

export default function PollaDashboardPage() {
  const { session, logout } = usePollaAuth();
  const [effectiveTotal, setEffectiveTotal] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGift, setShowGift] = useState(false);
  const [giftMode, setGiftMode] = useState<"existing" | "new">("existing");
  const [giftCedula, setGiftCedula] = useState("");
  const [giftName, setGiftName] = useState("");
  const [giftPassword, setGiftPassword] = useState("");
  const [giftEmail, setGiftEmail] = useState("");
  const [giftSending, setGiftSending] = useState(false);
  const [giftResult, setGiftResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/polla/predictions?cedula=${encodeURIComponent(session.cedula)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        setAttempts(data.predictions ?? []);
        if (data.user?.attemptsAllowed != null) {
          setEffectiveTotal(data.user.attemptsAllowed);
        }
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos cargar tus intentos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleGift() {
    if (!session) return;
    setGiftSending(true);
    setGiftResult(null);
    try {
      const body: Record<string, unknown> = {
        giverCedula: session.cedula,
        recipientCedula: giftCedula.trim(),
      };
      if (giftMode === "new") {
        body.createNew = true;
        body.newName = giftName.trim();
        body.newPassword = giftPassword;
        body.newEmail = giftEmail.trim();
      }
      const res = await fetch("/api/polla/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setGiftResult({ success: false, message: data.error || "Error al transferir" });
      } else {
        setGiftResult({
          success: true,
          message: `Intento regalado a ${data.recipient.name}. Ahora tienes ${data.giver.attemptsRemaining} intentos.`,
        });
        // Reload to refresh attempt count
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch {
      setGiftResult({ success: false, message: "Error de conexión" });
    } finally {
      setGiftSending(false);
    }
  }

  function closeGift() {
    setShowGift(false);
    setGiftCedula("");
    setGiftName("");
    setGiftPassword("");
    setGiftEmail("");
    setGiftResult(null);
    setGiftMode("existing");
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[var(--foreground-muted)]">
        Cargando...
      </main>
    );
  }

  const total = effectiveTotal ?? session.attemptsAllowed;
  const filledAttempts = new Map(attempts.map((a) => [a.attempt, a]));
  const rows: AttemptSummary[] = [];
  for (let i = 1; i <= total; i++) {
    rows.push(
      filledAttempts.get(i) ?? {
        attempt: i,
        status: "draft",
        champion: null,
        updatedAt: "",
        completedAt: null,
        groupCount: 0,
      },
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/polla" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-[var(--foreground-soft)] sm:inline">
              {session.name}
            </span>
            <button
              onClick={logout}
              className="rounded-sm border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-[var(--line)] bg-[var(--foreground)] text-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--brand)]">
              Hola, {session.name}
            </p>
            <h1 className="mt-3 text-3xl font-black uppercase leading-tight md:text-5xl">
              Tus boletas de pronóstico
            </h1>
            <p className="mt-3 max-w-xl text-white/70">
              Tienes <span className="font-bold text-white">{total}</span>{" "}
              {total === 1 ? "intento disponible" : "intentos disponibles"}.
              Cada boleta debe completarse antes del inicio del Mundial.
            </p>
            {total > 1 && (
              <button
                type="button"
                onClick={() => setShowGift(true)}
                className="mt-4 inline-flex items-center gap-2 border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                🎁 Regalar un intento
              </button>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12">
          {loading ? (
            <div className="border border-dashed border-[var(--line)] bg-white p-12 text-center text-sm text-[var(--foreground-muted)]">
              Cargando...
            </div>
          ) : error ? (
            <div className="border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] p-6 text-sm text-[var(--brand-dark)]">
              {error}
            </div>
          ) : (
            <ul className="grid gap-4">
              {rows.map((row) => {
                const completed = row.status === "complete" || row.status === "locked";
                return (
                  <li
                    key={row.attempt}
                    className="grid grid-cols-1 items-center gap-4 border border-[var(--line)] bg-white p-6 md:grid-cols-[auto_1fr_auto]"
                  >
                    <div className="flex items-center gap-4">
                      <span className="grid h-14 w-14 place-items-center border border-[var(--foreground)] font-mono text-xl font-black">
                        {row.attempt}
                      </span>
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
                          Boleta · Intento {row.attempt}
                        </p>
                        <p className="mt-1 text-lg font-bold">
                          {row.status === "complete"
                            ? "Pronóstico completo"
                            : row.status === "locked"
                              ? "Pronóstico bloqueado"
                              : row.groupCount > 0
                                ? "Pronóstico en progreso"
                                : "Pronóstico sin iniciar"}
                        </p>
                        {row.champion && (
                          <p className="mt-1 text-sm text-[var(--foreground-soft)]">
                            Tu campeón:{" "}
                            <span className="font-semibold text-[var(--foreground)]">
                              {row.champion.name}
                            </span>
                          </p>
                        )}
                        {!row.champion && row.groupCount > 0 && (
                          <p className="mt-1 text-sm text-[var(--foreground-soft)]">
                            {row.groupCount} partidos de grupos llenados
                          </p>
                        )}
                      </div>
                    </div>
                    <div />
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/polla/tablero/predict/${row.attempt}`}
                        className="inline-flex h-11 items-center justify-center bg-[var(--brand)] px-5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)]"
                      >
                        {completed
                          ? "Editar"
                          : row.groupCount > 0
                            ? "Continuar"
                            : "Comenzar"}
                      </Link>
                      {completed && (
                        <Link
                          href={`/polla/tablero/results/${row.attempt}`}
                          className="inline-flex h-11 items-center justify-center border border-[var(--foreground)] px-5 text-sm font-semibold uppercase tracking-[0.18em] transition hover:bg-[var(--foreground)] hover:text-white"
                        >
                          Ver resultados
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 text-sm text-[var(--foreground-soft)] md:flex-row">
          <span>© {new Date().getFullYear()} · Polla Mundialista Merque</span>
          <span className="text-[var(--foreground-muted)]">
            Beneficio exclusivo para clientes Merquellantas.
          </span>
        </div>
      </footer>

      {showGift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md border border-[var(--line)] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
                  Regalar intento
                </p>
                <h3 className="mt-1 text-xl font-black">
                  Transferir boleta
                </h3>
              </div>
              <button
                type="button"
                onClick={closeGift}
                className="text-2xl leading-none text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                ×
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setGiftMode("existing")}
                className={
                  "flex-1 border px-3 py-2 text-sm font-semibold transition " +
                  (giftMode === "existing"
                    ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                    : "border-[var(--line)] hover:border-[var(--brand)]")
                }
              >
                Usuario existente
              </button>
              <button
                type="button"
                onClick={() => setGiftMode("new")}
                className={
                  "flex-1 border px-3 py-2 text-sm font-semibold transition " +
                  (giftMode === "new"
                    ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                    : "border-[var(--line)] hover:border-[var(--brand)]")
                }
              >
                Crear usuario nuevo
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                  Cédula del destinatario
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={giftCedula}
                  onChange={(e) => setGiftCedula(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ej. 1023456789"
                  className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 font-mono tabular-nums outline-none focus:border-[var(--brand)]"
                />
              </label>

              {giftMode === "new" && (
                <>
                  <label className="block">
                    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                      Nombre completo
                    </span>
                    <input
                      type="text"
                      value={giftName}
                      onChange={(e) => setGiftName(e.target.value)}
                      placeholder="Nombre del nuevo usuario"
                      className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 outline-none focus:border-[var(--brand)]"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                      Contraseña
                    </span>
                    <input
                      type="password"
                      value={giftPassword}
                      onChange={(e) => setGiftPassword(e.target.value)}
                      placeholder="Mínimo 4 caracteres"
                      className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 outline-none focus:border-[var(--brand)]"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                      Correo (opcional)
                    </span>
                    <input
                      type="email"
                      value={giftEmail}
                      onChange={(e) => setGiftEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 outline-none focus:border-[var(--brand)]"
                    />
                  </label>
                </>
              )}
            </div>

            {giftResult && (
              <div
                className={
                  "mt-4 border-l-4 p-3 text-sm " +
                  (giftResult.success
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-red-500 bg-red-50 text-red-800")
                }
              >
                {giftResult.message}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeGift}
                className="flex-1 border border-[var(--line)] py-2.5 text-sm font-semibold transition hover:border-[var(--foreground)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGift}
                disabled={giftSending || !giftCedula.trim() || (giftMode === "new" && (!giftName.trim() || giftPassword.length < 4))}
                className="flex-1 bg-[var(--brand)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {giftSending ? "Transfiriendo..." : "Regalar intento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
