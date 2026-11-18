// Configured projects always come from Supabase. A source error is never demo data.
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isDemoDataEnabled, requireCustomerDatabase } from "@/lib/data-mode";
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
import { SEED_PROJECTS, SEED_SITES, SEED_DATA_SOURCES } from "@/data/platform-seed";
import type { Project, Site, DataSource, NatureProjectSummary } from "@/lib/supabase/types";
import { getIndicatorsByProject } from "./indicators-service";
import { getAuditEventsByProject } from "./audit-service";
import { getReportsByProject } from "./reports-service";
import { computeAreaHa, computeCentroid, validateProjectPolygon } from "./geo-service";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
function seedProjects(organizationId?: string): Project[] {
  if (organizationId) return SEED_PROJECTS.filter((p) => p.organization_id === organizationId);
  return SEED_PROJECTS;
}
export async function getProjects(organizationId?: string): Promise<Project[]> {
  requireCustomerDatabase();
  return fetchProjects(organizationId);
}
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const fallback = () =>
    SEED_PROJECTS.find((p) => p.slug === slug) ?? SEED_PROJECTS.find((p) => p.id === slug) ?? null;
  requireCustomerDatabase();
  const bySlug = await fetchProjectBySlug(slug);
  if (bySlug) return bySlug;
  // The route param may actually be a project id (projects created without a slug)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(slug)) {
    return fetchProjectById(slug);
  }
  return null;
}
export async function getProjectById(id: string): Promise<Project | null> {
  const fallback = () => SEED_PROJECTS.find((p) => p.id === id) ?? null;
  requireCustomerDatabase();
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
}): Promise<{
  id: string;
  slug: string | null;
}> {
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
): Promise<Project> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  const updatedProject = await updateProject(id, input);
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
  return updatedProject;
}
export interface PersistedProjectBoundary {
  polygon: GeoJSONPolygon;
  areaHa: number;
  centroid: {
    lat: number;
    lng: number;
  };
  source: string;
}
type ProjectBoundaryUpdater = (
  id: string,
  input: Parameters<typeof updateProjectDetails>[1],
) => Promise<Project | void>;
export class BoundaryOperationInProgressError extends Error {
  constructor() {
    super("En anden ændring af projektgrænsen er allerede i gang. Vent, og prøv igen.");
    this.name = "BoundaryOperationInProgressError";
  }
}
export interface BoundaryOperationGuard {
  isBusy: () => boolean;
  run: <T>(operation: () => Promise<T>) => Promise<T>;
}
/** Synchronous admission guard: only one boundary write may be in flight. */
export function createBoundaryOperationGuard(): BoundaryOperationGuard {
  let busy = false;
  return {
    isBusy: () => busy,
    run: async <T>(operation: () => Promise<T>): Promise<T> => {
      if (busy) throw new BoundaryOperationInProgressError();
      busy = true;
      try {
        return await operation();
      } finally {
        busy = false;
      }
    },
  };
}
export function projectBoundaryMutationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Ukendt fejl";
  const normalized = message.toLowerCase();
  if (
    normalized.includes("row-level security") ||
    normalized.includes("policy") ||
    normalized.includes("permission denied") ||
    normalized.includes("not authorized")
  ) {
    return "Du har ikke rettighed til at ændre projektgrænsen. Bed en projektleder eller administrator om adgang, og prøv igen.";
  }
  return message;
}
/**
 * Canonical persistence boundary for every map/import source. Validation and
 * derived values happen here so callers cannot persist a malformed polygon or
 * a stale client-provided area/centroid.
 */
export async function persistProjectBoundary(
  projectId: string,
  input: {
    polygon: unknown;
    source?: string;
  },
  update: ProjectBoundaryUpdater = updateProjectDetails,
): Promise<PersistedProjectBoundary> {
  const validation = validateProjectPolygon(input.polygon);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const centroid = computeCentroid(validation.polygon);
  if (!centroid) {
    throw new Error("Projektgrænsens centroid kunne ikke beregnes.");
  }
  const areaHa = Math.round(computeAreaHa(validation.polygon) * 100) / 100;
  if (!Number.isFinite(areaHa) || areaHa <= 0) {
    throw new Error("Projektgrænsens areal kunne ikke beregnes.");
  }
  const source = input.source ?? "manual";
  const updatedProject = await update(projectId, {
    geometry_polygon: validation.polygon,
    geometry_area_ha: areaHa,
    geometry_source: source,
    geometry_centroid_lat: centroid.lat,
    geometry_centroid_lng: centroid.lng,
  });
  if (updatedProject) {
    const persistedValidation = validateProjectPolygon(updatedProject.geometry_polygon);
    const polygonMatches =
      persistedValidation.valid &&
      JSON.stringify(persistedValidation.polygon.coordinates) ===
        JSON.stringify(validation.polygon.coordinates);
    const derivedValuesMatch =
      updatedProject.geometry_area_ha === areaHa &&
      updatedProject.geometry_centroid_lat === centroid.lat &&
      updatedProject.geometry_centroid_lng === centroid.lng &&
      updatedProject.geometry_source === source;
    if (!polygonMatches || !derivedValuesMatch) {
      throw new Error(
        "Databasen bekræftede ikke den gemte projektgrænse og dens afledte værdier. Genindlæs projektet, før du fortsætter.",
      );
    }
  }
  return { polygon: validation.polygon, areaHa, centroid, source };
}
/** Clear every canonical geometry field together so no stale map position survives. */
export async function clearProjectBoundary(
  projectId: string,
  update: ProjectBoundaryUpdater = updateProjectDetails,
): Promise<void> {
  const updatedProject = await update(projectId, {
    geometry_polygon: null,
    geometry_area_ha: null,
    geometry_source: null,
    geometry_centroid_lat: null,
    geometry_centroid_lng: null,
  });
  if (
    updatedProject &&
    (updatedProject.geometry_polygon !== null ||
      updatedProject.geometry_area_ha !== null ||
      updatedProject.geometry_source !== null ||
      updatedProject.geometry_centroid_lat !== null ||
      updatedProject.geometry_centroid_lng !== null)
  ) {
    throw new Error(
      "Databasen bekræftede ikke, at projektgrænsen blev ryddet. Genindlæs projektet, før du fortsætter.",
    );
  }
}
export async function getSitesByProject(projectId: string): Promise<Site[]> {
  requireCustomerDatabase();
  return fetchSitesByProject(projectId);
}
export async function getDataSourcesByProject(projectId: string): Promise<DataSource[]> {
  requireCustomerDatabase();
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
