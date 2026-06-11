import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { maybeRefreshMatches } from "@/lib/polla/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const db = await getDb();
  const fondoMember = await db.collection("fondo_members").findOne({
    user_id: session.user.id,
    activo: true,
  });

  if (!fondoMember) {
    return NextResponse.json({ user: null }, { status: 403 });
  }

  // Keep match results fresh whenever someone signs in (throttled, best-effort).
  await maybeRefreshMatches();

  return NextResponse.json({
    user: {
      cedula: session.user.cedula ?? "",
      email: session.user.email ?? "",
      name: session.user.nombre ?? session.user.name ?? "",
      attemptsAllowed: 10,
    },
  });
}
