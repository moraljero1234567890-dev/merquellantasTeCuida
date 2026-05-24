import { NextResponse } from "next/server";
import { getAllMatches } from "@/lib/polla/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await getAllMatches();
    return NextResponse.json({ matches, count: matches.length });
  } catch (error) {
    return NextResponse.json(
      { matches: [], count: 0, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
