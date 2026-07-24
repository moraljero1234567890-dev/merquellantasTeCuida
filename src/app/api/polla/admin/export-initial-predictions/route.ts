import { NextResponse, type NextRequest } from "next/server";
import { isPollaAdminRequest } from "@/lib/polla/admin-auth";
import { listAllPredictions, listAllPollaParticipants } from "@/lib/polla/store";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isPollaAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [predictions, participants] = await Promise.all([
    listAllPredictions(),
    listAllPollaParticipants(),
  ]);

  const nameByCode = new Map(participants.map((p) => [p.cedula, p.name]));

  // Derive champion/runner-up from stored final pick when initialChampion was
  // never frozen (predictions completed before the field was introduced).
  function derivedChampion(p: (typeof predictions)[number]) {
    if (p.initialChampion) return p.initialChampion;
    const final = p.knockout?.final;
    if (!final) return p.champion ?? null;
    let code: string | null = null;
    const upw = final.userPredictedWinner;
    if (typeof upw === "string" && upw !== "") {
      code = upw;
    } else {
      // upw null or undefined — fall back to stored champion
      code = p.champion?.code ?? null;
    }
    if (!code) return null;
    const name =
      code === final.homeTeamCode ? final.homeTeamName
      : code === final.awayTeamCode ? final.awayTeamName
      : p.champion?.name ?? "";
    return { code, name };
  }

  function derivedRunnerUp(p: (typeof predictions)[number]) {
    if (p.initialRunnerUp) return p.initialRunnerUp;
    const final = p.knockout?.final;
    const champ = derivedChampion(p);
    if (!final || !champ?.code) return null;
    const ruCode =
      champ.code === final.homeTeamCode ? final.awayTeamCode
      : champ.code === final.awayTeamCode ? final.homeTeamCode
      : null;
    if (!ruCode) return null;
    const ruName =
      ruCode === final.homeTeamCode ? final.homeTeamName
      : ruCode === final.awayTeamCode ? final.awayTeamName
      : "";
    return { code: ruCode, name: ruName };
  }

  const rows = predictions
    .sort((a, b) => {
      const nc = (nameByCode.get(a.userEmail) ?? a.userEmail).localeCompare(
        nameByCode.get(b.userEmail) ?? b.userEmail,
        "es",
      );
      return nc !== 0 ? nc : a.attempt - b.attempt;
    })
    .map((p) => {
      const champ = derivedChampion(p);
      const ru = derivedRunnerUp(p);
      return {
        Nombre: nameByCode.get(p.userEmail) ?? "",
        Cedula: p.userEmail,
        Intento: p.attempt,
        Estado: p.status,
        "Campeon inicial (codigo)": champ?.code ?? "",
        "Campeon inicial (nombre)": champ?.name ?? "",
        "Subcampeon inicial (codigo)": ru?.code ?? "",
        "Subcampeon inicial (nombre)": ru?.name ?? "",
      };
    });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Predicciones iniciales");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="predicciones_iniciales.xlsx"',
    },
  });
}
