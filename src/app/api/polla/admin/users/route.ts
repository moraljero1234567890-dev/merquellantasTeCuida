import { NextResponse, type NextRequest } from "next/server";
import { isPollaAdminRequest } from "@/lib/polla/admin-auth";
import { createPollaUser, listAllPollaParticipants, listAllPollaUsers } from "@/lib/polla/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isPollaAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const participants = await listAllPollaParticipants();
    return NextResponse.json({ users: participants });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: "Database error", detail: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPollaAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { cedula?: string; email?: string; name?: string; password?: string; attemptsAllowed?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const cedula = (body.cedula ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";
  const attemptsAllowed = Number(body.attemptsAllowed ?? 10);
  if (!cedula || cedula.length < 4) {
    return NextResponse.json({ error: "Cedula must be at least 4 characters" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
  }
  if (!Number.isFinite(attemptsAllowed) || attemptsAllowed < 1 || attemptsAllowed > 20) {
    return NextResponse.json({ error: "attemptsAllowed must be between 1 and 20" }, { status: 400 });
  }
  try {
    const user = await createPollaUser({ cedula, email, name, password, attemptsAllowed });
    return NextResponse.json({
      user: { cedula: user.cedula, email: user.email, name: user.name, attemptsAllowed: user.attemptsAllowed, createdAt: user.createdAt },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: "Database error", detail: msg }, { status: 500 });
  }
}
