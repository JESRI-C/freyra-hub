// Report Engine — generates a structured project report preview from aggregated data.
// No external dependencies; works fully with seed data.

import type {
  Project,
  Site,
  DataSource,
  Indicator,
  Observation,
  Action,
  AuditEvent,
  EvidenceFile,
} from "@/lib/supabase/types";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import type { IoTSensor } from "@/services/iot-simulation-service";

export interface IndicatorSummaryRow {
  label: string;
  value: number | null;
  unit: string | null;
  trend: string | null;
  status: string | null;
}

export interface ProjectReportPreview {
  title: string;
  projectSummary: string;
  reportingPeriod: string;
  keyFindings: string[];
  dataSourcesSummary: string[];
  indicatorSummary: IndicatorSummaryRow[];
  openRisks: string[];
  recommendedActions: string[];
  evidenceSummary: string[];
  auditSummary: string[];
  readinessScore: number | null;
}

interface GenerateInput {
  project: Project;
  sites: Site[];
  dataSources: DataSource[];
  indicators: Indicator[];
  observations: Observation[];
  actions: Action[];
  auditEvents: AuditEvent[];
  evidenceFiles: EvidenceFile[];
  mediaItems?: ProjectMediaItem[];
  sensors?: IoTSensor[];
  hasConnectorData?: boolean;
  hasValidPolygon?: boolean;
}

function formatDanishDate(iso: string): string {
  return new Date(iso).toLocaleDateString("da-DK", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function currentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

export function generateProjectReportPreview({
  project,
  sites,
  dataSources,
  indicators,
  observations,
  actions,
  auditEvents,
  evidenceFiles,
  mediaItems,
  sensors,
}: GenerateInput): ProjectReportPreview {
  // Completeness is not professional verification or report acceptance.
  const readinessScore: number | null = null;

  // ── Key findings from indicators ────────────────────────────────────────────
  const keyFindings: string[] = [];
  indicators.forEach((ind) => {
    if (ind.trend === "up" && ind.value !== null) {
      keyFindings.push(`${ind.label} er stigende (${ind.value}${ind.unit ?? ""})`);
    } else if (ind.trend === "down" && ind.value !== null) {
      keyFindings.push(
        `${ind.label} er faldende (${ind.value}${ind.unit ?? ""}) — kræver opmærksomhed`,
      );
    }
  });
  if (keyFindings.length === 0) {
    keyFindings.push(
      "Datagrundlaget dokumenterer endnu ingen tidslig udvikling. Fravær af registrerede tendenser er ikke dokumentation for uændrede forhold.",
    );
  }

  // ── Data sources summary ────────────────────────────────────────────────────
  const onlineCount = dataSources.filter((d) => d.status === "online").length;
  const totalCount = dataSources.length;
  const dataSourcesSummary: string[] = [
    `${onlineCount} af ${totalCount} datakilder er online`,
    ...dataSources.slice(0, 4).map((d) => `${d.name} (${d.source_type ?? "ukendt type"})`),
  ];

  // ── Indicator summary ───────────────────────────────────────────────────────
  const indicatorSummary: IndicatorSummaryRow[] = indicators.map((ind) => ({
    label: ind.label,
    value: ind.value,
    unit: ind.unit,
    trend: ind.trend,
    status: ind.status,
  }));

  // ── Open risks from high-priority actions + declining indicators ────────────
  const openRisks: string[] = [];
  actions
    .filter((a) => a.priority === "Høj" && a.status !== "Lukket")
    .forEach((a) => openRisks.push(`Åben høj-prioritets handling: ${a.title}`));
  indicators
    .filter((i) => i.trend === "down")
    .forEach((i) => openRisks.push(`Faldende indikator: ${i.label}`));
  if (openRisks.length === 0) {
    openRisks.push(
      "Der er endnu ingen registrerede risikopunkter i disse data. En fuldstændig faglig risikovurdering er ikke dokumenteret.",
    );
  }

  // ── Recommended actions ─────────────────────────────────────────────────────
  const priorityOrder: Record<string, number> = { Høj: 0, Medium: 1, Lav: 2 };
  const recommendedActions: string[] = [...actions]
    .filter((a) => a.status !== "Lukket")
    .sort(
      (a, b) =>
        (priorityOrder[a.priority ?? "Lav"] ?? 2) - (priorityOrder[b.priority ?? "Lav"] ?? 2),
    )
    .slice(0, 5)
    .map(
      (a) => `[${a.priority ?? "Lav"}] ${a.title}${a.due_date ? ` (frist: ${a.due_date})` : ""}`,
    );

  // ── Evidence summary ────────────────────────────────────────────────────────
  const evidenceSummary: string[] = evidenceFiles.map(
    (e) => `${e.title} (${e.evidence_type ?? e.file_type ?? "fil"})`,
  );
  if (evidenceSummary.length === 0) {
    evidenceSummary.push("Ingen dokumentation uploadet endnu.");
  }

  // ── Audit summary ───────────────────────────────────────────────────────────
  const auditSummary: string[] = auditEvents
    .slice(0, 5)
    .map((e) => `${formatDanishDate(e.created_at)}: ${e.title}${e.actor ? ` — ${e.actor}` : ""}`);
  if (auditSummary.length === 0) {
    auditSummary.push("Ingen auditbegivenheder registreret.");
  }

  // ── Reporting period ────────────────────────────────────────────────────────
  const reportingPeriod = currentQuarter();

  // ── Title ───────────────────────────────────────────────────────────────────
  const title = `Naturimpact-rapport ${reportingPeriod} — ${project.name}`;

  // ── Project summary ─────────────────────────────────────────────────────────
  const projectSummary =
    project.description ??
    `${project.name} er et ${project.project_type ?? "naturgendannelses"}-projekt i ${project.location_name ?? project.country}.`;

  return {
    title,
    projectSummary,
    reportingPeriod,
    keyFindings,
    dataSourcesSummary,
    indicatorSummary,
    openRisks,
    recommendedActions,
    evidenceSummary,
    auditSummary,
    readinessScore,
  };
}

export function getRecommendedNextAction(
  _project: Project,
  _indicators: Indicator[],
  actions: Action[],
  mediaItems?: ProjectMediaItem[],
  _sensors?: IoTSensor[],
): string {
  // These legacy inputs do not include the saved investigation, source coverage,
  // photo bindings, notes, review decisions or report archive. They cannot establish
  // which workflow step is complete. Scores, media flags and simulated sensors
  // must not stand in for that evidence.
  const highPriorityAction = actions.find((a) => a.priority === "Høj" && a.status !== "Lukket");
  if (highPriorityAction) {
    return "Gennemgå åbne handlinger med høj prioritet i den samlede undersøgelse, og afklar dokumentation og opfølgning.";
  }

  if (!mediaItems || mediaItems.length === 0) {
    return "Fortsæt i den samlede undersøgelse med datagrundlag og fotoimport. Der er ingen fotos i denne oversigt.";
  }
  if (!mediaItems.some((m) => !!m.coordinates)) {
    return "Gennemgå billedernes placering og usikkerhed i den samlede undersøgelse. Upload alene dokumenterer ikke sammenfald med vandløbet.";
  }

  return "Gennemgå fotos og datagrundlag i den samlede undersøgelse, og afklar spørgsmål og faglig gennemgang før rapporten.";
}
