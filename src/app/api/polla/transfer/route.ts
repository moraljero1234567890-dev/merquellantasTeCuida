import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPollaUserByCedula, getEffectiveAttempts, createPollaUser } from "@/lib/polla/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    giverCedula: string;
    recipientCedula?: string;
    createNew?: boolean;
    newName?: string;
    newPassword?: string;
    newEmail?: string;
    newCedula?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const giverCedula = (body.giverCedula ?? "").trim();
  if (!giverCedula) {
    return NextResponse.json({ error: "Missing giver" }, { status: 400 });
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

  let recipientUid: string;

  if (body.createNew) {
    const email = (body.newEmail ?? "").trim().toLowerCase();
    const cedula = (body.newCedula ?? "").trim();
    const name = (body.newName ?? "").trim();
    const password = body.newPassword ?? "";

    if (!email) {
      return NextResponse.json({ error: "El correo es obligatorio para crear un usuario nuevo" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required for new user" }, { status: 400 });
    }
    if (!password || password.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }

    recipientUid = cedula || email;

    // Check if user already exists by email or cedula
    const existingByEmail = await getPollaUserByCedula(email);
    const existingByCedula = cedula ? await getPollaUserByCedula(cedula) : null;
    if (existingByEmail || existingByCedula) {
      return NextResponse.json({ error: "Ya existe un usuario con ese correo o cédula." }, { status: 409 });
    }

    if (recipientUid === giverCedula) {
      return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 });
    }

    await createPollaUser({
      cedula,
      email,
      name,
      password,
      attemptsAllowed: 0,
    });
  } else {
    const recipientIdentifier = (body.recipientCedula ?? "").trim();
    if (!recipientIdentifier) {
      return NextResponse.json({ error: "Ingresa la cédula o correo del destinatario" }, { status: 400 });
    }
    if (recipientIdentifier === giverCedula) {
      return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 });
    }
    recipientUid = recipientIdentifier;
  }

  const recipient = await getPollaUserByCedula(recipientUid);
  if (!recipient) {
    return NextResponse.json({ error: "No encontramos al destinatario. Verifica la cédula o correo, o crea un usuario nuevo." }, { status: 404 });
  }
  // Use the canonical uid from the looked-up recipient
  recipientUid = recipient.cedula;

  // Record adjustments
  const db = await getDb();
  const now = new Date();
  await db.collection("polla_attempt_adjustments").insertOne({
    cedula: giverCedula,
    delta: -1,
    reason: `Gifted to ${recipientUid}`,
    counterpart: recipientUid,
    createdAt: now,
  });
  await db.collection("polla_attempt_adjustments").insertOne({
    cedula: recipientUid,
    delta: 1,
    reason: `Received from ${giverCedula}`,
    counterpart: giverCedula,
    createdAt: now,
  });

  const newGiverAttempts = await getEffectiveAttempts(giverCedula);
  const newRecipientAttempts = await getEffectiveAttempts(recipientUid);

  return NextResponse.json({
    success: true,
    giver: { cedula: giverCedula, attemptsRemaining: newGiverAttempts },
    recipient: { cedula: recipientUid, name: recipient.name, attemptsNow: newRecipientAttempts },
  });
}
