// Customer projects are read from the authenticated database only.
// Missing configuration/schema must not masquerade as demonstration data.

import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchProjects,
  fetchProjectBySlug,
  fetchProjectById,
  fetchSitesByProject,
  fetchDataSourcesByProject,
  insertProject,
  updateProject,
} from "@/lib/supabase/queries";
import { logAuditEvent } from "@/services/audit-service";
import type { Project, Site, DataSource, NatureProjectSummary } from "@/lib/supabase/types";
import { getIndicatorsByProject } from "./indicators-service";
import { getAuditEventsByProject } from "./audit-service";
import { getReportsByProject } from "./reports-service";

function requireDatabase() {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
}
export async function getProjects(organizationId?: string): Promise<Project[]> {
  requireDatabase();
  return fetchProjects(organizationId);
}
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  requireDatabase();
  const project = await fetchProjectBySlug(slug);
  if (project) return project;
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(slug) ? fetchProjectById(slug) : null;
}
export async function getProjectById(id: string): Promise<Project | null> {
  requireDatabase();
  return fetchProjectById(id);
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createProject(input: {
  name: string;
  slug: string;
  project_type?: string;
  location_name?: string;
  municipality?: string;
  description?: string;
  start_date?: string;
  organization_id?: string;
}): Promise<{ id: string; slug: string | null }> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  const project = await insertProject({ ...input, status: "planning" });
  void logAuditEvent({
    project_id: project.id,
    event_type: "project_created",
    title: `Projekt oprettet: ${input.name}`,
    description: input.description,
    actor: "Bruger",
    source: "manual",
  });
  return project;
}

export async function updateProjectDetails(
  id: string,
  input: Partial<{
    name: string;
    status: string;
    description: string;
    location_name: string;
    municipality: string;
    project_type: string;
    start_date: string;
    end_date: string;
    geometry_area_ha: number | null;
    geometry_centroid_lat: number | null;
    geometry_centroid_lng: number | null;
    geometry_polygon: object | null;
    geometry_source: string | null;
  }>,
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateProject(id, input);
  void logAuditEvent({
    project_id: id,
    event_type: "project_updated",
    entity_type: "project",
    entity_id: id,
    title: `Projekt opdateret${input.status ? `: status → ${input.status}` : ""}`,
    actor: "Bruger",
    source: "manual",
    after_data: input as Record<string, unknown>,
  });
}

export async function getSitesByProject(projectId: string): Promise<Site[]> {
  requireDatabase();
  return fetchSitesByProject(projectId);
}
export async function getDataSourcesByProject(projectId: string): Promise<DataSource[]> {
  requireDatabase();
  return fetchDataSourcesByProject(projectId);
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
    getDataSourcesByProject(projectId),
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
