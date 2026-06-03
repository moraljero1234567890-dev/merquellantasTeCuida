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

  return NextResponse.json({
    user: { cedula: user.cedula, name: user.name, attemptsAllowed: effectiveAttempts },
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
