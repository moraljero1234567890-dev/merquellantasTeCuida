"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearPollaSession, readPollaSession, type PollaSession } from "@/lib/polla/session";

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
  const router = useRouter();
  const [session, setSession] = useState<PollaSession | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = readPollaSession();
    if (!s) {
      router.replace("/polla/login");
      return;
    }
    setSession(s);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/polla/predictions?cedula=${encodeURIComponent(session.cedula)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        setAttempts(data.predictions ?? []);
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

  function handleLogout() {
    clearPollaSession();
    router.replace("/polla/login");
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[var(--foreground-muted)]">
        Cargando...
      </main>
    );
  }

  const total = session.attemptsAllowed;
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
              onClick={handleLogout}
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
    </div>
  );
}
