import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatDate } from "@/data/polla/worldcup2026";
import { displayTeam } from "./team-display";
import type { MatchDoc, PredictionDoc, KnockoutPick } from "./types";

const BRAND = "#ff9900";
const BRAND_DARK = "#cc7a00";
const BRAND_SOFT = "#fff4e0";
const INK = "#171717";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 44,
    paddingHorizontal: 40,
    fontSize: 9,
    color: INK,
    fontFamily: "Helvetica",
  },
  headerBar: {
    backgroundColor: INK,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  kicker: {
    color: BRAND,
    fontSize: 8,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metaLabel: { color: "#9ca3af", fontSize: 7.5, letterSpacing: 1.5, textTransform: "uppercase" },
  metaValue: { color: "#ffffff", fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
    paddingBottom: 4,
    marginTop: 16,
    marginBottom: 8,
  },
  groupBlock: { marginBottom: 10 },
  groupHeader: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: BRAND_DARK,
    marginBottom: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 3,
  },
  date: { width: 48, color: MUTED, fontSize: 7.5 },
  home: { flex: 1, textAlign: "right", paddingRight: 8 },
  away: { flex: 1, textAlign: "left", paddingLeft: 8 },
  scoreBox: {
    width: 46,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  scoreEmpty: {
    width: 46,
    textAlign: "center",
    color: MUTED,
    fontSize: 10,
  },
  pen: { color: BRAND_DARK, fontSize: 7, textAlign: "center", marginTop: 1 },
  stageBlock: { marginBottom: 8 },
  stageHeader: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: BRAND_DARK,
    marginBottom: 3,
  },
  championBox: {
    marginTop: 14,
    backgroundColor: BRAND_SOFT,
    borderLeftWidth: 4,
    borderLeftColor: BRAND,
    padding: 14,
  },
  championLabel: {
    color: BRAND_DARK,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  championName: {
    color: BRAND_DARK,
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    color: MUTED,
    fontSize: 7,
  },
});

const STAGE_TITLES: Record<KnockoutPick["stage"], string> = {
  ROUND_OF_32: "Dieciseisavos",
  ROUND_OF_16: "Octavos",
  QUARTER_FINALS: "Cuartos",
  SEMI_FINALS: "Semifinales",
  THIRD_PLACE: "Tercer puesto",
  FINAL: "Final",
};

function teamName(code: string, name: string): string {
  return displayTeam(code, name).name || name || code || "—";
}

function MatchRow({
  date,
  homeLabel,
  awayLabel,
  home,
  away,
  penaltyWinner,
}: {
  date?: string;
  homeLabel: string;
  awayLabel: string;
  home: number | null;
  away: number | null;
  penaltyWinner?: "home" | "away" | null;
}) {
  const filled = home != null && away != null;
  const isTie = filled && home === away;
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.date}>{date ?? ""}</Text>
      <Text style={styles.home}>{homeLabel}</Text>
      {filled ? (
        <View style={{ width: 46 }}>
          <Text style={styles.scoreBox}>
            {home} - {away}
          </Text>
          {isTie && penaltyWinner && (
            <Text style={styles.pen}>
              pen: {penaltyWinner === "home" ? homeLabel : awayLabel}
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.scoreEmpty}>—</Text>
      )}
      <Text style={styles.away}>{awayLabel}</Text>
    </View>
  );
}

function KnockoutSection({
  title,
  picks,
}: {
  title: string;
  picks: KnockoutPick[];
}) {
  if (!picks.length) return null;
  return (
    <View style={styles.stageBlock} wrap={false}>
      <Text style={styles.stageHeader}>{title}</Text>
      {picks.map((p) => (
        <MatchRow
          key={p.matchId}
          homeLabel={teamName(p.homeTeamCode, p.homeTeamName)}
          awayLabel={teamName(p.awayTeamCode, p.awayTeamName)}
          home={p.home}
          away={p.away}
          penaltyWinner={p.penaltyWinner}
        />
      ))}
    </View>
  );
}

export type PredictionPdfInput = {
  attempt: number;
  participantName: string;
  cedula: string;
  generatedAt: string;
  matches: MatchDoc[];
  prediction: PredictionDoc;
};

function PredictionDocument({
  attempt,
  participantName,
  cedula,
  generatedAt,
  matches,
  prediction,
}: PredictionPdfInput) {
  const groupMatches = matches
    .filter((m) => m.stage === "GROUP_STAGE" && m.group)
    .sort((a, b) => {
      const g = (a.group ?? "").localeCompare(b.group ?? "");
      if (g !== 0) return g;
      const md = (a.matchday ?? 0) - (b.matchday ?? 0);
      if (md !== 0) return md;
      return a.date.localeCompare(b.date);
    });

  const byGroup = new Map<string, MatchDoc[]>();
  for (const m of groupMatches) {
    if (!m.group) continue;
    const arr = byGroup.get(m.group) ?? [];
    arr.push(m);
    byGroup.set(m.group, arr);
  }
  const groupKeys = Array.from(byGroup.keys()).sort();

  const ko = prediction.knockout;

  return (
    <Document
      title={`Polla Mundialista — Intento ${attempt} — ${participantName}`}
      author="Merquellantas"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar} fixed>
          <Text style={styles.kicker}>Polla Mundialista 2026 · Boleta</Text>
          <Text style={styles.title}>Mi pronóstico — Intento {attempt}</Text>
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>Participante</Text>
              <Text style={styles.metaValue}>{participantName}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Cédula</Text>
              <Text style={styles.metaValue}>{cedula}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Generado</Text>
              <Text style={styles.metaValue}>{generatedAt}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Fase de grupos</Text>
        {groupKeys.map((g) => {
          const list = byGroup.get(g) ?? [];
          return (
            <View key={g} style={styles.groupBlock} wrap={false}>
              <Text style={styles.groupHeader}>Grupo {g}</Text>
              {list.map((m) => {
                const score = prediction.groupScores[m._id];
                return (
                  <MatchRow
                    key={m._id}
                    date={m.date ? formatDate(m.date) : ""}
                    homeLabel={teamName(m.home.code, m.home.name)}
                    awayLabel={teamName(m.away.code, m.away.name)}
                    home={score?.home ?? null}
                    away={score?.away ?? null}
                  />
                );
              })}
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Eliminatorias</Text>
        <KnockoutSection title={STAGE_TITLES.ROUND_OF_32} picks={ko.r32} />
        <KnockoutSection title={STAGE_TITLES.ROUND_OF_16} picks={ko.r16} />
        <KnockoutSection title={STAGE_TITLES.QUARTER_FINALS} picks={ko.qf} />
        <KnockoutSection title={STAGE_TITLES.SEMI_FINALS} picks={ko.sf} />
        <KnockoutSection
          title={STAGE_TITLES.THIRD_PLACE}
          picks={ko.third ? [ko.third] : []}
        />
        <KnockoutSection
          title={STAGE_TITLES.FINAL}
          picks={ko.final ? [ko.final] : []}
        />

        {prediction.champion && (
          <View style={styles.championBox} wrap={false}>
            <Text style={styles.championLabel}>Mi campeón pronosticado</Text>
            <Text style={styles.championName}>
              {teamName(prediction.champion.code, prediction.champion.name)}
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Merquellantas Te Cuida · Polla Mundialista 2026</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPredictionPdf(
  input: PredictionPdfInput,
): Promise<Buffer> {
  return renderToBuffer(<PredictionDocument {...input} />);
}
