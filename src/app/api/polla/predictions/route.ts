import { NextResponse } from "next/server";
import { getPollaUserByCedula, listPredictionsForUser } from "@/lib/polla/store";

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
  const predictions = await listPredictionsForUser(cedula);
  return NextResponse.json({
    user: { cedula: user.cedula, name: user.name, attemptsAllowed: user.attemptsAllowed },
    predictions: predictions.map((p) => ({
      attempt: p.attempt,
      status: p.status,
      champion: p.champion,
      updatedAt: p.updatedAt,
      completedAt: p.completedAt,
      groupCount: Object.keys(p.groupScores ?? {}).length,
    })),
  });
}
