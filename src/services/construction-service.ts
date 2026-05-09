// Construction Nature Compliance Service
// Wraps Supabase queries with seed-data fallback.

import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchConstructionExtension,
  fetchNatureContext,
  fetchRunoffProfile,
  fetchEnvironmentalRisks,
  fetchMitigationMeasures,
  fetchAuthoritySubmissions,
} from "@/lib/supabase/queries";
import {
  SEED_PROJECTS,
  SEED_CONSTRUCTION_PROJECTS,
  SEED_NATURE_CONTEXTS,
  SEED_RUNOFF_PROFILES,
  SEED_ENVIRONMENTAL_RISKS,
  SEED_MITIGATION_MEASURES,
  SEED_AUTHORITY_SUBMISSIONS,
  SEED_EVIDENCE_FILES,
  SEED_AUDIT_EVENTS,
} from "@/data/platform-seed";
import type {
  ConstructionProject,
  NatureContext,
  RunoffProfile,
  EnvironmentalRisk,
  MitigationMeasure,
  AuthoritySubmission,
  ConstructionProjectSummary,
  EvidenceFile,
  AuditEvent,
} from "@/lib/supabase/types";
import { getEvidenceFilesByProject } from "./evidence-service";
import { getAuditEventsByProject } from "./audit-service";

// ─── Construction project types ───────────────────────────────────────────────

const CONSTRUCTION_PROJECT_TYPES = ["Parkering", "Erhvervsbyggeri", "Boligbyggeri"] as const;
type ConstructionProjectType = (typeof CONSTRUCTION_PROJECT_TYPES)[number];

function isConstructionType(t: string | null): t is ConstructionProjectType {
  return CONSTRUCTION_PROJECT_TYPES.includes(t as ConstructionProjectType);
}

// ─── Scoring functions ────────────────────────────────────────────────────────

export function getRunoffRiskScore(
  profile: RunoffProfile | null,
  ext: ConstructionProject | null,
): "low" | "medium" | "high" | "critical" {
  if (!profile && !ext) return "low";

  let factors = 0;

  const pavedArea = ext?.paved_area_m2 ?? 0;
  if (pavedArea > 5000) factors++;

  const directDischarge =
    profile?.runoff_destination?.toLowerCase().includes("å") ||
    profile?.runoff_destination?.toLowerCase().includes("vandl") ||
    profile?.drainage_principle === "direct_discharge";
  if (directDischarge) factors++;

  const noOilSeparator = profile ? !profile.oil_separator_present : false;
  if (noOilSeparator) factors++;

  if (factors >= 3) return "critical";
  if (factors === 2) return "high";
  if (factors === 1) return "medium";
  return "low";
}

export function getNatureSensitivityScore(
  ctx: NatureContext | null,
): "low" | "medium" | "high" | "critical" {
  if (!ctx) return "low";

  const distWater = ctx.distance_to_watercourse_m ?? Infinity;
  const distNatura = ctx.distance_to_natura2000_m ?? Infinity;

  if (ctx.natura2000_nearby && distNatura < 500) return "critical";
  if (ctx.protected_nature_present && ctx.watercourse_present) return "critical";
  if (ctx.watercourse_present && distWater < 100) return "high";
  if (ctx.protected_nature_present) return "high";
  if (ctx.watercourse_present && distWater < 500) return "medium";
  const adjacentType = ctx.adjacent_nature_type?.toLowerCase() ?? "";
  if (adjacentType === "wetland" || adjacentType === "meadow" || adjacentType === "eng") {
    return "medium";
  }
  return "low";
}

export function getConstructionReadinessScore(
  summary: Omit<
    ConstructionProjectSummary,
    "readinessScore" | "runoffRiskScore" | "natureSensitivityScore"
  >,
): number {
  let score = 0;
  if (summary.constructionExt) score += 15;
  if (summary.natureContext) score += 15;
  if (summary.runoffProfile) score += 15;
  if (summary.risks.length > 0) score += 15;
  if (summary.mitigations.length > 0) score += 15;
  if (summary.evidenceFiles.length > 0) score += 15;
  if (summary.submissions.some((s) => s.status === "Klar" || s.status === "Indsendt")) score += 10;
  return Math.min(100, score);
}

// ─── Individual data fetchers ─────────────────────────────────────────────────

export async function getConstructionExtension(
  projectId: string,
): Promise<ConstructionProject | null> {
  if (!isSupabaseConfigured) {
    return SEED_CONSTRUCTION_PROJECTS.find((c) => c.project_id === projectId) ?? null;
  }
  return fetchConstructionExtension(projectId);
}

export async function getNatureContext(projectId: string): Promise<NatureContext | null> {
  if (!isSupabaseConfigured) {
    return SEED_NATURE_CONTEXTS.find((c) => c.project_id === projectId) ?? null;
  }
  return fetchNatureContext(projectId);
}

export async function getRunoffProfile(projectId: string): Promise<RunoffProfile | null> {
  if (!isSupabaseConfigured) {
    return SEED_RUNOFF_PROFILES.find((r) => r.project_id === projectId) ?? null;
  }
  return fetchRunoffProfile(projectId);
}

export async function getEnvironmentalRisks(projectId: string): Promise<EnvironmentalRisk[]> {
  if (!isSupabaseConfigured) {
    return SEED_ENVIRONMENTAL_RISKS.filter((r) => r.project_id === projectId);
  }
  return fetchEnvironmentalRisks(projectId);
}

export async function getMitigationMeasures(projectId: string): Promise<MitigationMeasure[]> {
  if (!isSupabaseConfigured) {
    return SEED_MITIGATION_MEASURES.filter((m) => m.project_id === projectId);
  }
  return fetchMitigationMeasures(projectId);
}

export async function getAuthoritySubmissions(projectId: string): Promise<AuthoritySubmission[]> {
  if (!isSupabaseConfigured) {
    return SEED_AUTHORITY_SUBMISSIONS.filter((s) => s.project_id === projectId);
  }
  return fetchAuthoritySubmissions(projectId);
}

// ─── Evidence + audit (reuse existing services with seed fallback) ────────────

async function getEvidenceForProject(projectId: string): Promise<EvidenceFile[]> {
  if (!isSupabaseConfigured) {
    return SEED_EVIDENCE_FILES.filter((f) => f.project_id === projectId);
  }
  return getEvidenceFilesByProject(projectId);
}

async function getAuditForProject(projectId: string): Promise<AuditEvent[]> {
  if (!isSupabaseConfigured) {
    return SEED_AUDIT_EVENTS.filter((e) => e.project_id === projectId);
  }
  return getAuditEventsByProject(projectId);
}

// ─── Summary assembly ─────────────────────────────────────────────────────────

async function assembleConstructionSummary(projectId: string): Promise<ConstructionProjectSummary | null> {
  const project = SEED_PROJECTS.find((p) => p.id === projectId) ?? null;
  if (!project) return null;

  const [constructionExt, natureContext, runoffProfile, risks, mitigations, submissions, evidenceFiles, auditEvents] =
    await Promise.all([
      getConstructionExtension(projectId),
      getNatureContext(projectId),
      getRunoffProfile(projectId),
      getEnvironmentalRisks(projectId),
      getMitigationMeasures(projectId),
      getAuthoritySubmissions(projectId),
      getEvidenceForProject(projectId),
      getAuditForProject(projectId),
    ]);

  const partialSummary = {
    project,
    constructionExt,
    natureContext,
    runoffProfile,
    risks,
    mitigations,
    submissions,
    evidenceFiles,
    auditEvents,
  };

  const readinessScore = getConstructionReadinessScore(partialSummary);
  const runoffRiskScore = getRunoffRiskScore(runoffProfile, constructionExt);
  const natureSensitivityScore = getNatureSensitivityScore(natureContext);

  return {
    ...partialSummary,
    readinessScore,
    runoffRiskScore,
    natureSensitivityScore,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getConstructionProjects(): Promise<ConstructionProjectSummary[]> {
  const constructionProjects = SEED_PROJECTS.filter((p) => isConstructionType(p.project_type));
  const summaries = await Promise.all(
    constructionProjects.map((p) => assembleConstructionSummary(p.id)),
  );
  return summaries.filter((s): s is ConstructionProjectSummary => s !== null);
}

export async function getConstructionProjectBySlug(
  slug: string,
): Promise<ConstructionProjectSummary | null> {
  const project = SEED_PROJECTS.find((p) => p.slug === slug && isConstructionType(p.project_type));
  if (!project) return null;
  return assembleConstructionSummary(project.id);
}
