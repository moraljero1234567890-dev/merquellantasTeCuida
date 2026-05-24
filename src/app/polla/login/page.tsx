"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePollaAuth } from "@/lib/polla/use-polla-auth";
import { writePollaSession } from "@/lib/polla/session";

const HERO_IMAGE =
  "https://media.cnn.com/api/v1/images/stellar/prod/221219105607-messi-crowd-world-cup-121822.jpg?q=w_3000,c_fill";

const MERQUE_LOGO =
  "https://www.merquellantas.com/assets/images/logo/Logo-Merquellantas.png";

export default function PollaLoginPage() {
  const router = useRouter();
  const { session: existingSession, checked } = usePollaAuth({ redirect: false });
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (checked && existingSession) {
      router.replace("/polla/tablero");
    }
  }, [checked, existingSession, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedCedula = cedula.trim();
    if (!trimmedCedula) {
      setError("Ingresa tu cédula.");
      return;
    }
    if (!password) {
      setError("Ingresa tu contraseña.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/polla/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: trimmedCedula, password }),
      });
      if (!res.ok) {
        setError(
          "No encontramos una cuenta con esas credenciales. Pregúntale a tu asesor Merquellantas.",
        );
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as {
        user: {
          cedula: string;
          email: string;
          name: string;
          attemptsAllowed: number;
        };
      };
      writePollaSession(data.user);
      router.push("/polla/tablero");
    } catch {
      setError("No pudimos validar tu sesión. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      {/* Visual panel */}
      <aside className="relative isolate hidden overflow-hidden bg-[var(--foreground)] text-white lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_IMAGE}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-50"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--foreground)]/65 via-[var(--foreground)]/55 to-[var(--foreground)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,153,0,0.3),transparent_55%)]"
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full text-white/15"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 1600 900"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="800" y1="0" x2="800" y2="900" />
          <circle cx="800" cy="450" r="120" />
          <circle cx="800" cy="450" r="3" fill="currentColor" stroke="none" />
          <rect x="0" y="280" width="160" height="340" />
          <rect x="1440" y="280" width="160" height="340" />
        </svg>

        <div className="relative flex h-full flex-col justify-between p-10">
          <Link href="/polla" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MERQUE_LOGO}
              alt="Merquellantas"
              className="h-8 w-auto brightness-0 invert"
            />
            <span className="h-6 w-px bg-white/30" />
            <span className="text-sm font-semibold tracking-wide">
              Polla Mundialista
            </span>
          </Link>

          <div className="max-w-md">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
              Acceso · Edición Mundial 2026
            </p>
            <h2 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl">
              Entra a tu
              <br />
              <span className="text-[var(--brand)]">boleta</span> de
              pronósticos.
            </h2>
            <p className="mt-5 text-white/75">
              Ingresa con tu cédula y contraseña registrados con tu asesor
              Merquellantas. Si no recuerdas tus datos, tu asesor puede
              entregártelos de nuevo.
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-3 border border-white/15 bg-black/30 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em] text-white/70 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand)]" />
            FIFA World Cup · 2026
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col bg-[var(--background)]">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4 lg:hidden">
          <Link href="/polla" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-8 w-auto" />
            <span className="text-sm font-semibold">Polla Mundialista</span>
          </Link>
          <Link
            href="/polla"
            className="text-sm font-medium text-[var(--foreground-soft)] hover:text-[var(--brand)]"
          >
            Volver
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-16 lg:px-16">
          <div className="w-full max-w-md">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
              Iniciar sesión
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight md:text-4xl">
              Bienvenido de vuelta.
            </h1>
            <p className="mt-3 text-[var(--foreground-soft)]">
              Ingresa con tu cédula y contraseña para entrar.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-10 space-y-5"
              noValidate
            >
              <div>
                <label
                  htmlFor="cedula"
                  className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--foreground-muted)]"
                >
                  Cédula
                </label>
                <input
                  id="cedula"
                  name="cedula"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  required
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="1234567890"
                  className="mt-2 h-12 w-full border border-[var(--line)] bg-white px-4 font-mono text-base tabular-nums text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--foreground-muted)]"
                >
                  Contraseña
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  className="mt-2 h-12 w-full border border-[var(--line)] bg-white px-4 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand-dark)]"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-sm bg-[var(--brand)] px-6 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Entrando..." : "Iniciar sesión"}
              </button>
            </form>

            <div className="mt-6 text-sm text-[var(--foreground-soft)]">
              <p className="font-semibold text-[var(--foreground)]">
                ¿No tienes acceso?
              </p>
              <p className="mt-1">
                La Polla Mundialista es por invitación. Pregúntale a tu asesor
                Merquellantas si ya cumples con los requisitos.{" "}
                <Link
                  href="/polla#asesor"
                  className="font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
                >
                  Ver más
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
