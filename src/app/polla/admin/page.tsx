"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const MERQUE_LOGO =
  "https://www.merquellantas.com/assets/images/logo/Logo-Merquellantas.png";

const TOKEN_KEY = "polla:admin-token";

type AdminUser = {
  cedula: string;
  email: string;
  name: string;
  attemptsAllowed: number;
  createdAt: string | Date;
};

type LeaderboardRow = {
  email: string;
  name: string;
  attempt: number;
  attemptsAllowed: number;
  totalAttempts: number;
  breakdown: {
    group: {
      outcomes: number;
      exact: number;
      uniqueExact: number;
      points: number;
    };
    knockout: {
      r16: number;
      qf: number;
      sf: number;
      runnerUp: number;
      champion: number;
      points: number;
    };
    total: number;
  };
};

type LeaderboardStats = {
  totalUsers: number;
  totalPredictions: number;
  finishedGroupMatches: number;
  finishedKnockoutMatches: number;
};

type Banner = { kind: "ok" | "err"; text: string } | null;

export default function PollaAdminPage() {
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const [cedula, setCedula] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [attempts, setAttempts] = useState("10");
  const [creating, setCreating] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardStats, setLeaderboardStats] =
    useState<LeaderboardStats | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(TOKEN_KEY) ?? "";
    setToken(saved);
    setSavedToken(saved);
  }, []);

  const loadUsers = useCallback(
    async (t: string) => {
      if (!t) {
        setUsers([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/polla/admin/users", {
          headers: { authorization: `Bearer ${t}` },
        });
        if (res.status === 401) {
          setBanner({ kind: "err", text: "Token rechazado. Revisa POLLA_ADMIN_TOKEN en las variables de entorno." });
          setUsers([]);
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setBanner({
            kind: "err",
            text: data.detail ?? data.error ?? `Error ${res.status}`,
          });
          setUsers([]);
          return;
        }
        const data = (await res.json()) as { users: AdminUser[] };
        setUsers(data.users);
        setBanner(null);
      } catch (err) {
        setBanner({
          kind: "err",
          text: err instanceof Error ? err.message : "Error desconocido",
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadLeaderboard = useCallback(async (t: string) => {
    if (!t) {
      setLeaderboard([]);
      setLeaderboardStats(null);
      return;
    }
    setLeaderboardLoading(true);
    try {
      const res = await fetch("/api/polla/admin/leaderboard", {
        headers: { authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        setLeaderboard([]);
        setLeaderboardStats(null);
        return;
      }
      const data = (await res.json()) as {
        rows: LeaderboardRow[];
        stats: LeaderboardStats;
      };
      setLeaderboard(data.rows);
      setLeaderboardStats(data.stats);
    } catch {
      setLeaderboard([]);
      setLeaderboardStats(null);
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (savedToken) {
      void loadUsers(savedToken);
      void loadLeaderboard(savedToken);
    }
  }, [savedToken, loadUsers, loadLeaderboard]);

  function handleSaveToken(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    window.localStorage.setItem(TOKEN_KEY, token);
    setSavedToken(token);
  }

  function handleClearToken() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setSavedToken("");
    setUsers([]);
    setLeaderboard([]);
    setLeaderboardStats(null);
    setBanner(null);
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!savedToken) {
      setBanner({ kind: "err", text: "Guarda primero tu token de admin." });
      return;
    }
    const cleanCedula = cedula.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPassword = password;
    const n = Number(attempts);
    if (!cleanCedula || cleanCedula.length < 4) {
      setBanner({ kind: "err", text: "La cedula debe tener al menos 4 caracteres." });
      return;
    }
    if (!cleanName) {
      setBanner({ kind: "err", text: "El nombre es obligatorio." });
      return;
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      setBanner({ kind: "err", text: "La contraseña debe tener al menos 4 caracteres." });
      return;
    }
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      setBanner({ kind: "err", text: "Intentos: entre 1 y 20." });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/polla/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${savedToken}`,
        },
        body: JSON.stringify({
          cedula: cleanCedula,
          email: cleanEmail,
          name: cleanName,
          password: cleanPassword,
          attemptsAllowed: n,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          kind: "err",
          text: data.detail ?? data.error ?? `Error ${res.status}`,
        });
        return;
      }
      setBanner({
        kind: "ok",
        text: `Usuario "${cleanCedula}" (${cleanName}) creado con ${n} intento${n === 1 ? "" : "s"}.`,
      });
      setCedula("");
      setEmail("");
      setName("");
      setPassword("");
      setAttempts("10");
      await loadUsers(savedToken);
    } catch (err) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRefreshMatches() {
    if (!savedToken) {
      setBanner({ kind: "err", text: "Guarda primero tu token de admin." });
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch("/api/polla/admin/refresh-matches", {
        method: "POST",
        headers: { authorization: `Bearer ${savedToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          kind: "err",
          text: data.error ?? `Error ${res.status}`,
        });
        return;
      }
      setBanner({
        kind: "ok",
        text: `${data.upserts} partidos cargados desde ${data.source}.`,
      });
      await loadLeaderboard(savedToken);
    } catch (err) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/polla" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista · Admin
            </span>
          </Link>
          <Link
            href="/polla/tablero"
            className="text-sm font-medium text-[var(--foreground-soft)] hover:text-[var(--brand)]"
          >
            Ir al tablero &rarr;
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
          Panel · Administración
        </p>
        <h1 className="mt-3 text-3xl font-black uppercase leading-tight md:text-4xl">
          Crear usuarios y partidos
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--foreground-soft)]">
          Esta pagina usa el <code className="font-mono text-sm">POLLA_ADMIN_TOKEN</code>{" "}
          que configuraste en las variables de entorno. Se guarda en tu navegador
          después de ingresarlo una vez.
        </p>

        {banner && (
          <div
            role="status"
            className={
              "mt-6 border-l-4 p-4 text-sm " +
              (banner.kind === "ok"
                ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                : "border-red-500 bg-red-50 text-red-800")
            }
          >
            {banner.text}
          </div>
        )}

        <section className="mt-10 border border-[var(--line)] bg-white p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
            1 · Token de admin
          </h2>
          <form onSubmit={handleSaveToken} className="mt-4 flex flex-wrap gap-3">
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Pega tu POLLA_ADMIN_TOKEN"
              className="h-11 flex-1 min-w-[260px] border border-[var(--line)] bg-white px-3 font-mono text-sm outline-none focus:border-[var(--brand)]"
            />
            <button
              type="submit"
              className="h-11 bg-[var(--brand)] px-5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)]"
            >
              Guardar
            </button>
            {savedToken && (
              <button
                type="button"
                onClick={handleClearToken}
                className="h-11 border border-[var(--line)] px-5 text-sm font-semibold uppercase tracking-[0.18em] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                Olvidar
              </button>
            )}
          </form>
          {savedToken ? (
            <p className="mt-3 text-xs text-emerald-700">
              Token guardado · ya puedes crear usuarios y refrescar partidos.
            </p>
          ) : (
            <p className="mt-3 text-xs text-[var(--foreground-muted)]">
              Sin token no puedes crear usuarios.
            </p>
          )}
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
            2 · Crear usuario
          </h2>
          <form onSubmit={handleCreateUser} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Cédula
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={cedula}
                onChange={(e) => setCedula(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="1234567890"
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 font-mono tabular-nums outline-none focus:border-[var(--brand)]"
                required
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Correo electrónico (opcional)
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 outline-none focus:border-[var(--brand)]"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Nombre
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cliente Ejemplo"
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 outline-none focus:border-[var(--brand)]"
                required
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Contraseña
              </span>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña inicial"
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 outline-none focus:border-[var(--brand)]"
                required
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Intentos permitidos (1–20)
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={attempts}
                onChange={(e) => setAttempts(e.target.value)}
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 font-mono tabular-nums outline-none focus:border-[var(--brand)]"
                required
              />
            </label>
            <div className="flex items-end md:col-span-2">
              <button
                type="submit"
                disabled={creating || !savedToken}
                className="h-11 w-full bg-[var(--brand)] px-5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creando..." : "Crear usuario"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
              3 · Participantes existentes
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
              {loading ? "Cargando..." : `${users.length} participante${users.length === 1 ? "" : "s"}`}
            </span>
          </div>
          {users.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--foreground-muted)]">
              {savedToken
                ? "Aún no hay participantes. Crea uno arriba o los miembros del fondo aparecerán automáticamente."
                : "Guarda tu token para ver los participantes."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)]">
              {users.map((u) => (
                <li
                  key={u.cedula}
                  className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[1.4fr_1fr_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold">{u.name}</p>
                    <p className="font-mono text-xs text-[var(--foreground-muted)]">
                      {u.email || u.cedula}
                    </p>
                  </div>
                  <p className="font-mono text-xs text-[var(--foreground-soft)]">
                    CC {u.cedula}
                  </p>
                  <span className="inline-flex w-fit items-center gap-2 border border-[var(--foreground)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em]">
                    {u.attemptsAllowed} intento
                    {u.attemptsAllowed === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
              4 · Tabla de posiciones
            </h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                {leaderboardLoading
                  ? "Cargando..."
                  : `${leaderboard.length} boleta${leaderboard.length === 1 ? "" : "s"}`}
              </span>
              <button
                type="button"
                onClick={() => void loadLeaderboard(savedToken)}
                disabled={!savedToken || leaderboardLoading}
                className="h-8 border border-[var(--line)] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Recalcular
              </button>
            </div>
          </div>
          {leaderboardStats && (
            <p className="mt-3 font-mono text-[11px] text-[var(--foreground-muted)]">
              {leaderboardStats.finishedGroupMatches} partido
              {leaderboardStats.finishedGroupMatches === 1 ? "" : "s"} de fase de
              grupos terminado
              {leaderboardStats.finishedGroupMatches === 1 ? "" : "s"} ·{" "}
              {leaderboardStats.finishedKnockoutMatches} de eliminatorias ·{" "}
              {leaderboardStats.totalPredictions} boletas registradas
            </p>
          )}
          {leaderboard.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--foreground-muted)]">
              {savedToken
                ? "Aún no hay puntos para mostrar. Los puntos se calcularán automáticamente cuando los partidos terminen y los marcadores se carguen."
                : "Guarda tu token para ver la tabla."}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--foreground)] text-left font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Participante</th>
                    <th className="py-2 pr-3">Intento</th>
                    <th className="py-2 pr-3 text-right">Grupos</th>
                    <th className="py-2 pr-3 text-right">Elim.</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => {
                    const rank = idx + 1;
                    return (
                      <tr
                        key={`${row.email}-${row.attempt}`}
                        className="border-b border-[var(--line)] align-top"
                      >
                        <td className="py-3 pr-3 font-mono text-sm font-bold tabular-nums">
                          {rank.toString().padStart(2, "0")}
                        </td>
                        <td className="py-3 pr-3">
                          <p className="font-semibold">{row.name}</p>
                          <p className="font-mono text-[11px] text-[var(--foreground-muted)]">
                            {row.email}
                          </p>
                        </td>
                        <td className="py-3 pr-3 font-mono text-xs text-[var(--foreground-soft)]">
                          {row.attempt}/{row.attemptsAllowed}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <div className="font-mono font-bold tabular-nums">
                            {row.breakdown.group.points}
                          </div>
                          <div className="font-mono text-[10px] text-[var(--foreground-muted)]">
                            {row.breakdown.group.uniqueExact}u ·{" "}
                            {row.breakdown.group.exact}e ·{" "}
                            {row.breakdown.group.outcomes}g
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <div className="font-mono font-bold tabular-nums">
                            {row.breakdown.knockout.points}
                          </div>
                          <div className="font-mono text-[10px] text-[var(--foreground-muted)]">
                            {row.breakdown.knockout.r16}·
                            {row.breakdown.knockout.qf}·
                            {row.breakdown.knockout.sf}
                            {row.breakdown.knockout.runnerUp ? " ·sub" : ""}
                            {row.breakdown.knockout.champion ? " ·camp" : ""}
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right font-mono text-lg font-black tabular-nums">
                          {row.breakdown.total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                Grupos: u = unicos, e = exactos, g = solo ganador · Elim: r16 ·
                cuartos · semis (+ sub / campeón)
              </p>
            </div>
          )}
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
            5 · Partidos del Mundial
          </h2>
          <p className="mt-3 text-sm text-[var(--foreground-soft)]">
            Se cargan automáticamente la primera vez que alguien abre el
            tablero. Si quieres forzar una recarga, usa el botón.
          </p>
          <button
            type="button"
            onClick={handleRefreshMatches}
            disabled={refreshing || !savedToken}
            className="mt-4 h-11 border border-[var(--foreground)] px-5 text-sm font-semibold uppercase tracking-[0.18em] transition hover:bg-[var(--foreground)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Cargando..." : "Refrescar partidos"}
          </button>
        </section>

        <p className="mt-10 text-xs text-[var(--foreground-muted)]">
          ¿Necesitas diagnosticar la conexión a Mongo? Abre{" "}
          <Link className="underline" href="/api/health">
            /api/health
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
