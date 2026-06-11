import { NextResponse, type NextRequest } from "next/server";
import { fetchLatestFromConfiguredProvider } from "@/lib/polla/providers";
import { applyProviderResults } from "@/lib/polla/store";

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
    return NextResponse.json({ source: provider.source, updated: 0, warning: "No matches returned" });
  }

  const result = await applyProviderResults(provider.docs);

  return NextResponse.json({
    source: provider.source,
    ...result,
    refreshedAt: new Date().toISOString(),
  });
}
