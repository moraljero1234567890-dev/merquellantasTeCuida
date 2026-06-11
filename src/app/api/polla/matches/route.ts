import { NextResponse } from "next/server";
import { getAllMatches, maybeRefreshMatches } from "@/lib/polla/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Throttled, best-effort: pulls fresh scores from the live provider at most
    // once per refresh window so active users always see up-to-date results.
    await maybeRefreshMatches();
    const matches = await getAllMatches();
    return NextResponse.json({ matches, count: matches.length });
  } catch (error) {
    return NextResponse.json(
      { matches: [], count: 0, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
