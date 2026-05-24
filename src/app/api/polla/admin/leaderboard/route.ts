import { NextResponse, type NextRequest } from "next/server";
import { isPollaAdminRequest } from "@/lib/polla/admin-auth";
import { computeLeaderboard, POINTS } from "@/lib/polla/scoring";
import { getAllMatches, listAllPredictions, listAllPollaParticipants } from "@/lib/polla/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isPollaAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [matches, predictions, users] = await Promise.all([
      getAllMatches(),
      listAllPredictions(),
      listAllPollaParticipants(),
    ]);
    const rows = computeLeaderboard(
      matches,
      predictions,
      users.map((u) => ({ email: u.cedula, name: u.name, attemptsAllowed: u.attemptsAllowed })),
    );
    const finishedGroup = matches.filter((m) => m.stage === "GROUP_STAGE" && m.status === "FINISHED").length;
    const finishedKnockout = matches.filter((m) => m.stage !== "GROUP_STAGE" && m.status === "FINISHED").length;
    return NextResponse.json({
      rows,
      stats: {
        totalUsers: users.length,
        totalPredictions: predictions.length,
        finishedGroupMatches: finishedGroup,
        finishedKnockoutMatches: finishedKnockout,
      },
      points: POINTS,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: "Database error", detail: msg }, { status: 500 });
  }
}
