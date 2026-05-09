// Authority Report Service
// Generates structured myndighedsrapport from a ConstructionProjectSummary.

import type { ConstructionProjectSummary, EvidenceFile } from "@/lib/supabase/types";
import { getConstructionReadinessScore } from "./construction-service";

export interface ConstructionAuthorityReport {
  title: string;
  projectDescription: string;
  siteAndNatureContext: string;
  runoffSummary: string;
  riskSummary: string[];
  mitigationSummary: string[];
  evidenceChecklist: { label: string; status: "complete" | "missing" | "needs_review" }[];
  authoritySubmissionStatus: string;
  recommendedNextSteps: string[];
  readinessScore: number;
}

type EvidenceLabel = {
  key: string;
  label: string;
  types: string[];
};

const EVIDENCE_TYPES: EvidenceLabel[] = [
  { key: "site_plan", label: "Situationsplan", types: ["situationsplan", "site_plan", "kortlægning"] },
  { key: "runoff_calculation", label: "Hydrauliske beregninger", types: ["hydraulisk", "beregning", "runoff_calculation"] },
  { key: "drainage_plan", label: "Drænplan / LAR-plan", types: ["drænplan", "lar", "drainage_plan", "afstrømning"] },
  { key: "baseline_photo", label: "Basislinje fotodokumentation", types: ["foto", "basislinje", "baselinestudie", "baseline_photo"] },
  { key: "water_sampling", label: "Vandprøveanalyse", types: ["vandprøve", "water_sampling", "vandkvalitet"] },
];

function matchEvidenceType(file: EvidenceFile, types: string[]): boolean {
  const combined = `${(file.evidence_type ?? "").toLowerCase()} ${file.title.toLowerCase()}`;
  return types.some((t) => combined.includes(t));
}

function buildEvidenceChecklist(
  files: EvidenceFile[],
): { label: string; status: "complete" | "missing" | "needs_review" }[] {
  return EVIDENCE_TYPES.map(({ label, types }) => {
    const found = files.some((f) => matchEvidenceType(f, types));
    return { label, status: found ? "complete" : "missing" };
  });
}

function formatBooleanDa(val: boolean | null | undefined, trueStr: string, falseStr: string): string {
  if (val === null || val === undefined) return "ikke oplyst";
  return val ? trueStr : falseStr;
}

export function generateConstructionAuthorityReport(
  summary: ConstructionProjectSummary,
): ConstructionAuthorityReport {
  const { project, constructionExt, natureContext, runoffProfile, risks, mitigations, submissions, evidenceFiles } = summary;

  // Title
  const title = `Myndighedsrapport — ${project.name}`;

  // Project description
  const descParts: string[] = [];
  if (project.description) descParts.push(project.description);
  if (constructionExt) {
    const parts: string[] = [];
    if (constructionExt.construction_type) parts.push(`Bygningstype: ${constructionExt.construction_type}`);
    if (constructionExt.construction_phase) parts.push(`Fase: ${constructionExt.construction_phase}`);
    if (constructionExt.developer_name) parts.push(`Bygherre: ${constructionExt.developer_name}`);
    if (constructionExt.contractor_name) parts.push(`Totalentreprenør: ${constructionExt.contractor_name}`);
    if (constructionExt.building_area_m2) parts.push(`Bebygget areal: ${constructionExt.building_area_m2.toLocaleString("da-DK")} m²`);
    if (constructionExt.paved_area_m2) parts.push(`Befæstet areal: ${constructionExt.paved_area_m2.toLocaleString("da-DK")} m²`);
    if (parts.length > 0) descParts.push(parts.join(" · "));
  }
  const projectDescription = descParts.join("\n\n") || "Ingen projektbeskrivelse registreret.";

  // Site and nature context
  let siteAndNatureContext = "Ingen naturkontekst registreret for projektet.";
  if (natureContext) {
    const lines: string[] = [];
    if (natureContext.adjacent_nature_type) {
      lines.push(`Tilstødende naturtype: ${natureContext.adjacent_nature_type}`);
    }
    lines.push(
      `Vandløb til stede: ${formatBooleanDa(natureContext.watercourse_present, "Ja", "Nej")}${
        natureContext.watercourse_name ? ` (${natureContext.watercourse_name})` : ""
      }${
        natureContext.distance_to_watercourse_m != null
          ? ` — afstand ${natureContext.distance_to_watercourse_m} m`
          : ""
      }`,
    );
    lines.push(
      `Beskyttet natur (§3): ${formatBooleanDa(natureContext.protected_nature_present, "Ja", "Nej")}${
        natureContext.protected_nature_type ? ` — ${natureContext.protected_nature_type}` : ""
      }`,
    );
    lines.push(
      `Natura 2000 i nærheden: ${formatBooleanDa(natureContext.natura2000_nearby, "Ja", "Nej")}${
        natureContext.distance_to_natura2000_m != null
          ? ` — afstand ${natureContext.distance_to_natura2000_m} m`
          : ""
      }`,
    );
    if (natureContext.buffer_zone_m != null) {
      lines.push(`Bufferkrav: ${natureContext.buffer_zone_m} m`);
    }
    if (natureContext.terrain_slope_description) {
      lines.push(`Terræn: ${natureContext.terrain_slope_description}`);
    }
    if (natureContext.sensitive_receptors) {
      lines.push(`Følsomme receptorer: ${natureContext.sensitive_receptors}`);
    }
    siteAndNatureContext = lines.join("\n");
  }

  // Runoff summary
  let runoffSummary = "Ingen afstrømningsprofil registreret.";
  if (runoffProfile) {
    const lines: string[] = [];
    if (runoffProfile.runoff_destination) lines.push(`Afstrømningsdestination: ${runoffProfile.runoff_destination}`);
    if (runoffProfile.drainage_principle) lines.push(`Princip: ${runoffProfile.drainage_principle}`);
    if (runoffProfile.retention_solution) lines.push(`Forsinkelse/tilbageholdelse: ${runoffProfile.retention_solution}`);
    if (runoffProfile.treatment_solution) lines.push(`Rensning: ${runoffProfile.treatment_solution}`);
    lines.push(`Olieudskiller: ${formatBooleanDa(runoffProfile.oil_separator_present, "Ja", "Nej")}`);
    lines.push(`Sedimentkontrol: ${formatBooleanDa(runoffProfile.sediment_control_present, "Ja", "Nej")}`);
    if (runoffProfile.estimated_runoff_volume_m3 != null) {
      lines.push(`Estimeret volumen: ${runoffProfile.estimated_runoff_volume_m3} m³`);
    }
    if (runoffProfile.design_rain_event) lines.push(`Dimensioneringshændelse: ${runoffProfile.design_rain_event}`);
    if (runoffProfile.discharge_point_description) lines.push(`Udledningspunkt: ${runoffProfile.discharge_point_description}`);
    if (runoffProfile.maintenance_responsibility) lines.push(`Driftsansvar: ${runoffProfile.maintenance_responsibility}`);
    runoffSummary = lines.join("\n");
  }

  // Risk summary
  const riskSummary = risks.map(
    (r) =>
      `${r.title} (${r.severity ?? "ukendt alvorlighed"}) — ${r.mitigation_summary ?? "Ingen afværge registreret"}`,
  );

  // Mitigation summary
  const mitigationSummary = mitigations.map((m) => `${m.title} — ${m.status ?? "Ukendt status"}`);

  // Evidence checklist
  const evidenceChecklist = buildEvidenceChecklist(evidenceFiles);

  // Authority submission status
  const latestSubmission = [...submissions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
  const authoritySubmissionStatus = latestSubmission?.status ?? "Ikke påbegyndt";

  // Recommended next steps
  const nextSteps: string[] = [];
  if (!constructionExt) nextSteps.push("Udfyld byggedata (bygherre, entreprenør, arealer)");
  if (!natureContext) nextSteps.push("Udfyld naturbeskrivelse for projektområdet");
  if (!runoffProfile) nextSteps.push("Udfyld afstrømningsprofil med rensning og forsinkelse");
  if (risks.length === 0) nextSteps.push("Registrér miljørisici for projektet");
  const criticalOpenRisks = risks.filter(
    (r) => (r.severity === "Kritisk" || r.severity === "Høj") && r.status === "Åben",
  );
  if (criticalOpenRisks.length > 0) {
    nextSteps.push(
      `Tilknyt afværgetiltag til ${criticalOpenRisks.length} åbne kritiske/høje risici`,
    );
  }
  const missingEvidence = evidenceChecklist.filter((e) => e.status === "missing");
  if (missingEvidence.length > 0) {
    nextSteps.push(
      `Upload manglende dokumentation: ${missingEvidence.map((e) => e.label).join(", ")}`,
    );
  }
  if (!submissions.some((s) => s.status === "Klar" || s.status === "Indsendt")) {
    nextSteps.push("Forbered og indsend myndighedspakke til relevant myndighed");
  }
  if (nextSteps.length === 0) {
    nextSteps.push("Projektdokumentationen er klar til myndighedsreview");
  }

  const readinessScore = getConstructionReadinessScore({
    project,
    constructionExt,
    natureContext,
    runoffProfile,
    risks,
    mitigations,
    submissions,
    evidenceFiles,
    auditEvents: summary.auditEvents,
  });

  return {
    title,
    projectDescription,
    siteAndNatureContext,
    runoffSummary,
    riskSummary,
    mitigationSummary,
    evidenceChecklist,
    authoritySubmissionStatus,
    recommendedNextSteps: nextSteps,
    readinessScore,
  };
}
