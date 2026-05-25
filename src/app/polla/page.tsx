import Link from "next/link";

const HERO_IMAGE =
  "https://media.cnn.com/api/v1/images/stellar/prod/221219105607-messi-crowd-world-cup-121822.jpg?q=w_3000,c_fill";

const MERQUE_LOGO =
  "https://www.merquellantas.com/assets/images/logo/Logo-Merquellantas.png";

const partners = [
  {
    name: "Marca aliada",
    src: "https://mqplatform.blob.core.windows.net/brandslogo/80f70f0c-e275-5f26-25e2-75b5db5b648d.png?sv=2025-05-05&ss=bfqt&srt=sco&st=2026-04-28T20%3A37%3A59Z&se=2026-04-30T20%3A37%3A59Z&sp=rwdxylacuptfi&sig=28vOIzeF%2BI1a%2FbfQmf3fcieFr2L8Rc8V6InTwAEKdx8%3D",
  },
  {
    name: "Marca aliada",
    src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSSdxzcuqEmKNIege1w1_FpRL4av13KPdpA4g&s",
  },
];

const groupRows = [
  { phase: "Marcador exacto", points: 50 },
  { phase: "Acertar el resultado (ganador o empate)", points: 30 },
  { phase: "Acertar la diferencia de gol", points: 20 },
];

const knockoutRows = [
  { phase: "Campeón y subcampeón", points: 350 },
  { phase: "Campeón", points: 300 },
  { phase: "Subcampeón", points: 250 },
];

function PitchMarkings() {
  return (
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
      <rect x="0" y="380" width="60" height="140" />
      <rect x="1440" y="280" width="160" height="340" />
      <rect x="1540" y="380" width="60" height="140" />
    </svg>
  );
}

export default function PollaHome() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/polla" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista
            </span>
          </Link>
          <nav className="hidden gap-8 text-sm font-medium text-[var(--foreground-soft)] md:flex">
            <a href="#participar" className="hover:text-[var(--brand)]">
              Cómo participar
            </a>
            <a href="#puntuacion" className="hover:text-[var(--brand)]">
              Puntuación
            </a>
            <a href="#asesor" className="hover:text-[var(--brand)]">
              Habla con tu asesor
            </a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/polla/login"
              className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--brand)]"
            >
              Iniciar sesión
            </Link>
            <a
              href="#asesor"
              className="rounded-sm bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
            >
              Quiero participar
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative isolate overflow-hidden bg-[var(--foreground)] text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HERO_IMAGE}
            alt="Estadio mundial"
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-55"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--foreground)]/70 via-[var(--foreground)]/55 to-[var(--foreground)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(255,153,0,0.25),transparent_55%)]"
          />
          <PitchMarkings />

          {/* LED-strip top ticker */}
          <div className="relative border-b border-white/10 bg-black/30">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.28em] text-white/70">
              <span>FIFA World Cup · 2026</span>
              <span className="hidden sm:inline">
                Polla Oficial · Merquellantas
              </span>
              <span className="text-[var(--brand)]">● En vivo pronto</span>
            </div>
          </div>

          <div className="relative mx-auto max-w-6xl px-6 pb-28 pt-20 md:pb-40 md:pt-28">
            <div className="max-w-3xl">
              <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--brand)]">
                <span className="h-px w-8 bg-[var(--brand)]" />
                Edición Mundial · Polla por invitación
              </p>
              <h1 className="mt-6 text-[48px] font-black uppercase leading-[0.95] tracking-[-0.02em] md:text-[96px]">
                Pronostica.
                <br />
                <span className="text-[var(--brand)]">Suma puntos.</span>
                <br />
                <span className="italic font-light normal-case tracking-tight">
                  Lleva el Mundial puesto.
                </span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/80">
                La Polla Mundialista de Merquellantas: un solo lugar para
                pronosticar los 64 partidos, sumar puntos por cada acierto y
                pelear por los premios con nuestros mejores clientes.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-5">
                <a
                  href="#asesor"
                  className="inline-flex h-12 items-center justify-center rounded-sm bg-[var(--brand)] px-7 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
                >
                  Quiero participar
                </a>
                <a
                  href="#puntuacion"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white underline-offset-[6px] hover:underline"
                >
                  Ver tabla de puntos
                  <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </div>

            {/* Scoreboard chip pinned bottom-right */}
            <div className="mt-16 hidden items-stretch gap-0 border border-white/15 bg-black/40 font-mono text-white backdrop-blur md:inline-flex">
              <div className="flex items-center gap-3 border-r border-white/10 px-5 py-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand)]" />
                <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">
                  Próximo partido
                </span>
              </div>
              <div className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="font-bold">COL</span>
                <span className="text-2xl font-black tabular-nums text-[var(--brand)]">
                  ?-?
                </span>
                <span className="font-bold">BRA</span>
              </div>
              <div className="border-l border-white/10 px-5 py-3 text-[10px] uppercase tracking-[0.3em] text-white/60">
                Pronostica antes del pitazo
              </div>
            </div>
          </div>
        </section>

        {/* PARTNERS — bigger, below the hero */}
        <section className="border-b border-[var(--line)] bg-white">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
                  Aliados Oficiales
                </p>
                <h2 className="mt-2 text-2xl font-black md:text-3xl">
                  Marcas que juegan con nosotros
                </h2>
              </div>
              <p className="max-w-md text-sm text-[var(--foreground-soft)]">
                La Polla Mundialista Merque se hace posible con el respaldo de
                nuestras marcas aliadas.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {partners.map((p, i) => (
                <div
                  key={i}
                  className="flex h-44 items-center justify-center border border-[var(--line)] bg-[var(--surface)] p-8 transition hover:border-[var(--brand)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.src}
                    alt={p.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CÓMO PARTICIPAR — pitch-stripe band */}
        <section
          id="participar"
          className="relative border-b border-[var(--line)]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--surface) 0 80px, #f1ece2 80px 160px)",
          }}
        >
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
                01 · Cómo participar
              </p>
              <h2 className="mt-4 text-3xl font-black leading-tight md:text-[40px]">
                La polla es{" "}
                <span className="text-[var(--brand)]">por invitación.</span>
              </h2>
              <p className="mt-5 text-[var(--foreground-soft)]">
                No todos los clientes pueden jugar — la Polla Mundialista es un
                beneficio exclusivo para clientes Merquellantas que han
                alcanzado un determinado volumen de compra durante el año.
              </p>
            </div>

            <div
              id="asesor"
              className="relative border-l-4 border-[var(--brand)] bg-white p-8 shadow-[0_1px_0_rgba(0,0,0,0.04)] md:p-10"
            >
              <span className="absolute -top-3 left-8 bg-[var(--brand)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-white">
                Tu asesor
              </span>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--brand)]">
                Si no sabes cómo participar
              </p>
              <p className="mt-4 text-2xl font-bold leading-snug md:text-[28px]">
                Pregúntale a tu asesor Merquellantas.
              </p>
              <p className="mt-4 text-[var(--foreground-soft)]">
                Tu asesor te confirma si ya cumples con los requisitos, te
                comparte el reglamento completo y te entrega tus credenciales de
                acceso para empezar a pronosticar.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6">
                <a
                  href="https://www.merquellantas.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center rounded-sm bg-[var(--brand)] px-6 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
                >
                  Contactar a mi asesor
                </a>
                <span className="text-sm text-[var(--foreground-muted)]">
                  o escríbenos por los canales de siempre
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* PUNTUACIÓN — scoreboard */}
        <section
          id="puntuacion"
          className="bg-[var(--foreground)] text-white"
        >
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-16">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
                  02 · Reglamento de puntos
                </p>
                <h2 className="mt-4 text-3xl font-black leading-[1.05] md:text-[44px]">
                  Cada partido cuenta.
                  <br />
                  <span className="italic font-light text-white/80">
                    La final lo decide todo.
                  </span>
                </h2>
                <p className="mt-6 max-w-md text-white/70">
                  Suma puntos por cada acierto en la fase de grupos y apuesta
                  fuerte por tu campeón y subcampeón para ganar los puntos
                  más grandes del torneo.
                </p>
                <div className="mt-8 inline-flex items-center gap-3 border border-[var(--brand)]/40 bg-[var(--brand)]/10 px-4 py-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--brand)]">
                    Mega bono
                  </span>
                  <span className="text-sm">
                    Campeón + subcampeón correctos &rarr;{" "}
                    <strong className="text-[var(--brand)]">+350 pts</strong>
                  </span>
                </div>
              </div>

              <div className="grid gap-8">
                <div>
                  <div className="flex items-baseline justify-between border-b border-white/20 pb-3">
                    <h3 className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-white/80">
                      Fase de grupos
                    </h3>
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
                      48 partidos
                    </span>
                  </div>
                  <dl className="mt-2 divide-y divide-white/10">
                    {groupRows.map((r) => (
                      <div
                        key={r.phase}
                        className="flex items-baseline justify-between py-4"
                      >
                        <dt className="text-base">{r.phase}</dt>
                        <dd className="font-mono text-3xl font-black tabular-nums text-[var(--brand)]">
                          {r.points.toString().padStart(2, "0")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div>
                  <div className="flex items-baseline justify-between border-b border-white/20 pb-3">
                    <h3 className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-white/80">
                      Campeón y subcampeón
                    </h3>
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
                      Final
                    </span>
                  </div>
                  <dl className="mt-2 divide-y divide-white/10">
                    {knockoutRows.map((r) => (
                      <div
                        key={r.phase}
                        className="flex items-baseline justify-between py-4"
                      >
                        <dt className="text-base">{r.phase}</dt>
                        <dd className="font-mono text-3xl font-black tabular-nums text-[var(--brand)]">
                          {r.points.toString().padStart(2, "0")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-y border-[var(--line)] bg-[var(--brand)] text-[var(--foreground)]">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-14 md:flex-row md:items-center">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--foreground)]/70">
                ¿Listo?
              </p>
              <p className="mt-3 max-w-2xl text-2xl font-black leading-snug md:text-3xl">
                El pitazo inicial está cerca. Confirma tu cupo con tu asesor y
                empieza a pronosticar.
              </p>
            </div>
            <a
              href="#asesor"
              className="inline-flex h-12 items-center justify-center rounded-sm bg-[var(--foreground)] px-7 text-sm font-semibold text-white transition hover:bg-black"
            >
              Hablar con mi asesor
            </a>
          </div>
        </section>
      </main>

      <footer className="bg-[var(--foreground)] text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm md:flex-row">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MERQUE_LOGO}
              alt="Merquellantas"
              className="h-7 w-auto brightness-0 invert"
            />
            <span>
              © {new Date().getFullYear()} · Polla Mundialista Merque
            </span>
          </div>
          <p className="text-white/50">
            Beneficio exclusivo para clientes Merquellantas.
          </p>
        </div>
      </footer>
    </div>
  );
}
