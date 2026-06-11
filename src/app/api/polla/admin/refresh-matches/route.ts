import { NextResponse, type NextRequest } from "next/server";
import { isPollaAdminRequest } from "@/lib/polla/admin-auth";
import { fetchLatestFromConfiguredProvider } from "@/lib/polla/providers";
import { applyProviderResults } from "@/lib/polla/store";

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
    return NextResponse.json({ source: provider.source, updated: 0, warning: "Provider returned 0 matches" });
  }
  const result = await applyProviderResults(provider.docs);
  return NextResponse.json({ source: provider.source, ...result });
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
