import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  ProjectAccessDeniedError,
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "@/lib/project-nature-access.server";
import {
  buildOfficialWatercourseGeometryUrl,
  fetchOfficialWatercourse,
  OFFICIAL_WATERCOURSE_ATTRIBUTION,
  OFFICIAL_WATERCOURSE_DISCLAIMER,
  searchOfficialWatercourses,
  type LngLat,
  type OfficialWatercourseGeometry,
  type OfficialWatercourseSuggestion,
} from "@/services/geospatial/official-watercourse-source";

const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ProjectId = z.string().regex(POSTGRES_UUID, "Invalid project ID");

const SearchInput = z.object({
  projectId: ProjectId,
  query: z.string().trim().min(2).max(100),
});
const ReachInput = z.object({
  projectId: ProjectId,
  watercourseId: z.string().regex(POSTGRES_UUID, "Invalid watercourse ID"),
});
const ProjectInput = z.object({ projectId: ProjectId });

export type WatercourseSearchInput = z.infer<typeof SearchInput>;
export type WatercourseReachInput = z.infer<typeof ReachInput>;

type DataClient = SupabaseClient<Database>;
type MonitoringZoneRow = Database["public"]["Tables"]["monitoring_zones"]["Row"];
type MonitoringZoneInsert = Database["public"]["Tables"]["monitoring_zones"]["Insert"];

export interface SavedOfficialWatercourseReach extends OfficialWatercourseGeometry {
  zoneId: string;
  savedAt: string;
}

export class WatercourseReachReadOnlyError extends Error {
  readonly statusCode = 403;

  constructor() {
    super(
      "Du har læseadgang til vandløbsdata, men ikke rettighed til at gemme projektets strækning.",
    );
    this.name = "WatercourseReachReadOnlyError";
  }
}

export interface WatercourseReachDependencies {
  authorizeProject(
    client: ProjectAuthorizationClient,
    userId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  searchSource(query: string): Promise<OfficialWatercourseSuggestion[]>;
  fetchSource(id: string): Promise<OfficialWatercourseGeometry>;
  loadSaved(client: DataClient, projectId: string): Promise<SavedOfficialWatercourseReach | null>;
  persist(
    client: DataClient,
    projectId: string,
    userId: string,
    reach: OfficialWatercourseGeometry,
  ): Promise<SavedOfficialWatercourseReach>;
}

function isLngLat(value: unknown): value is LngLat {
  if (!Array.isArray(value) || value.length < 2) return false;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return (
    Number.isFinite(lng) && Number.isFinite(lat) && lng >= 7 && lng <= 16 && lat >= 54 && lat <= 58
  );
}

function geometryFromJson(value: Json | null): OfficialWatercourseGeometry["geometry"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, Json | undefined>;
  if (raw["type"] !== "MultiLineString" || !Array.isArray(raw["coordinates"])) return null;
  const lines: LngLat[][] = [];
  let vertexCount = 0;
  for (const rawLine of raw["coordinates"]) {
    if (!Array.isArray(rawLine) || rawLine.length < 2) return null;
    const line: LngLat[] = [];
    for (const rawPoint of rawLine) {
      if (!isLngLat(rawPoint)) return null;
      line.push([Number(rawPoint[0]), Number(rawPoint[1])]);
      vertexCount += 1;
      if (vertexCount > 20_000) return null;
    }
    lines.push(line);
  }
  return { type: "MultiLineString", coordinates: lines };
}

function metadataRecord(value: Json): Record<string, Json | undefined> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function jsonString(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function jsonNumber(value: Json | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function jsonStringArray(value: Json | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 10)
    : [];
}

function jsonBbox(value: Json | undefined): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const result = value.map(Number);
  return result.every(Number.isFinite) ? (result as [number, number, number, number]) : null;
}

function jsonCenter(
  latValue: number | null,
  lngValue: number | null,
  bbox: [number, number, number, number],
): { lat: number; lng: number } {
  if (
    latValue != null &&
    lngValue != null &&
    latValue >= 54 &&
    latValue <= 58 &&
    lngValue >= 7 &&
    lngValue <= 16
  ) {
    return { lat: latValue, lng: lngValue };
  }
  return { lat: (bbox[1] + bbox[3]) / 2, lng: (bbox[0] + bbox[2]) / 2 };
}

async function savedReachFromRow(
  row: MonitoringZoneRow,
): Promise<SavedOfficialWatercourseReach | null> {
  const geometry = geometryFromJson(row.geometry);
  const metadata = metadataRecord(row.source_metadata);
  const sourceId = jsonString(metadata["source_id"]);
  const sourceUrl = jsonString(metadata["source_url"]);
  const geometryHash = jsonString(metadata["geometry_sha256"]);
  const bbox = jsonBbox(metadata["bbox"]);
  if (
    row.zone_type !== "watercourse" ||
    row.status !== "active" ||
    row.source_type !== "imported" ||
    metadata["schema"] !== "gofreyra.watercourse-reach-source/v1" ||
    metadata["source_system"] !== "SDFI Danske Stednavne" ||
    metadata["crs"] !== "EPSG:4326" ||
    metadata["geometry_type"] !== "MultiLineString" ||
    !geometry ||
    !sourceId ||
    !POSTGRES_UUID.test(sourceId) ||
    !sourceUrl ||
    sourceUrl !== buildOfficialWatercourseGeometryUrl(sourceId) ||
    !geometryHash ||
    !/^[0-9a-f]{64}$/i.test(geometryHash) ||
    geometryHash !== (await sha256Hex(geometry)) ||
    !bbox
  ) {
    return null;
  }
  const vertexCount = geometry.coordinates.reduce((sum, line) => sum + line.length, 0);
  return {
    zoneId: row.id,
    savedAt: row.updated_at,
    id: sourceId,
    name: row.name,
    nameStatus: jsonString(metadata["name_status"]) ?? "ukendt",
    municipalities: jsonStringArray(metadata["municipalities"]),
    center: jsonCenter(row.centroid_lat, row.centroid_lng, bbox),
    bbox,
    geometry,
    segmentCount: geometry.coordinates.length,
    vertexCount,
    lengthM: jsonNumber(metadata["length_m"]) ?? 0,
    modifiedAt: jsonString(metadata["source_modified_at"]),
    geometryVersion: jsonNumber(metadata["geometry_version"]),
    sourceUrl,
    attribution: OFFICIAL_WATERCOURSE_ATTRIBUTION,
    disclaimer: OFFICIAL_WATERCOURSE_DISCLAIMER,
  };
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadSavedOfficialWatercourseReach(
  client: DataClient,
  projectId: string,
): Promise<SavedOfficialWatercourseReach | null> {
  const { data, error } = await client
    .from("monitoring_zones")
    .select("*")
    .eq("project_id", projectId)
    .eq("zone_type", "watercourse")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(2);
  if (error) throw new Error("Kunne ikke læse projektets gemte vandløbsstrækning.");
  if ((data?.length ?? 0) > 1) {
    throw new Error("Projektet har flere aktive vandløbsstrenge og kræver oprydning.");
  }
  if (!data?.[0]) return null;
  const saved = await savedReachFromRow(data[0]);
  if (!saved) throw new Error("Den gemte vandløbsstreng har ugyldig kildeproveniens.");
  return saved;
}

export async function persistOfficialWatercourseReach(
  client: DataClient,
  projectId: string,
  userId: string,
  reach: OfficialWatercourseGeometry,
): Promise<SavedOfficialWatercourseReach> {
  const fetchedAt = new Date().toISOString();
  const geometryHash = await sha256Hex(reach.geometry);
  const sourceMetadata: Json = {
    schema: "gofreyra.watercourse-reach-source/v1",
    source_system: "SDFI Danske Stednavne",
    source_id: reach.id,
    source_url: reach.sourceUrl,
    source_modified_at: reach.modifiedAt,
    fetched_at: fetchedAt,
    crs: "EPSG:4326",
    geometry_type: reach.geometry.type,
    geometry_version: reach.geometryVersion,
    geometry_sha256: geometryHash,
    bbox: reach.bbox,
    length_m: reach.lengthM,
    municipalities: reach.municipalities,
    name_status: reach.nameStatus,
    attribution: reach.attribution,
    disclaimer: reach.disclaimer,
  };
  const baseRow: MonitoringZoneInsert = {
    project_id: projectId,
    name: reach.name,
    zone_type: "watercourse",
    description: "Valgt officiel vandløbsstreng til før/efter-monitorering.",
    status: "active",
    color: "#2563eb",
    geometry: reach.geometry as unknown as Json,
    centroid_lat: reach.center.lat,
    centroid_lng: reach.center.lng,
    source_type: "imported",
    source_metadata: sourceMetadata,
    tags: ["watercourse_reach", "official", "danske_stednavne"],
  };

  const { data: existing, error: findError } = await client
    .from("monitoring_zones")
    .select("id")
    .eq("project_id", projectId)
    .eq("zone_type", "watercourse")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(2);
  if (findError) throw new Error("Kunne ikke kontrollere den gemte vandløbsstrækning.");
  if ((existing?.length ?? 0) > 1) {
    throw new Error("Projektet har flere aktive vandløbsstrenge og kræver oprydning.");
  }

  let saved: MonitoringZoneRow | null = null;
  if (existing?.[0]) {
    const { data, error } = await client
      .from("monitoring_zones")
      .update(baseRow)
      .eq("id", existing[0].id)
      .eq("project_id", projectId)
      .select("*")
      .single();
    if (error) throw new Error("Kunne ikke opdatere projektets vandløbsstrækning.");
    saved = data;
  } else {
    const { data, error } = await client
      .from("monitoring_zones")
      .insert({ ...baseRow, created_by: userId })
      .select("*")
      .single();
    if (error) throw new Error("Kunne ikke gemme projektets vandløbsstrækning.");
    saved = data;
  }

  const normalized = saved ? await savedReachFromRow(saved) : null;
  if (!normalized) throw new Error("Den gemte vandløbsstrækning kunne ikke valideres.");
  return normalized;
}

const DEFAULT_DEPENDENCIES: WatercourseReachDependencies = {
  authorizeProject: requireProjectNatureAccess,
  searchSource: searchOfficialWatercourses,
  fetchSource: fetchOfficialWatercourse,
  loadSaved: loadSavedOfficialWatercourseReach,
  persist: persistOfficialWatercourseReach,
};

function dependenciesWith(
  overrides: Partial<WatercourseReachDependencies>,
): WatercourseReachDependencies {
  return { ...DEFAULT_DEPENDENCIES, ...overrides };
}

export async function executeWatercourseSearch(
  data: WatercourseSearchInput,
  userId: string,
  client: DataClient,
  overrides: Partial<WatercourseReachDependencies> = {},
): Promise<OfficialWatercourseSuggestion[]> {
  const dependencies = dependenciesWith(overrides);
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    data.projectId,
  );
  return dependencies.searchSource(data.query);
}

export async function executeWatercoursePreview(
  data: WatercourseReachInput,
  userId: string,
  client: DataClient,
  overrides: Partial<WatercourseReachDependencies> = {},
): Promise<OfficialWatercourseGeometry> {
  const dependencies = dependenciesWith(overrides);
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    data.projectId,
  );
  return dependencies.fetchSource(data.watercourseId);
}

export async function executeWatercourseLoad(
  projectId: string,
  userId: string,
  client: DataClient,
  overrides: Partial<WatercourseReachDependencies> = {},
): Promise<SavedOfficialWatercourseReach | null> {
  const dependencies = dependenciesWith(overrides);
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    projectId,
  );
  const saved = await dependencies.loadSaved(client, projectId);
  if (!saved) return null;
  const official = await dependencies.fetchSource(saved.id);
  if ((await sha256Hex(saved.geometry)) !== (await sha256Hex(official.geometry))) {
    throw new Error(
      "Den officielle vandløbsgeometri er ændret siden gemning. Vælg og gem strækningen igen.",
    );
  }
  return {
    ...official,
    municipalities:
      saved.municipalities.length > 0 ? saved.municipalities : official.municipalities,
    zoneId: saved.zoneId,
    savedAt: saved.savedAt,
  };
}

export async function executeWatercourseSave(
  data: WatercourseReachInput,
  userId: string,
  client: DataClient,
  overrides: Partial<WatercourseReachDependencies> = {},
): Promise<SavedOfficialWatercourseReach> {
  const dependencies = dependenciesWith(overrides);
  const access = await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    data.projectId,
  );
  if (!access.canPersist) throw new WatercourseReachReadOnlyError();
  // The server re-fetches by allowlisted source ID; browser-supplied geometry is never persisted.
  const reach = await dependencies.fetchSource(data.watercourseId);
  return dependencies.persist(client, data.projectId, userId, reach);
}

export const searchOfficialWatercourseReaches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SearchInput.parse(raw))
  .handler(({ data, context }) => executeWatercourseSearch(data, context.userId, context.supabase));

export const previewOfficialWatercourseReach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReachInput.parse(raw))
  .handler(({ data, context }) =>
    executeWatercoursePreview(data, context.userId, context.supabase),
  );

export const getSavedOfficialWatercourseReach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ProjectInput.parse(raw))
  .handler(({ data, context }) =>
    executeWatercourseLoad(data.projectId, context.userId, context.supabase),
  );

export const saveOfficialWatercourseReach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReachInput.parse(raw))
  .handler(({ data, context }) => executeWatercourseSave(data, context.userId, context.supabase));

export { ProjectAccessDeniedError };
