import { NextResponse, type NextRequest } from "next/server";
import {
  getAllMatches,
  getPollaUserByCedula,
  getPrediction,
  isTournamentLocked,
  upsertPrediction,
  getLockStatus,
  getKnockoutLockInfo,
  lockedKnockoutMatchIds,
  extractActualGroupScores,
} from "@/lib/polla/store";
import {
  buildKnockoutFromGroup,
  buildR32SeedsFromActual,
  championFromFinal,
  userPickedChampionFromFinal,
  computeGroupStandings,
  isGroupStageComplete,
} from "@/lib/polla/bracket";
import type { GroupScore, KnockoutPick, PredictionDoc } from "@/lib/polla/types";

export const dynamic = "force-dynamic";

type Params = { attempt: string };

function parseAttempt(value: string): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return n;
}

function emptyPrediction(cedula: string, attempt: number): PredictionDoc {
  return {
    _id: `${cedula}#${attempt}`,
    userEmail: cedula,
    attempt,
    status: "draft",
    groupScores: {},
    knockout: { r32: [], r16: [], qf: [], sf: [], third: null, final: null },
    champion: null,
    updatedAt: new Date(),
    completedAt: null,
  };
}

async function loadOrCreate(cedula: string, attempt: number): Promise<PredictionDoc> {
  const existing = await getPrediction(cedula, attempt);
  return existing ?? emptyPrediction(cedula, attempt);
}

async function recomputeKnockout(prediction: PredictionDoc, useActual: boolean): Promise<PredictionDoc> {
  const matches = await getAllMatches();
  const groupMatches = matches.filter((m) => m.stage === "GROUP_STAGE" && m.group);

  if (useActual) {
    const actualScores = extractActualGroupScores(matches);
    const standings = computeGroupStandings(groupMatches, actualScores);
    // Prefer the real, already-decided Round of 32 fixtures (parsed from
    // Wikipedia) over our computed third-place allocation, which can't
    // reproduce FIFA's official slotting. Falls back to the computed seeds
    // when the real bracket isn't fully available yet.
    const actualR32 = matches
      .filter((m) => m.stage === "ROUND_OF_32")
      .map((m) => ({
        home: { code: m.home.code, name: m.home.name },
        away: { code: m.away.code, name: m.away.name },
      }));
    const r32Override = buildR32SeedsFromActual(standings, actualR32) ?? undefined;

    // Already-FINISHED knockout games are fixed reality: feed their results in so
    // the real winner propagates up the bracket (lets users' brackets flow past
    // games they couldn't predict, e.g. the first R32 game already played).
    const actualByPair = new Map<string, { winnerCode: string | null; byCode: Record<string, number> }>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE" || m.status !== "FINISHED") continue;
      const ft = m.score?.fullTime;
      if (!ft || !m.home?.code || !m.away?.code) continue;
      const pens = m.score?.penalties;
      const winnerCode =
        ft.home > ft.away ? m.home.code
        : ft.away > ft.home ? m.away.code
        : pens && pens.home > pens.away ? m.home.code
        : pens && pens.away > pens.home ? m.away.code
        : null;
      const key = [m.home.code, m.away.code].sort().join("|");
      actualByPair.set(key, { winnerCode, byCode: { [m.home.code]: ft.home, [m.away.code]: ft.away } });
    }
    // For FT-draw matches where penalty scores aren't stored (winnerCode=null),
    // infer the winner from whichever team appears in the next round's fixtures.
    const NEXT_STAGE: Partial<Record<string, string>> = {
      ROUND_OF_32: "ROUND_OF_16",
      ROUND_OF_16: "QUARTER_FINALS",
      QUARTER_FINALS: "SEMI_FINALS",
      SEMI_FINALS: "FINAL",
    };
    const teamsPerStageAP = new Map<string, Set<string>>();
    for (const m of matches) {
      if (m.home?.code && m.away?.code) {
        const s = teamsPerStageAP.get(m.stage) ?? new Set<string>();
        s.add(m.home.code); s.add(m.away.code);
        teamsPerStageAP.set(m.stage, s);
      }
    }
    for (const [key, entry] of actualByPair) {
      if (entry.winnerCode !== null) continue; // already resolved
      const codes = Object.keys(entry.byCode);
      if (codes.length !== 2) continue;
      const [codeA, codeB] = codes;
      // Find which stage this pair belongs to
      const pairMatch = matches.find(
        (m) => m.status === "FINISHED" && m.home?.code && m.away?.code &&
          [m.home.code, m.away.code].sort().join("|") === key,
      );
      if (!pairMatch) continue;
      const nextStage = NEXT_STAGE[pairMatch.stage];
      if (!nextStage) continue;
      const nextTeams = teamsPerStageAP.get(nextStage) ?? new Set<string>();
      if (nextTeams.has(codeA) && !nextTeams.has(codeB)) entry.winnerCode = codeA;
      else if (nextTeams.has(codeB) && !nextTeams.has(codeA)) entry.winnerCode = codeB;
    }

    const knockout = buildKnockoutFromGroup(standings, prediction.knockout, r32Override, actualByPair);
    // Use userPickedChampionFromFinal so prediction.champion always reflects
    // the user's original pick, even after the final is played and applyActual
    // overwrites the final pick's home/away with real scores.
    const champion = userPickedChampionFromFinal(knockout.final);
    return { ...prediction, knockout, champion };
  }

  if (!isGroupStageComplete(groupMatches, prediction.groupScores)) {
    return {
      ...prediction,
      knockout: { r32: [], r16: [], qf: [], sf: [], third: null, final: null },
      champion: null,
    };
  }
  const standings = computeGroupStandings(groupMatches, prediction.groupScores);
  const knockout = buildKnockoutFromGroup(standings, prediction.knockout);
  const champion = championFromFinal(knockout.final);
  return { ...prediction, knockout, champion };
}

export async function GET(request: NextRequest, ctx: { params: Promise<Params> }) {
  const { attempt: rawAttempt } = await ctx.params;
  const attempt = parseAttempt(rawAttempt);
  if (attempt == null) {
    return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
  }
  const cedula = (request.nextUrl.searchParams.get("cedula") ?? "").trim();
  if (!cedula) {
    return NextResponse.json({ error: "Missing cedula" }, { status: 400 });
  }
  const user = await getPollaUserByCedula(cedula);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  const { getEffectiveAttempts } = await import("@/lib/polla/store");
  const effectiveAttempts = await getEffectiveAttempts(cedula);
  if (attempt > effectiveAttempts) {
    return NextResponse.json({ error: "Attempt exceeds allowed quota" }, { status: 403 });
  }
  let prediction = await loadOrCreate(cedula, attempt);
  const lockStatus = await getLockStatus();

  // If actual standings should be used, recompute bracket from actual results
  if (lockStatus.useActualStandings) {
    try {
      prediction = await recomputeKnockout(prediction, true);
      prediction.updatedAt = new Date();
      await upsertPrediction(prediction);
    } catch (err) {
      console.error("recomputeKnockout failed (returning raw prediction):", err);
    }
  }

  const lockInfo = await getKnockoutLockInfo();
  const lockedMatchIds = lockedKnockoutMatchIds(prediction.knockout, lockInfo);

  return NextResponse.json({ prediction, lockStatus, lockedMatchIds });
}

type PostBody =
  | { kind: "group"; cedula: string; matchId: string; home: number; away: number }
  | { kind: "knockout"; cedula: string; matchId: string; home: number | null; away: number | null; penaltyWinner?: "home" | "away" | null };

export async function POST(request: NextRequest, ctx: { params: Promise<Params> }) {
  const { attempt: rawAttempt } = await ctx.params;
  const attempt = parseAttempt(rawAttempt);
  if (attempt == null) {
    return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
  }
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const cedula = (body.cedula ?? "").trim();
  if (!cedula) {
    return NextResponse.json({ error: "Missing cedula" }, { status: 400 });
  }
  const user = await getPollaUserByCedula(cedula);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  const { getEffectiveAttempts } = await import("@/lib/polla/store");
  const effectiveAttempts = await getEffectiveAttempts(cedula);
  if (attempt > effectiveAttempts) {
    return NextResponse.json({ error: "Attempt exceeds allowed quota" }, { status: 403 });
  }
  const lockStatus = await getLockStatus();

  let prediction = await loadOrCreate(cedula, attempt);
  if (prediction.status === "locked") {
    return NextResponse.json({ error: "Prediction locked" }, { status: 423 });
  }

  if (body.kind === "group" && lockStatus.groupLocked) {
    return NextResponse.json({ error: "Group predictions are locked" }, { status: 423 });
  }

  if (body.kind === "knockout") {
    if (!lockStatus.knockoutOpen) {
      return NextResponse.json({ error: "Knockout predictions are locked" }, { status: 423 });
    }
    // Per-match lock: a game can be edited until its real fixture kicks off.
    const lockInfo = await getKnockoutLockInfo();
    const lockedIds = lockedKnockoutMatchIds(prediction.knockout, lockInfo);
    if (lockedIds.includes(body.matchId)) {
      return NextResponse.json({ error: "Este partido ya comenzó y no se puede editar" }, { status: 423 });
    }
  }

  if (body.kind === "group") {
    const home = Number(body.home);
    const away = Number(body.away);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 20 || away > 20) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    const next: GroupScore = { home, away };
    prediction = { ...prediction, groupScores: { ...prediction.groupScores, [body.matchId]: next } };
  } else if (body.kind === "knockout") {
    const home = body.home == null ? null : Number(body.home);
    const away = body.away == null ? null : Number(body.away);
    if (home != null && (!Number.isInteger(home) || home < 0 || home > 20)) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    if (away != null && (!Number.isInteger(away) || away < 0 || away > 20)) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    const nextKnockout: PredictionDoc["knockout"] = {
      r32: [...prediction.knockout.r32],
      r16: [...prediction.knockout.r16],
      qf: [...prediction.knockout.qf],
      sf: [...prediction.knockout.sf],
      third: prediction.knockout.third,
      final: prediction.knockout.final,
    };
    const penaltyWinner = body.penaltyWinner ?? null;
    const arrayStages: Array<"r32" | "r16" | "qf" | "sf"> = ["r32", "r16", "qf", "sf"];
    let found = false;
    for (const stage of arrayStages) {
      const arr = nextKnockout[stage];
      const idx = arr.findIndex((p) => p.matchId === body.matchId);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], home, away, penaltyWinner };
        found = true;
        break;
      }
    }
    if (!found && nextKnockout.third?.matchId === body.matchId) {
      nextKnockout.third = { ...nextKnockout.third, home, away, penaltyWinner };
      found = true;
    }
    if (!found && nextKnockout.final?.matchId === body.matchId) {
      nextKnockout.final = { ...nextKnockout.final, home, away, penaltyWinner };
      found = true;
    }
    if (!found) {
      return NextResponse.json({ error: "Unknown knockout match" }, { status: 404 });
    }
    prediction = { ...prediction, knockout: nextKnockout };
  } else {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  prediction = await recomputeKnockout(prediction, lockStatus.useActualStandings);

  // Auto-complete when all sections are filled
  const allGroupsFilled = Object.keys(prediction.groupScores).length >= 72;
  const allKnockoutFilled = [
    ...prediction.knockout.r32,
    ...prediction.knockout.r16,
    ...prediction.knockout.qf,
    ...prediction.knockout.sf,
    ...(prediction.knockout.third ? [prediction.knockout.third] : []),
    ...(prediction.knockout.final ? [prediction.knockout.final] : []),
  ].every((p) => p.home != null && p.away != null);
  const hasChampion = !!prediction.champion;

  if (allGroupsFilled && allKnockoutFilled && hasChampion && prediction.status === "draft") {
    prediction = { ...prediction, status: "complete", completedAt: new Date() };
  }

  prediction.updatedAt = new Date();
  await upsertPrediction(prediction);

  const lockInfo = await getKnockoutLockInfo();
  const lockedMatchIds = lockedKnockoutMatchIds(prediction.knockout, lockInfo);
  return NextResponse.json({ prediction, lockStatus, lockedMatchIds });
}
