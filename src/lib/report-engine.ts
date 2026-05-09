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
  readinessScore: number;
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
}: GenerateInput): ProjectReportPreview {
  // ── Readiness score ─────────────────────────────────────────────────────────
  const readinessIndicator = indicators.find((i) => i.key === "report_readiness");
  let readinessScore: number;

  if (readinessIndicator?.value !== null && readinessIndicator?.value !== undefined) {
    readinessScore = readinessIndicator.value;
  } else {
    // Derive from data completeness
    const hasDescription = project.description ? 20 : 0;
    const hasSites = sites.length > 0 ? 20 : 0;
    const hasDataSources = dataSources.filter((d) => d.status === "online").length > 0 ? 20 : 0;
    const hasIndicators = indicators.length > 0 ? 20 : 0;
    const hasEvidence = evidenceFiles.length > 0 ? 20 : 0;
    readinessScore = hasDescription + hasSites + hasDataSources + hasIndicators + hasEvidence;
  }

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
    keyFindings.push("Ingen signifikante tendenser registreret i denne periode.");
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
    openRisks.push("Ingen identificerede risici i denne periode.");
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
  project: Project,
  indicators: Indicator[],
  actions: Action[],
): string {
  // If there's a high-priority open action, return its title
  const highPriorityAction = actions.find((a) => a.priority === "Høj" && a.status !== "Lukket");
  if (highPriorityAction) return highPriorityAction.title;

  // Check report readiness
  const readiness = indicators.find((i) => i.key === "report_readiness");
  if (readiness?.value !== null && readiness?.value !== undefined && readiness.value < 70) {
    return "Fuldfør manglende dokumentation";
  }

  // Check data confidence
  const dataConfidence = indicators.find(
    (i) => i.key === "data_quality" || i.key === "data_confidence",
  );
  if (
    dataConfidence?.value !== null &&
    dataConfidence?.value !== undefined &&
    dataConfidence.value < 70
  ) {
    return "Valider seneste datakilder";
  }

  // Check biodiversity trend
  const biodiversity = indicators.find((i) => i.key === "biodiversity_index");
  if (biodiversity?.trend === "down") {
    return "Gennemgå biodiversitetsdrivere";
  }

  return "Projektet er klar til næste rapporteringscyklus";
}
