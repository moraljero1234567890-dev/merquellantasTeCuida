import { NextResponse, type NextRequest } from "next/server";
import { isPollaAdminRequest } from "@/lib/polla/admin-auth";
import { pollaPredictionsCollection } from "@/lib/polla/collections";

export const dynamic = "force-dynamic";

// Reconstructs initialChampion / initialRunnerUp for predictions missing those
// fields. Priority order:
//
// 1. final.userPredictedWinner is a non-null string → real results overwrote the
//    final pick at least once and captured the user's original winner pick. Use it.
//
// 2. prediction.champion is set → the stored champion from the user's bracket
//    (preserved by userPickedChampionFromFinal on every save). Use it.
//    This also covers the case where userPredictedWinner is explicitly null
//    (user's predicted finalists ≠ actual finalists) but the DB champion field
//    still reflects their original pick from before actual standings kicked in.
//
// 3. Cannot reconstruct — leave null.
//
// Runner-up is always derived as the other team in the final slot.
// ?dryRun=true reports what would change without writing.
// ?force=true re-processes records that were already backfilled to null.

export async function POST(request: NextRequest) {
  if (!isPollaAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
  const force = request.nextUrl.searchParams.get("force") === "true";

  const col = await pollaPredictionsCollection();

  // With ?force=true, re-process ALL completed predictions (including those
  // previously backfilled to null). Without it, only process missing ones.
  const query = force
    ? { status: { $in: ["complete", "locked"] as const } }
    : { initialChampion: { $exists: false } };

  const predictions = await col.find(query).toArray();

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
    const final = p.knockout?.final ?? null;
    let champCode: string | null = null;
    let champName: string | null = null;
    let ruCode: string | null = null;
    let ruName: string | null = null;
    let source = "none";

    if (final) {
      const upw = final.userPredictedWinner;

      if (typeof upw === "string" && upw !== "") {
        // Real results overwrote the final pick and captured the user's winner.
        champCode = upw;
        source = "userPredictedWinner";
      } else if (p.champion?.code) {
        // Fall through to the stored champion (covers upw=null and upw=undefined).
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
    force,
    totalProcessed: results.length,
    filled: results.filter((r) => r.champion !== null).length,
    stillNull: results.filter((r) => r.champion === null).length,
    results,
  });
}
