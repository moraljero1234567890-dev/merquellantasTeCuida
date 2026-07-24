import { NextResponse, type NextRequest } from "next/server";
import { isPollaAdminRequest } from "@/lib/polla/admin-auth";
import { pollaPredictionsCollection } from "@/lib/polla/collections";

export const dynamic = "force-dynamic";

// Reconstructs initialChampion / initialRunnerUp for predictions that were
// completed before those fields were introduced. Logic (in priority order):
//
// 1. If final.userPredictedWinner is a string (set when real results first
//    overwrote the final pick): that IS the user's original champion pick.
//    Runner-up = the other team in the final slot.
//
// 2. Else if prediction.champion exists: use it as the champion.
//    Runner-up = the other team in the final slot.
//
// 3. Otherwise: cannot reconstruct — leave null.
//
// The ?dryRun=true query param reports what would change without writing.

export async function POST(request: NextRequest) {
  if (!isPollaAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";

  const col = await pollaPredictionsCollection();
  const predictions = await col
    .find({ initialChampion: { $exists: false } })
    .toArray();

  const results: Array<{
    id: string;
    cedula: string;
    attempt: number;
    status: string;
    champion: string | null;
    runnerUp: string | null;
    source: string;
  }> = [];

  for (const p of predictions) {
    if (p.status === "draft") continue; // never completed — nothing to backfill

    const final = p.knockout?.final ?? null;
    let champCode: string | null = null;
    let champName: string | null = null;
    let ruCode: string | null = null;
    let ruName: string | null = null;
    let source = "none";

    if (final) {
      if (final.userPredictedWinner !== undefined) {
        // Real results overwrote this pick at least once — userPredictedWinner
        // is the preserved original.
        champCode = final.userPredictedWinner ?? null;
        source = "userPredictedWinner";
      } else if (p.champion?.code) {
        champCode = p.champion.code;
        source = "prediction.champion";
      }

      if (champCode) {
        champName =
          champCode === final.homeTeamCode ? final.homeTeamName
          : champCode === final.awayTeamCode ? final.awayTeamName
          : p.champion?.name ?? null;

        ruCode =
          champCode === final.homeTeamCode ? final.awayTeamCode
          : champCode === final.awayTeamCode ? final.homeTeamCode
          : null;

        ruName =
          ruCode === final.homeTeamCode ? final.homeTeamName
          : ruCode === final.awayTeamCode ? final.awayTeamName
          : null;
      }
    }

    results.push({
      id: p._id,
      cedula: p.userEmail,
      attempt: p.attempt,
      status: p.status,
      champion: champCode ? `${champCode} (${champName})` : null,
      runnerUp: ruCode ? `${ruCode} (${ruName})` : null,
      source,
    });

    if (!dryRun) {
      await col.updateOne(
        { _id: p._id },
        {
          $set: {
            initialChampion: champCode && champName ? { code: champCode, name: champName } : null,
            initialRunnerUp: ruCode && ruName ? { code: ruCode, name: ruName } : null,
          },
        },
      );
    }
  }

  return NextResponse.json({
    dryRun,
    totalProcessed: results.length,
    results,
  });
}
