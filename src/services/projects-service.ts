// Projects Service — wraps Supabase queries with seed-data fallback.
// When Supabase is not configured, returns TypeScript seed data transparently.

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchProjects, fetchProjectBySlug, fetchProjectById } from "@/lib/supabase/queries";
import { SEED_PROJECTS, SEED_SITES, SEED_DATA_SOURCES } from "@/data/platform-seed";
import type { Project, Site, DataSource, NatureProjectSummary } from "@/lib/supabase/types";
import { getIndicatorsByProject } from "./indicators-service";
import { getAuditEventsByProject } from "./audit-service";
import { getReportsByProject } from "./reports-service";

// Returns true if the error indicates that the underlying Supabase table does
// not exist yet (e.g. the schema has not been migrated). In that case we fall
// back to the seed data so the app keeps working.
function isMissingTable(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "PGRST205");
}

function seedProjects(organizationId?: string): Project[] {
  if (organizationId) return SEED_PROJECTS.filter((p) => p.organization_id === organizationId);
  return SEED_PROJECTS;
}

export async function getProjects(organizationId?: string): Promise<Project[]> {
  if (!isSupabaseConfigured) return seedProjects(organizationId);
  try {
    return await fetchProjects(organizationId);
  } catch (err) {
    if (isMissingTable(err)) return seedProjects(organizationId);
    throw err;
  }
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const fallback = () => SEED_PROJECTS.find((p) => p.slug === slug) ?? null;
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchProjectBySlug(slug);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

export async function getProjectById(id: string): Promise<Project | null> {
  const fallback = () => SEED_PROJECTS.find((p) => p.id === id) ?? null;
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchProjectById(id);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

export function getSitesByProject(projectId: string): Site[] {
  return SEED_SITES.filter((s) => s.project_id === projectId);
}

export function getDataSourcesByProject(projectId: string): DataSource[] {
  return SEED_DATA_SOURCES.filter((d) => d.project_id === projectId);
}

// Returns a rich summary for the Nature Project Monitor view.
export async function getNatureProjectSummary(
  projectId: string,
): Promise<NatureProjectSummary | null> {
  const project = await getProjectById(projectId);
  if (!project) return null;

  const [indicators, auditEvents, reports, dataSources] = await Promise.all([
    getIndicatorsByProject(projectId),
    getAuditEventsByProject(projectId),
    getReportsByProject(projectId),
    Promise.resolve(getDataSourcesByProject(projectId)),
  ]);

  return {
    project,
    indicators,
    activeDataSources: dataSources.filter((d) => d.status === "online" || d.status === "partial")
      .length,
    openActions: 0, // populated by actions-service when implemented
    latestAuditEvent: auditEvents[0] ?? null,
    latestReport: reports[0] ?? null,
  };
}

// Returns all project summaries for the platform overview.
export async function getAllNatureProjectSummaries(
  organizationId?: string,
): Promise<NatureProjectSummary[]> {
  const projects = await getProjects(organizationId);
  return Promise.all(projects.map((p) => getNatureProjectSummary(p.id))) as Promise<
    NatureProjectSummary[]
  >;
}
