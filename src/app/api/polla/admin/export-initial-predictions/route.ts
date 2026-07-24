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

  const rows = predictions
    .sort((a, b) => {
      const nc = (nameByCode.get(a.userEmail) ?? a.userEmail).localeCompare(
        nameByCode.get(b.userEmail) ?? b.userEmail,
        "es",
      );
      return nc !== 0 ? nc : a.attempt - b.attempt;
    })
    .map((p) => ({
      Nombre: nameByCode.get(p.userEmail) ?? "",
      Cedula: p.userEmail,
      Intento: p.attempt,
      Estado: p.status,
      "Campeon inicial (codigo)": p.initialChampion?.code ?? "",
      "Campeon inicial (nombre)": p.initialChampion?.name ?? "",
      "Subcampeon inicial (codigo)": p.initialRunnerUp?.code ?? "",
      "Subcampeon inicial (nombre)": p.initialRunnerUp?.name ?? "",
    }));

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
