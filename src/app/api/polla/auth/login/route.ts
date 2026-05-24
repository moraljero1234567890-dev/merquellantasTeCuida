import { NextResponse } from "next/server";
import { authenticatePollaUser } from "@/lib/polla/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { cedula?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const cedula = (body.cedula ?? "").trim();
  const password = body.password ?? "";
  if (!cedula || !password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  try {
    const user = await authenticatePollaUser(cedula, password);
    if (!user) {
      return NextResponse.json({ error: "User not found or not authorized" }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    console.error("Polla login error:", err);
    return NextResponse.json({ error: "Database error", detail: msg }, { status: 500 });
  }
}
