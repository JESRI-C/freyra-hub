import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchProjectById,
  fetchProjects,
  fetchIndicatorsByProject,
  fetchEnvironmentalRisks,
  fetchDataSourcesByProject,
  fetchSitesByProject,
  fetchAuditEventsByProject,
  fetchObservationsByProject,
  fetchEvidenceFilesByProject,
} from "@/lib/supabase/queries";
import type { Action, ProjectDocument, ImpactUnit } from "@/lib/supabase/types";
import {
  WorkspaceEntrySchema,
  validateEntry,
  type EntryKind,
  type WorkspaceEntry,
} from "@/lib/project-workspace";

// Reuse the authenticated browser client. New tables are typed locally until regeneration.
const db = () => supabase as unknown as SupabaseClient;
export type ProjectScope = { organizationId: string; projectId: string };
export async function assertProjectScope(scope: ProjectScope) {
  const project = await fetchProjectById(scope.projectId);
  if (!project || project.organization_id !== scope.organizationId)
    throw new Error("Projektet findes ikke i den valgte organisation, eller adgang mangler.");
  return project;
}
async function rows<T>(table: string, projectId: string): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db()
      .from(table)
      .select("*")
      .eq("project_id", projectId)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < 500) return all;
  }
}
export type QualityAssessment = {
  id: string;
  overall_score: number | null;
  assessed_at: string;
  explanation: string | null;
};
export type QualityIssue = {
  id: string;
  severity: string;
  status: string;
  description: string;
  issue_type: string;
};
export type CalculatedMetric = {
  id: string;
  metric_key: string;
  metric_label: string;
  value: number | null;
  unit: string | null;
  method: string | null;
  calculated_at: string;
};
export async function loadProjectWorkspace(scope: ProjectScope) {
  const project = await assertProjectScope(scope);
  const requests = {
    projects: () => fetchProjects(scope.organizationId),
    indicators: () => fetchIndicatorsByProject(scope.projectId),
    actions: () => rows<Action>("actions", scope.projectId),
    risks: () => fetchEnvironmentalRisks(scope.projectId),
    sources: () => fetchDataSourcesByProject(scope.projectId),
    sites: () => fetchSitesByProject(scope.projectId),
    audit: () => fetchAuditEventsByProject(scope.projectId, 500),
    observations: () => fetchObservationsByProject(scope.projectId),
    evidence: () => fetchEvidenceFilesByProject(scope.projectId),
    documents: () => rows<ProjectDocument>("documents", scope.projectId),
    units: () => rows<ImpactUnit>("impact_units", scope.projectId),
    quality: () => rows<QualityAssessment>("data_quality_assessments", scope.projectId),
    issues: () => rows<QualityIssue>("data_quality_issues", scope.projectId),
    metrics: () => rows<CalculatedMetric>("calculated_metrics", scope.projectId),
    entries: async () =>
      (await rows<WorkspaceEntry>("project_workspace_entries", scope.projectId)).map((row) =>
        WorkspaceEntrySchema.parse(row),
      ),
  };
  type Resources = { [K in keyof typeof requests]?: Awaited<ReturnType<(typeof requests)[K]>> };
  const resources: Resources = {};
  const errors: Partial<Record<keyof typeof requests, string>> = {};
  const keys = Object.keys(requests) as (keyof typeof requests)[];
  const results = await Promise.allSettled(keys.map((key) => requests[key]()));
  results.forEach((result, i) => {
    const key = keys[i];
    if (result.status === "fulfilled") Object.assign(resources, { [key]: result.value });
    else
      errors[key] =
        result.reason instanceof Error ? result.reason.message : "Data kunne ikke indlæses.";
  });
  return { project, ...resources, errors };
}
export type ProjectWorkspace = Awaited<ReturnType<typeof loadProjectWorkspace>>;
export async function saveWorkspaceEntry(
  scope: ProjectScope,
  input: {
    kind: EntryKind;
    title: string;
    payload: Record<string, string>;
    previous?: WorkspaceEntry;
    entryId?: string;
  },
) {
  validateEntry(input.kind, input.title, input.payload);
  await assertProjectScope(scope);
  const previous = input.previous;
  if (input.entryId) {
    WorkspaceEntrySchema.shape.entry_id.parse(input.entryId);
    if (previous && previous.entry_id !== input.entryId)
      throw new Error("Registreringens identitet er ændret. Genindlæs sagen.");
  }
  if (
    previous &&
    (previous.project_id !== scope.projectId ||
      previous.organization_id !== scope.organizationId ||
      previous.kind !== input.kind)
  )
    throw new Error("Registreringen tilhører et andet projekt.");
  const { data, error } = await db()
    .from("project_workspace_entries")
    .insert({
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      entry_id: previous?.entry_id ?? input.entryId ?? crypto.randomUUID(),
      kind: input.kind,
      version: (previous?.version ?? 0) + 1,
      title: input.title.trim(),
      payload: input.payload,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return WorkspaceEntrySchema.parse(data);
}
export async function createProjectAction(scope: ProjectScope, title: string, description: string) {
  await assertProjectScope(scope);
  if (!title.trim()) throw new Error("Angiv en titel.");
  const { data, error } = await db()
    .from("actions")
    .insert({ project_id: scope.projectId, title: title.trim(), description, status: "Åben" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Action;
}
export async function updateProjectAction(
  scope: ProjectScope,
  id: string,
  status: "I gang" | "Lukket",
  actualImpact?: string,
) {
  await assertProjectScope(scope);
  // Evidence completion checks remain in the existing ActionItem component AND here.
  const existing = await db()
    .from("actions")
    .select("requires_evidence")
    .eq("id", id)
    .eq("project_id", scope.projectId)
    .single();
  if (existing.error) throw new Error(existing.error.message);
  if (status === "Lukket" && existing.data.requires_evidence) {
    const evidence = await db()
      .from("action_evidence")
      .select("id", { count: "exact", head: true })
      .eq("action_id", id);
    if (evidence.error || !evidence.count)
      throw new Error("Handlingen kræver registreret evidens før afslutning.");
  }
  const { error } = await db()
    .from("actions")
    .update({
      status,
      ...(status === "I gang"
        ? { started_at: new Date().toISOString() }
        : { completed_at: new Date().toISOString(), actual_impact: actualImpact?.trim() || null }),
    })
    .eq("id", id)
    .eq("project_id", scope.projectId)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
}
