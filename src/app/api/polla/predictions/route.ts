import { NextResponse } from "next/server";
import { getPollaUserByCedula, getEffectiveAttempts, getAllMatches, listPredictionsForUser } from "@/lib/polla/store";
import { computeLeaderboard } from "@/lib/polla/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cedula = (searchParams.get("cedula") ?? "").trim();
  if (!cedula) {
    return NextResponse.json({ error: "Missing cedula" }, { status: 400 });
  }
  const user = await getPollaUserByCedula(cedula);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  const [predictions, effectiveAttempts, matches] = await Promise.all([
    listPredictionsForUser(cedula),
    getEffectiveAttempts(cedula),
    getAllMatches(),
  ]);

  // Score each of this user's attempts (predictions are keyed by userEmail === cedula).
  const rows = computeLeaderboard(matches, predictions, [
    { email: cedula, name: user.name, attemptsAllowed: effectiveAttempts },
  ]);
  const breakdownByAttempt = new Map(rows.map((r) => [r.attempt, r.breakdown]));

  // Determine real champion and runner-up from the final match.
  let realChampion: { code: string; name: string } | null = null;
  let realRunnerUp: { code: string; name: string } | null = null;
  for (const m of matches) {
    if (m.stage !== "FINAL" || m.status !== "FINISHED" || !m.score?.fullTime) continue;
    const ft = m.score.fullTime;
    const pens = m.score.penalties;
    let winnerCode: string | null = null;
    if (ft.home > ft.away) winnerCode = m.home.code;
    else if (ft.away > ft.home) winnerCode = m.away.code;
    else if (pens) winnerCode = pens.home > pens.away ? m.home.code : pens.away > pens.home ? m.away.code : null;
    if (!winnerCode) continue;
    realChampion = winnerCode === m.home.code ? { code: m.home.code, name: m.home.name } : { code: m.away.code, name: m.away.name };
    realRunnerUp = winnerCode === m.home.code ? { code: m.away.code, name: m.away.name } : { code: m.home.code, name: m.home.name };
    break;
  }

  return NextResponse.json({
    user: { cedula: user.cedula, name: user.name, attemptsAllowed: effectiveAttempts },
    realChampion,
    realRunnerUp,
    predictions: predictions.map((p) => {
      const breakdown = breakdownByAttempt.get(p.attempt) ?? null;
      return {
        attempt: p.attempt,
        status: p.status,
        champion: p.champion,
        updatedAt: p.updatedAt,
        completedAt: p.completedAt,
        groupCount: Object.keys(p.groupScores ?? {}).length,
        points: breakdown?.total ?? 0,
        breakdown,
      };
    }),
  });
}
