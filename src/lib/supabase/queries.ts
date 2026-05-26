// Low-level query functions. Each returns typed data or throws on DB errors.
// Service layer wraps these with fallback-to-seed-data logic.

import { supabase } from "./client";
import type {
  Project,
  Indicator,
  AuditEvent,
  Report,
  Action,
  DataSource,
  Site,
  Sensor,
  Observation,
  EvidenceFile,
  ConstructionProject,
  NatureContext,
  RunoffProfile,
  EnvironmentalRisk,
  MitigationMeasure,
  AuthoritySubmission,
} from "./types";

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function fetchProjects(organizationId?: string): Promise<Project[]> {
  if (!supabase) throw new Error("Supabase not configured");

  let query = supabase.from("projects").select("*").order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchProjectBySlug(slug: string): Promise<Project | null> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase.from("projects").select("*").eq("slug", slug).single();
  if (error) throw error;
  return data;
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export async function fetchSitesByProject(projectId: string): Promise<Site[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase.from("sites").select("*").eq("project_id", projectId);
  if (error) throw error;
  return data ?? [];
}

// ─── Data Sources ─────────────────────────────────────────────────────────────

export async function fetchDataSourcesByProject(projectId: string): Promise<DataSource[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("data_sources")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Indicators ───────────────────────────────────────────────────────────────

export async function fetchIndicatorsByProject(projectId: string): Promise<Indicator[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("indicators")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchIndicator(projectId: string, key: string): Promise<Indicator | null> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("indicators")
    .select("*")
    .eq("project_id", projectId)
    .eq("key", key)
    .single();
  if (error) throw error;
  return data;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function fetchReportsByProject(projectId: string): Promise<Report[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Audit Events ─────────────────────────────────────────────────────────────

export async function fetchAuditEventsByProject(
  projectId: string,
  limit = 20,
): Promise<AuditEvent[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function fetchOpenActionsByProject(projectId: string): Promise<Action[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("project_id", projectId)
    .neq("status", "Lukket")
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllOpenActions(): Promise<Action[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .neq("status", "Lukket")
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ─── Cross-project queries ─────────────────────────────────────────────────────

export async function fetchAllAuditEvents(limit = 30): Promise<AuditEvent[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllReports(): Promise<Report[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllDataSources(): Promise<DataSource[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("data_sources")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Sensors ──────────────────────────────────────────────────────────────────

export async function fetchSensorsByProject(projectId: string): Promise<Sensor[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("sensors")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Observations ─────────────────────────────────────────────────────────────

export async function fetchObservationsByProject(
  projectId: string,
  limit = 20,
): Promise<Observation[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("observations")
    .select("*")
    .eq("project_id", projectId)
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ─── Evidence Files ───────────────────────────────────────────────────────────

export async function fetchEvidenceFilesByProject(projectId: string): Promise<EvidenceFile[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("evidence_files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllEvidenceFiles(): Promise<EvidenceFile[]> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("evidence_files")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Construction ─────────────────────────────────────────────────────────────

export async function fetchConstructionExtension(
  projectId: string,
): Promise<ConstructionProject | null> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("construction_projects")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchNatureContext(projectId: string): Promise<NatureContext | null> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("nature_contexts")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchRunoffProfile(projectId: string): Promise<RunoffProfile | null> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("runoff_profiles")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchEnvironmentalRisks(projectId: string): Promise<EnvironmentalRisk[]> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("environmental_risks")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchMitigationMeasures(projectId: string): Promise<MitigationMeasure[]> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("mitigation_measures")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAuthoritySubmissions(projectId: string): Promise<AuthoritySubmission[]> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("authority_submissions")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
