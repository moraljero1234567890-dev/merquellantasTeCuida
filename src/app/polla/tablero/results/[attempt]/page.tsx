"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/data/polla/worldcup2026";
import { staticFallback, type ApiMatch } from "@/lib/polla/matches";
import { usePollaAuth } from "@/lib/polla/use-polla-auth";
import { displayTeam, normalizeTeam } from "@/lib/polla/team-display";
import { groupMatchResult, type GroupTier } from "@/lib/polla/group-points";
import type { KnockoutPick, PredictionDoc } from "@/lib/polla/types";

const MERQUE_LOGO =
  "https://www.merquellantas.com/assets/images/logo/Logo-Merquellantas.png";

const STAGE_TITLES: Record<KnockoutPick["stage"], string> = {
  ROUND_OF_32: "Dieciseisavos",
  ROUND_OF_16: "Octavos",
  QUARTER_FINALS: "Cuartos",
  SEMI_FINALS: "Semifinales",
  THIRD_PLACE: "Tercer puesto",
  FINAL: "Final",
};

type MatchWithScore = ApiMatch & {
  score?: {
    fullTime: { home: number; away: number } | null;
    penalties?: { home: number; away: number } | null;
  } | null;
  status?: string;
};

// Each predicted knockout pick lives in the user's OWN fantasy bracket, whose
// fixtures rarely coincide with the real ones (and whose synthetic slot order
// differs from Wikipedia's chronological order), so we never pair a pick to a
// real match by slot index. Instead we compare by TEAM: "did the team you
// backed to advance from this round actually win its real match in that round?".

// Winning team code of a finished real match (penalties as tiebreak), or null.
function actualWinnerCode(m: MatchWithScore): string | null {
  const ft = m.score?.fullTime;
  if (!ft) return null;
  if (ft.home > ft.away) return m.home.code;
  if (ft.away > ft.home) return m.away.code;
  const pe = m.score?.penalties;
  if (pe) {
    if (pe.home > pe.away) return m.home.code;
    if (pe.away > pe.home) return m.away.code;
  }
  return null;
}

// Winning team code among the user's predicted teams for a pick, or null.
function predictedWinnerCode(p: KnockoutPick): string | null {
  if (p.home == null || p.away == null) return null;
  if (p.home > p.away) return p.homeTeamCode;
  if (p.away > p.home) return p.awayTeamCode;
  if (p.penaltyWinner === "home") return p.homeTeamCode;
  if (p.penaltyWinner === "away") return p.awayTeamCode;
  return null;
}

// User's original predicted winner: captured before applyActual overwrote scores.
// Falls back to predictedWinnerCode for picks not yet overwritten (match still live).
function userPickedWinner(p: KnockoutPick): string | null {
  if (p.userPredictedWinner !== undefined) return p.userPredictedWinner;
  return predictedWinnerCode(p);
}

const KO_PTS = {
  ROUND_OF_32: 25,
  ROUND_OF_16: 50,
  QUARTER_FINALS: 75,
  SEMI_FINALS: 100,
  THIRD_PLACE: 50,
  CHAMPION: 300,
  RUNNER_UP: 250,
  CHAMPION_AND_RUNNER_UP: 350,
} as const;

function MiniMatch({
  h,
  a,
  home,
  away,
  pen,
}: {
  h: { name: string; crest: string };
  a: { name: string; crest: string };
  home: number | null;
  away: number | null;
  pen: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="flex items-center justify-end gap-2 text-right text-sm font-bold uppercase tracking-tight">
        <span>{h.name || "—"}</span>
        {h.crest && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={h.crest}
            alt=""
            aria-hidden
            className="h-6 w-9 shrink-0 border border-[var(--line)] object-cover"
          />
        )}
      </div>
      <span className="font-mono text-lg font-black tabular-nums">
        {home != null && away != null
          ? `${home}–${away}${pen ? " (pen)" : ""}`
          : "—"}
      </span>
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
        {a.crest && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={a.crest}
            alt=""
            aria-hidden
            className="h-6 w-9 shrink-0 border border-[var(--line)] object-cover"
          />
        )}
        <span>{a.name || "—"}</span>
      </div>
    </div>
  );
}

// One of the user's predicted knockout matches. `advanced` is whether the team
// they backed to win actually advanced from this round in reality (null = that
// round hasn't produced results yet). `eliminated` flags a backed team that is
// already out (lost a real match this round), so the user gets clear feedback.
function PredictedMatchCard({
  pick,
  advanced,
}: {
  pick: KnockoutPick;
  advanced: boolean | null;
}) {
  const h = displayTeam(pick.homeTeamCode, pick.homeTeamName);
  const a = displayTeam(pick.awayTeamCode, pick.awayTeamName);
  const winnerName =
    predictedWinnerCode(pick) === pick.homeTeamCode
      ? h.name
      : predictedWinnerCode(pick) === pick.awayTeamCode
        ? a.name
        : null;
  return (
    <li
      className={`border p-4 ${
        advanced === true
          ? "border-emerald-600 bg-emerald-50"
          : advanced === false
            ? "border-red-300 bg-red-50/60"
            : "border-[var(--line)] bg-white"
      }`}
    >
      <MiniMatch
        h={h}
        a={a}
        home={pick.home}
        away={pick.away}
        pen={!!pick.penaltyWinner}
      />
      {advanced !== null && winnerName && (
        <div className="mt-2 text-center font-mono text-[10px] font-black uppercase tracking-[0.2em]">
          {advanced ? (
            <span className="text-emerald-700">{winnerName} avanzó ✓</span>
          ) : (
            <span className="text-red-600">{winnerName} quedó eliminado</span>
          )}
        </div>
      )}
    </li>
  );
}

// Wikipedia labels not-yet-decided bracket slots in English ("Winner Match 75",
// "Loser Match 101", "Winners Group A"); show a Spanish placeholder instead.
function realTeamLabel(name: string): string {
  if (!name || /winner|loser|runner|^1[a-l]$|group/i.test(name)) {
    return "Por definir";
  }
  return name;
}

// One real knockout fixture (authoritative). Shows the actual teams + score, or
// the scheduled placeholder when it hasn't been played / drawn yet.
function RealMatchCard({ m }: { m: MatchWithScore }) {
  const h = normalizeTeam(m.home);
  const a = normalizeTeam(m.away);
  const finished = m.status === "FINISHED" && m.score?.fullTime != null;
  return (
    <li className="border border-[var(--line)] bg-white p-4">
      {finished ? (
        <MiniMatch
          h={h}
          a={a}
          home={m.score!.fullTime!.home}
          away={m.score!.fullTime!.away}
          pen={!!m.score?.penalties}
        />
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="text-right text-xs font-bold uppercase tracking-tight text-[var(--foreground-muted)]">
            {realTeamLabel(h.name)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
            vs
          </span>
          <span className="text-xs font-bold uppercase tracking-tight text-[var(--foreground-muted)]">
            {realTeamLabel(a.name)}
          </span>
        </div>
      )}
    </li>
  );
}

function pickClass(
  predicted: { home: number; away: number } | null,
  actual: { home: number; away: number } | null,
): string {
  if (!actual) return "border-[var(--line)] bg-white";
  if (!predicted) return "border-[var(--line)] bg-white";
  if (predicted.home === actual.home && predicted.away === actual.away) {
    return "border-emerald-600 bg-emerald-50";
  }
  const predDiff = predicted.home - predicted.away;
  const actDiff = actual.home - actual.away;
  const sameOutcome =
    (predDiff > 0 && actDiff > 0) ||
    (predDiff < 0 && actDiff < 0) ||
    (predDiff === 0 && actDiff === 0);
  if (sameOutcome) return "border-amber-500 bg-amber-50";
  return "border-red-400 bg-red-50";
}

const TIER_LABEL: Record<GroupTier, string> = {
  exact: "Marcador exacto",
  goalDiff: "Diferencia de gol",
  outcome: "Resultado",
  none: "Sin acierto",
};

const TIER_BADGE: Record<GroupTier, string> = {
  exact: "bg-emerald-600 text-white",
  goalDiff: "bg-amber-500 text-white",
  outcome: "bg-amber-400 text-[var(--foreground)]",
  none: "bg-[var(--line)] text-[var(--foreground-muted)]",
};

export default function PollaResultsPage() {
  const params = useParams<{ attempt: string }>();
  const attemptNum = Number(params.attempt);

  const { session, logout } = usePollaAuth();
  const [matches, setMatches] = useState<MatchWithScore[]>([]);
  const [prediction, setPrediction] = useState<PredictionDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/polla/matches").then((r) => r.json()),
      fetch(
        `/api/polla/predictions/${attemptNum}?cedula=${encodeURIComponent(session.cedula)}`,
      ).then((r) => r.json()),
    ])
      .then(([m, p]) => {
        if (cancelled) return;
        const arr: MatchWithScore[] = Array.isArray(m.matches)
          ? m.matches
          : staticFallback();
        setMatches(arr.length ? arr : staticFallback());
        if (p?.prediction) {
          setPrediction(p.prediction);
          setError(null);
        } else {
          setPrediction(null);
          setError(p?.error ?? "No encontramos tu boleta para este intento.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos cargar tu boleta.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, attemptNum]);

  const groupMatches = useMemo(
    () => matches.filter((m) => m.stage === "GROUP_STAGE" && m.group),
    [matches],
  );

  const groupPointsTotal = useMemo(() => {
    if (!prediction) return 0;
    return groupMatches.reduce((sum, m) => {
      const actual = m.score?.fullTime ?? null;
      if (m.status !== "FINISHED" || !actual) return sum;
      return sum + groupMatchResult(prediction.groupScores[m._id] ?? null, actual).points;
    }, 0);
  }, [groupMatches, prediction]);

  const realKnockoutById = useMemo(() => {
    const map = new Map<string, MatchWithScore>();
    for (const m of matches) {
      if (m.stage !== "GROUP_STAGE") map.set(m._id, m);
    }
    return map;
  }, [matches]);

  // Real knockout fixtures grouped by stage, in chronological order — the
  // authoritative "what actually happened" list shown next to the user's bracket.
  const realByStage = useMemo(() => {
    const map = new Map<string, MatchWithScore[]>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE") continue;
      const arr = map.get(m.stage) ?? [];
      arr.push(m);
      map.set(m.stage, arr);
    }
    for (const arr of map.values()) {
      arr.sort((x, y) =>
        `${x.date}${x.time}`.localeCompare(`${y.date}${y.time}`),
      );
    }
    return map;
  }, [matches]);

  // Per real stage: which team codes actually won and which actually lost. Used
  // to tell whether the team the user backed in a predicted match advanced.
  const stageOutcome = useMemo(() => {
    const map = new Map<string, { winners: Set<string>; losers: Set<string> }>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE") continue;
      if (m.status !== "FINISHED" || !m.score?.fullTime) continue;
      const w = actualWinnerCode(m);
      if (!w) continue;
      const l = w === m.home.code ? m.away.code : m.home.code;
      const oc = map.get(m.stage) ?? { winners: new Set(), losers: new Set() };
      oc.winners.add(w);
      if (l) oc.losers.add(l);
      map.set(m.stage, oc);
    }
    return map;
  }, [matches]);

  // Did the team the user backed to win this pick actually advance from that
  // round? true = won its real match, false = lost it, null = not yet decided.
  // Uses userPickedWinner so the comparison is against the user's ORIGINAL
  // prediction even after applyActual overwrote the pick scores with real results.
  const advancedForPick = (pick: KnockoutPick): boolean | null => {
    const oc = stageOutcome.get(pick.stage);
    if (!oc) return null;
    const w = userPickedWinner(pick);
    if (!w) return null;
    if (oc.winners.has(w)) return true;
    if (oc.losers.has(w)) return false;
    return null;
  };

  // Per-round knockout points: for each pick, check if the user's originally
  // predicted winner (userPredictedWinner, captured before applyActual overwrote
  // the pick) actually won their round in the real tournament.
  const knockoutPts = useMemo(() => {
    const result = { r32: 0, r16: 0, qf: 0, sf: 0, third: 0, champion: 0, runnerUp: 0, total: 0 };
    if (!prediction) return result;

    const stageWinners = new Map<string, Set<string>>();
    let realThird: string | null = null;
    let realChampion: string | null = null;
    let realRunnerUp: string | null = null;

    for (const m of matches) {
      if (m.stage === "GROUP_STAGE" || m.status !== "FINISHED" || !m.score?.fullTime) continue;
      const w = actualWinnerCode(m);
      if (!w) continue;
      const l = w === m.home.code ? m.away.code : m.home.code;
      if (!stageWinners.has(m.stage)) stageWinners.set(m.stage, new Set());
      stageWinners.get(m.stage)!.add(w);
      if (m.stage === "THIRD_PLACE") realThird = w;
      if (m.stage === "FINAL") { realChampion = w; realRunnerUp = l; }
    }

    const allPicks = [
      ...prediction.knockout.r32,
      ...prediction.knockout.r16,
      ...prediction.knockout.qf,
      ...prediction.knockout.sf,
      ...(prediction.knockout.third ? [prediction.knockout.third] : []),
    ];
    for (const pick of allPicks) {
      const upw = userPickedWinner(pick);
      if (!upw) continue;
      switch (pick.stage) {
        case "ROUND_OF_32":
          if (stageWinners.get("ROUND_OF_32")?.has(upw)) { result.r32 += 1; result.total += KO_PTS.ROUND_OF_32; }
          break;
        case "ROUND_OF_16":
          if (stageWinners.get("ROUND_OF_16")?.has(upw)) { result.r16 += 1; result.total += KO_PTS.ROUND_OF_16; }
          break;
        case "QUARTER_FINALS":
          if (stageWinners.get("QUARTER_FINALS")?.has(upw)) { result.qf += 1; result.total += KO_PTS.QUARTER_FINALS; }
          break;
        case "SEMI_FINALS":
          if (stageWinners.get("SEMI_FINALS")?.has(upw)) { result.sf += 1; result.total += KO_PTS.SEMI_FINALS; }
          break;
        case "THIRD_PLACE":
          if (realThird && upw === realThird) { result.third += 1; result.total += KO_PTS.THIRD_PLACE; }
          break;
      }
    }

    // Champion / runner-up from the final pick
    const finalPick = prediction.knockout.final;
    const myChampion = finalPick ? userPickedWinner(finalPick) : null;
    const myRunnerUp = myChampion && finalPick
      ? myChampion === finalPick.homeTeamCode ? finalPick.awayTeamCode
        : myChampion === finalPick.awayTeamCode ? finalPick.homeTeamCode : null
      : null;

    const gotChampion = !!realChampion && myChampion === realChampion;
    const gotRunnerUp = !!realRunnerUp && !!myRunnerUp && myRunnerUp === realRunnerUp;
    if (gotChampion && gotRunnerUp) {
      result.champion = 1; result.runnerUp = 1; result.total += KO_PTS.CHAMPION_AND_RUNNER_UP;
    } else if (gotChampion) {
      result.champion = 1; result.total += KO_PTS.CHAMPION;
    } else if (gotRunnerUp) {
      result.runnerUp = 1; result.total += KO_PTS.RUNNER_UP;
    }

    return result;
  }, [matches, prediction]);

  // Champion / runner-up display info (separate from scoring).
  const champ = useMemo(() => {
    const realFinal = realKnockoutById.get("wiki-FINAL-1") ?? null;
    const finalFinished =
      realFinal?.status === "FINISHED" && realFinal?.score?.fullTime != null;
    const actualChampionCode =
      finalFinished && realFinal ? actualWinnerCode(realFinal) : null;
    const actualChampion =
      realFinal && actualChampionCode === realFinal.home.code
        ? normalizeTeam(realFinal.home)
        : realFinal && actualChampionCode === realFinal.away.code
          ? normalizeTeam(realFinal.away)
          : null;
    const actualRunnerUpTeam =
      realFinal && actualChampionCode === realFinal.home.code
        ? normalizeTeam(realFinal.away)
        : realFinal && actualChampionCode === realFinal.away.code
          ? normalizeTeam(realFinal.home)
          : null;
    const actualRunnerUpCode =
      realFinal && actualChampionCode === realFinal.home.code
        ? realFinal.away.code
        : realFinal && actualChampionCode === realFinal.away.code
          ? realFinal.home.code
          : null;

    // Use userPickedWinner for the final pick so the display shows the user's
    // ORIGINAL prediction even after applyActual overwrote the pick with real scores.
    const myFinal = prediction?.knockout.final ?? null;
    const myChampionCode = myFinal ? userPickedWinner(myFinal) : (prediction?.champion?.code ?? null);
    const myRunnerUpCode = myChampionCode && myFinal
      ? myChampionCode === myFinal.homeTeamCode ? myFinal.awayTeamCode
        : myChampionCode === myFinal.awayTeamCode ? myFinal.homeTeamCode : null
      : null;

    const championCorrect =
      actualChampionCode != null && myChampionCode === actualChampionCode;
    const runnerUpCorrect =
      actualRunnerUpCode != null &&
      myRunnerUpCode != null &&
      myRunnerUpCode === actualRunnerUpCode;

    return {
      decided: !!actualChampionCode,
      actualChampion,
      actualRunnerUpTeam,
      championCorrect,
      runnerUpCorrect,
      myChampionCode,
      myRunnerUpCode,
    };
  }, [realKnockoutById, prediction]);

  const handleLogout = logout;

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[var(--foreground-muted)]">
        Cargando...
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/polla/tablero" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista
            </span>
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-sm border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-[var(--line)] bg-[var(--foreground)] text-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--brand)]">
              Boleta · Intento {attemptNum}
            </p>
            <h1 className="mt-3 text-3xl font-black uppercase leading-tight md:text-5xl">
              Tu pronóstico vs. resultados reales
            </h1>
            <p className="mt-3 max-w-xl text-white/70">
              Los marcadores se actualizan diariamente durante el Mundial.
              <span className="text-emerald-300"> Verde</span> = exacto,{" "}
              <span className="text-amber-300">amarillo</span> = mismo resultado,{" "}
              <span className="text-red-300">rojo</span> = fallaste.
            </p>
          </div>
        </section>

        {loading ? (
          <section className="mx-auto max-w-6xl px-6 py-12">
            <div className="border border-dashed border-[var(--line)] bg-white p-12 text-center text-sm text-[var(--foreground-muted)]">
              Cargando resultados...
            </div>
          </section>
        ) : !prediction ? (
          <section className="mx-auto max-w-6xl px-6 py-12">
            <div className="border border-dashed border-[var(--line)] bg-white p-12 text-center text-sm text-[var(--foreground-muted)]">
              {error ?? "No encontramos tu boleta para este intento."}
            </div>
          </section>
        ) : (
          <>
            {error && (
              <div className="mx-auto mt-6 max-w-6xl border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] p-4 px-6 text-sm text-[var(--brand-dark)]">
                {error}
              </div>
            )}

            <section className="mx-auto max-w-6xl px-6 py-10">
              <h2 className="flex items-center justify-between gap-3 border-b border-[var(--foreground)] pb-2 font-mono text-xs font-bold uppercase tracking-[0.3em]">
                <span>Fase de grupos</span>
                <span className="text-[var(--brand)]">
                  {groupPointsTotal} pts acumulados
                </span>
              </h2>
              <ul className="mt-6 grid gap-3">
                {groupMatches.map((m) => {
                  const predicted = prediction.groupScores[m._id] ?? null;
                  const actual = m.score?.fullTime ?? null;
                  const homeT = normalizeTeam(m.home);
                  const awayT = normalizeTeam(m.away);
                  const scored = m.status === "FINISHED" && actual != null;
                  const { tier, points } = scored
                    ? groupMatchResult(predicted, actual)
                    : { tier: "none" as GroupTier, points: 0 };
                  return (
                    <li
                      key={m._id}
                      className={`grid grid-cols-1 items-center gap-3 border p-4 md:grid-cols-[120px_1fr_auto_1fr_auto] ${pickClass(
                        predicted,
                        actual,
                      )}`}
                    >
                      <div className="hidden font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)] md:block">
                        <div>{formatDate(m.date)}</div>
                        <div>Grupo {m.group}</div>
                      </div>
                      <div className="flex items-center gap-3 md:justify-end">
                        <span className="text-right text-base font-bold uppercase tracking-tight">
                          {homeT.name}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={homeT.crest}
                          alt=""
                          aria-hidden
                          className="h-9 w-12 border border-[var(--line)] object-cover"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-center font-mono text-sm">
                        <div>
                          <div className="text-[9px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                            Tu
                          </div>
                          <div className="mt-1 text-2xl font-black tabular-nums">
                            {predicted
                              ? `${predicted.home}–${predicted.away}`
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                            Real
                          </div>
                          <div className="mt-1 text-2xl font-black tabular-nums">
                            {actual
                              ? `${actual.home}–${actual.away}`
                              : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={awayT.crest}
                          alt=""
                          aria-hidden
                          className="h-9 w-12 border border-[var(--line)] object-cover"
                        />
                        <span className="text-base font-bold uppercase tracking-tight">
                          {awayT.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 md:flex-col md:items-end md:justify-center">
                        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                          {m.status === "FINISHED"
                            ? "Final"
                            : m.status === "IN_PLAY"
                              ? "En juego"
                              : "Programado"}
                        </span>
                        {scored && (
                          <span
                            title={TIER_LABEL[tier]}
                            className={`rounded-sm px-2 py-1 font-mono text-[11px] font-black tabular-nums ${TIER_BADGE[tier]}`}
                          >
                            {points > 0 ? `+${points}` : "0"} pts
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-16">
              <h2 className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--foreground)] pb-2 font-mono text-xs font-bold uppercase tracking-[0.3em]">
                <span>Eliminatorias · tu pronóstico vs. real</span>
                <span className="text-[var(--brand)]">
                  {knockoutPts.total} pts eliminatorias
                </span>
              </h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--foreground-soft)]">
                {knockoutPts.r32 > 0 && <span>32avos: <strong>{knockoutPts.r32}×25</strong></span>}
                {knockoutPts.r16 > 0 && <span>Octavos: <strong>{knockoutPts.r16}×50</strong></span>}
                {knockoutPts.qf > 0 && <span>Cuartos: <strong>{knockoutPts.qf}×75</strong></span>}
                {knockoutPts.sf > 0 && <span>Semis: <strong>{knockoutPts.sf}×100</strong></span>}
                {knockoutPts.third > 0 && <span>3er puesto: <strong>+50</strong></span>}
                {knockoutPts.champion > 0 && <span>Campeón: <strong>+{knockoutPts.runnerUp ? "350 (ambos)" : "300"}</strong></span>}
                {knockoutPts.runnerUp > 0 && !knockoutPts.champion && <span>Subcampeón: <strong>+250</strong></span>}
              </div>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                Puntos por acertar quién avanza en cada ronda:{" "}
                32avos 25 pts · Octavos 50 pts · Cuartos 75 pts · Semis 100 pts.
                Campeón 300 · Subcampeón 250 (350 si aciertas ambos).{" "}
                <span className="text-emerald-700">Verde</span> = acertaste quién avanza.
              </p>
              <div className="mt-6 grid gap-8">
                {(
                  [
                    { stage: "ROUND_OF_32" as const, picks: prediction.knockout.r32 },
                    { stage: "ROUND_OF_16" as const, picks: prediction.knockout.r16 },
                    { stage: "QUARTER_FINALS" as const, picks: prediction.knockout.qf },
                    { stage: "SEMI_FINALS" as const, picks: prediction.knockout.sf },
                  ] as const
                ).map(({ stage, picks }) => {
                  const real = realByStage.get(stage) ?? [];
                  if (!picks.length && !real.length) return null;
                  return (
                    <div key={stage}>
                      <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.3em]">
                        {STAGE_TITLES[stage]}
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                            Tu llave
                          </div>
                          <ul className="grid gap-3">
                            {picks.length ? (
                              picks.map((p) => (
                                <PredictedMatchCard
                                  key={p.matchId}
                                  pick={p}
                                  advanced={advancedForPick(p)}
                                />
                              ))
                            ) : (
                              <li className="border border-dashed border-[var(--line)] p-4 text-sm text-[var(--foreground-muted)]">
                                No completaste esta ronda.
                              </li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                            Resultado real
                          </div>
                          <ul className="grid gap-3">
                            {real.length ? (
                              real.map((m) => <RealMatchCard key={m._id} m={m} />)
                            ) : (
                              <li className="border border-dashed border-[var(--line)] p-4 text-sm text-[var(--foreground-muted)]">
                                Aún por jugarse.
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {(prediction.knockout.third || prediction.knockout.final) && (
                  <div className="grid gap-6 md:grid-cols-2">
                    {(["third", "final"] as const).map((key) => {
                      const p = prediction.knockout[key];
                      if (!p) return null;
                      const stage = key === "third" ? "THIRD_PLACE" : "FINAL";
                      const real = realByStage.get(stage) ?? [];
                      return (
                        <div key={key}>
                          <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.3em]">
                            {STAGE_TITLES[stage]}
                          </h3>
                          <ul className="grid gap-3">
                            <PredictedMatchCard
                              pick={p}
                              advanced={advancedForPick(p)}
                            />
                            {real.map((m) => (
                              <RealMatchCard key={m._id} m={m} />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(prediction.champion || prediction.knockout.final) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {champ.myChampionCode && (
                      <div
                        className={`border-l-4 p-8 ${
                          champ.decided
                            ? champ.championCorrect
                              ? "border-emerald-600 bg-emerald-50"
                              : "border-red-400 bg-red-50/60"
                            : "border-[var(--brand)] bg-[var(--brand-soft)]"
                        }`}
                      >
                        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand-dark)]">
                          Tu campeón pronosticado
                        </p>
                        <p className="mt-3 text-4xl font-black uppercase tracking-tight text-[var(--brand-dark)]">
                          {displayTeam(
                            champ.myChampionCode,
                            champ.myChampionCode === prediction.knockout.final?.homeTeamCode
                              ? prediction.knockout.final.homeTeamName
                              : prediction.knockout.final?.awayTeamName ?? prediction.champion?.name ?? "",
                          ).name}
                        </p>
                        {champ.decided && (
                          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.2em]">
                            Real: {champ.actualChampion?.name ?? "—"}{" "}
                            {champ.championCorrect ? (
                              <span className="text-emerald-700">✓ +300</span>
                            ) : (
                              <span className="text-red-600">✗</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                    {champ.myRunnerUpCode && prediction.knockout.final && (
                      <div
                        className={`border-l-4 p-8 ${
                          champ.decided
                            ? champ.runnerUpCorrect
                              ? "border-emerald-600 bg-emerald-50"
                              : "border-red-400 bg-red-50/60"
                            : "border-[var(--line)] bg-white"
                        }`}
                      >
                        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
                          Tu subcampeón (perdedor de tu final)
                        </p>
                        <p className="mt-3 text-4xl font-black uppercase tracking-tight">
                          {(() => {
                            const f = prediction.knockout.final;
                            const ruCode = champ.myRunnerUpCode;
                            const ruName =
                              ruCode === f.homeTeamCode ? f.homeTeamName
                              : ruCode === f.awayTeamCode ? f.awayTeamName : "";
                            return ruCode ? displayTeam(ruCode, ruName).name : "—";
                          })()}
                        </p>
                        {champ.decided && (
                          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.2em]">
                            Real: {champ.actualRunnerUpTeam?.name ?? "—"}{" "}
                            {champ.runnerUpCorrect ? (
                              <span className="text-emerald-700">✓ +250</span>
                            ) : (
                              <span className="text-red-600">✗</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
