import "server-only";
import type { NextRequest } from "next/server";

export function isPollaAdminRequest(request: NextRequest): boolean {
  const expected = process.env.POLLA_ADMIN_TOKEN;
  if (!expected) return false;
  const got =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("token") ??
    "";
  return got === expected;
}
