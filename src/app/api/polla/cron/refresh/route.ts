import { NextResponse, type NextRequest } from "next/server";
import { pollaMatchesCollection } from "@/lib/polla/collections";
import { fetchLatestFromConfiguredProvider } from "@/lib/polla/providers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET ?? process.env.POLLA_ADMIN_TOKEN;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let provider;
  try {
    provider = await fetchLatestFromConfiguredProvider();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provider error" },
      { status: 502 },
    );
  }

  if (!provider.docs.length) {
    return NextResponse.json({ source: provider.source, upserts: 0, warning: "No matches returned" });
  }

  const col = await pollaMatchesCollection();
  let upserts = 0;
  for (const d of provider.docs) {
    await col.replaceOne({ _id: d._id }, d, { upsert: true });
    upserts++;
  }
  await col.createIndex({ utcDate: 1 });
  await col.createIndex({ stage: 1, group: 1, matchday: 1 });

  return NextResponse.json({ source: provider.source, upserts, refreshedAt: new Date().toISOString() });
}
