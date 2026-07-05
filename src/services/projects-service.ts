// Projects Service — wraps Supabase queries with seed-data fallback.
// When Supabase is not configured, returns TypeScript seed data transparently.

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
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
  const fallback = () =>
    SEED_PROJECTS.find((p) => p.slug === slug) ??
    SEED_PROJECTS.find((p) => p.id === slug) ??
    null;
  if (!isSupabaseConfigured) return fallback();
  try {
    const bySlug = await fetchProjectBySlug(slug);
    if (bySlug) return bySlug;
    // The route param may actually be a project id (projects created without a slug)
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(slug)) {
      return await fetchProjectById(slug);
    }
    return null;
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
  // Seed starter data so every tab has something to show
  await seedProjectStarterData(project.id, input.name).catch((err) =>
    console.warn("Kunne ikke seede startdata:", err),
  );
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
    geometry_area_ha: number;
    geometry_centroid_lat: number;
    geometry_centroid_lng: number;
    geometry_polygon: object;
    geometry_source: string;
  }>,
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateProject(id, input);
  void logAuditEvent({
    project_id: id,
    event_type: "project_updated",
    title: `Projekt opdateret${input.status ? `: status → ${input.status}` : ""}`,
    actor: "Bruger",
    source: "manual",
  });
}

// ─── Starter data ─────────────────────────────────────────────────────────────

// Populates a brand-new project with a small set of default rows so the
// Overview/Sites/Data sources/Indicators/Actions tabs are immediately useful.
export async function seedProjectStarterData(
  projectId: string,
  projectName: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const nowIso = new Date().toISOString();
  const in14Days = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  const client = supabase as unknown as {
    from: (table: string) => { insert: (rows: unknown[]) => Promise<unknown> };
  };

  await Promise.all([
    client.from("sites").insert([
      {
        project_id: projectId,
        name: `${projectName} — Hovedområde`,
        site_type: "Naturareal",
        area_ha: 12.4,
        baseline_status: "Afventer baseline",
      },
      {
        project_id: projectId,
        name: `${projectName} — Vådområde`,
        site_type: "Vådområde",
        area_ha: 3.1,
        baseline_status: "Delvist dokumenteret",
      },
    ]),
    supabase.from("data_sources").insert([
      {
        project_id: projectId,
        name: "DMI Klima API",
        source_type: "api",
        provider: "DMI",
        status: "online",
        last_sync_at: nowIso,
      },
      {
        project_id: projectId,
        name: "Miljøportalen (arter & natur)",
        source_type: "api",
        provider: "Miljøstyrelsen",
        status: "online",
        last_sync_at: nowIso,
      },
      {
        project_id: projectId,
        name: "Sentinel-2 satellitdata",
        source_type: "satellite",
        provider: "Copernicus",
        status: "partial",
        last_sync_at: nowIso,
      },
      {
        project_id: projectId,
        name: "Feltobservationer (manuel upload)",
        source_type: "manual",
        provider: "Feltteam",
        status: "attention",
        last_sync_at: null,
      },
    ]),
    supabase.from("indicators").insert([
      {
        project_id: projectId,
        key: "biodiversity_index",
        label: "Biodiversitetsindeks",
        category: "biodiversitet",
        value: 0,
        unit: "score",
        status: "afventer",
        trend: "flat",
        updated_at: nowIso,
      },
      {
        project_id: projectId,
        key: "co2_sequestration",
        label: "CO₂-binding",
        category: "klima",
        value: 0,
        unit: "t CO₂e/år",
        status: "afventer",
        trend: "flat",
        updated_at: nowIso,
      },
      {
        project_id: projectId,
        key: "water_quality",
        label: "Vandkvalitet",
        category: "vand",
        value: 0,
        unit: "score",
        status: "afventer",
        trend: "flat",
        updated_at: nowIso,
      },
      {
        project_id: projectId,
        key: "habitat_area",
        label: "Habitatareal",
        category: "areal",
        value: 0,
        unit: "ha",
        status: "afventer",
        trend: "flat",
        updated_at: nowIso,
      },
    ]),
    supabase.from("actions").insert([
      {
        project_id: projectId,
        title: "Definér projektgeometri (polygon)",
        priority: "Høj",
        status: "Åben",
        owner: "Projektleder",
        due_date: in14Days,
        description: "Upload GeoJSON eller tegn polygon for at aktivere miljø- og satellitanalyse.",
      },
      {
        project_id: projectId,
        title: "Registrér baseline for hovedområde",
        priority: "Høj",
        status: "Åben",
        owner: "Feltteam",
        due_date: in30Days,
        description: "Dokumentér udgangspunkt for biodiversitet, jord og vand før interventioner.",
      },
      {
        project_id: projectId,
        title: "Tilknyt IoT-sensorer",
        priority: "Medium",
        status: "Åben",
        owner: "Data-ansvarlig",
        due_date: in30Days,
        description: "Sæt vandkvalitets- og jordfugtighedssensorer op på hovedområdet.",
      },
    ]),
  ]);
}

export async function getSitesByProject(projectId: string): Promise<Site[]> {
  if (!isSupabaseConfigured) {
    return SEED_SITES.filter((s) => s.project_id === projectId);
  }
  try {
    return await fetchSitesByProject(projectId);
  } catch {
    return SEED_SITES.filter((s) => s.project_id === projectId);
  }
}

export async function getDataSourcesByProject(projectId: string): Promise<DataSource[]> {
  if (!isSupabaseConfigured) {
    return SEED_DATA_SOURCES.filter((d) => d.project_id === projectId);
  }
  try {
    return await fetchDataSourcesByProject(projectId);
  } catch {
    return SEED_DATA_SOURCES.filter((d) => d.project_id === projectId);
  }
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
