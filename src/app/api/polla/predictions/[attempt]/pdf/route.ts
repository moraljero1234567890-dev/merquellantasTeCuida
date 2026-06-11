import { type NextRequest, NextResponse } from "next/server";
import {
  getAllMatches,
  getEffectiveAttempts,
  getPollaUserByCedula,
  getPrediction,
} from "@/lib/polla/store";
import { renderPredictionPdf } from "@/lib/polla/pdf";
import type { PredictionDoc } from "@/lib/polla/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { attempt: string };

function parseAttempt(value: string): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return n;
}

function emptyPrediction(cedula: string, attempt: number): PredictionDoc {
  return {
    _id: `${cedula}#${attempt}`,
    userEmail: cedula,
    attempt,
    status: "draft",
    groupScores: {},
    knockout: { r32: [], r16: [], qf: [], sf: [], third: null, final: null },
    champion: null,
    updatedAt: new Date(),
    completedAt: null,
  };
}

function formatGeneratedAt(): string {
  // Colombia time (UTC-5), no DST.
  const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const d = now.getUTCDate();
  const mo = months[now.getUTCMonth()];
  const y = now.getUTCFullYear();
  let h = now.getUTCHours();
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${d} ${mo} ${y}, ${h}:${min} ${ampm}`;
}

export async function GET(request: NextRequest, ctx: { params: Promise<Params> }) {
  const { attempt: rawAttempt } = await ctx.params;
  const attempt = parseAttempt(rawAttempt);
  if (attempt == null) {
    return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
  }
  const cedula = (request.nextUrl.searchParams.get("cedula") ?? "").trim();
  if (!cedula) {
    return NextResponse.json({ error: "Missing cedula" }, { status: 400 });
  }
  const user = await getPollaUserByCedula(cedula);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  const effectiveAttempts = await getEffectiveAttempts(cedula);
  if (attempt > effectiveAttempts) {
    return NextResponse.json({ error: "Attempt exceeds allowed quota" }, { status: 403 });
  }

  // The stored prediction doc is the source of truth: the predict page's GET
  // handler recomputes and persists the bracket (incl. actual-standings mode)
  // on every load, so whatever is stored matches what the user sees on screen.
  const [matches, existing] = await Promise.all([
    getAllMatches(),
    getPrediction(cedula, attempt),
  ]);
  const prediction = existing ?? emptyPrediction(cedula, attempt);

  const pdf = await renderPredictionPdf({
    attempt,
    participantName: user.name || cedula,
    cedula,
    generatedAt: formatGeneratedAt(),
    matches,
    prediction,
  });

  const safeName = (user.name || cedula)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "boleta";
  const filename = `polla-${safeName}-intento-${attempt}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
