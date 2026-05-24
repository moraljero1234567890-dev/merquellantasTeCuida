import { NextResponse, type NextRequest } from "next/server";
import { isPollaAdminRequest } from "@/lib/polla/admin-auth";
import { pollaMatchesCollection } from "@/lib/polla/collections";
import { fetchLatestFromConfiguredProvider } from "@/lib/polla/providers";

export const dynamic = "force-dynamic";

async function handleRefresh(): Promise<Response> {
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
    return NextResponse.json({ source: provider.source, upserts: 0, warning: "Provider returned 0 matches" });
  }
  const col = await pollaMatchesCollection();
  let upserts = 0;
  for (const d of provider.docs) {
    await col.replaceOne({ _id: d._id }, d, { upsert: true });
    upserts++;
  }
  await col.createIndex({ utcDate: 1 });
  await col.createIndex({ stage: 1, group: 1, matchday: 1 });
  return NextResponse.json({ source: provider.source, upserts });
}

export async function POST(request: NextRequest) {
  if (!isPollaAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleRefresh();
}

export async function GET(request: NextRequest) {
  if (!isPollaAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleRefresh();
}
