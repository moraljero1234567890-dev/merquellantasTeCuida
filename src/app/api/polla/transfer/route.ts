import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPollaUserByCedula, getEffectiveAttempts, createPollaUser } from "@/lib/polla/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    giverCedula: string;
    recipientCedula: string;
    createNew?: boolean;
    newName?: string;
    newPassword?: string;
    newEmail?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const giverCedula = (body.giverCedula ?? "").trim();
  const recipientCedula = (body.recipientCedula ?? "").trim();

  if (!giverCedula || !recipientCedula) {
    return NextResponse.json({ error: "Missing cedula" }, { status: 400 });
  }
  if (giverCedula === recipientCedula) {
    return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 });
  }

  // Verify giver exists and has attempts to spare
  const giver = await getPollaUserByCedula(giverCedula);
  if (!giver) {
    return NextResponse.json({ error: "Giver not found" }, { status: 404 });
  }
  const giverEffective = await getEffectiveAttempts(giverCedula);
  if (giverEffective <= 1) {
    return NextResponse.json({ error: "No tienes intentos disponibles para regalar. Debes conservar al menos 1." }, { status: 400 });
  }

  // Handle recipient
  let recipient = await getPollaUserByCedula(recipientCedula);
  if (!recipient && body.createNew) {
    const name = (body.newName ?? "").trim();
    const password = body.newPassword ?? "";
    if (!name) {
      return NextResponse.json({ error: "Name is required for new user" }, { status: 400 });
    }
    if (!password || password.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }
    await createPollaUser({
      cedula: recipientCedula,
      email: (body.newEmail ?? "").trim().toLowerCase(),
      name,
      password,
      attemptsAllowed: 0, // Start with 0, the transfer will add 1
    });
    recipient = await getPollaUserByCedula(recipientCedula);
  }

  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found. Check the cedula or create a new user." }, { status: 404 });
  }

  // Record adjustments
  const db = await getDb();
  const now = new Date();
  await db.collection("polla_attempt_adjustments").insertOne({
    cedula: giverCedula,
    delta: -1,
    reason: `Gifted to ${recipientCedula}`,
    counterpart: recipientCedula,
    createdAt: now,
  });
  await db.collection("polla_attempt_adjustments").insertOne({
    cedula: recipientCedula,
    delta: 1,
    reason: `Received from ${giverCedula}`,
    counterpart: giverCedula,
    createdAt: now,
  });

  const newGiverAttempts = await getEffectiveAttempts(giverCedula);
  const newRecipientAttempts = await getEffectiveAttempts(recipientCedula);

  return NextResponse.json({
    success: true,
    giver: { cedula: giverCedula, attemptsRemaining: newGiverAttempts },
    recipient: { cedula: recipientCedula, name: recipient.name, attemptsNow: newRecipientAttempts },
  });
}
