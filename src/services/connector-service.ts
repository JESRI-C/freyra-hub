// Customer context reports only retrieved evidence. Unavailable connectors never create preview measurements.
import { CONNECTOR_REGISTRY } from "@/data/connectors-registry";
import type {
  EnvironmentalContextResult,
  ProjectEnvironmentalContext,
  ProjectGeometry,
} from "@/lib/supabase/types";
import {
  fetchParagraph3Overlap,
  fetchWatercourses,
  OFFICIAL_NATURE_SOURCE,
  OFFICIAL_WATERCOURSE_SOURCE,
} from "@/services/nature/paragraph3-service";

function unavailable(
  connectorId: string,
  projectId: string,
  summary: string,
  error = false,
): EnvironmentalContextResult {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === connectorId);
  if (!connector) throw new Error(`Ukendt datakilde: ${connectorId}`);
  return {
    connector,
    projectId,
    fetchedAt: new Date().toISOString(),
    status: error ? "error" : "not_configured",
    data: {},
    summary,
  };
}
export async function fetchNatureContext(
  projectId: string,
  _location: string,
  centroid?: { lat: number; lng: number } | null,
  areaHa?: number | null,
  polygon?: ProjectGeometry["polygon"],
): Promise<EnvironmentalContextResult> {
  if (!centroid || !polygon)
    return unavailable(
      "miljoeportal-arealdata",
      projectId,
      "§3-overlap er ikke målt: en gyldig projektpolygon og officiel datakilde kræves. Fotopositioner og vandløbslinje erstatter ikke analysepolygonen.",
    );
  try {
    const [nature, water] = await Promise.all([
      fetchParagraph3Overlap(centroid.lat, centroid.lng, areaHa ?? 0, 0.02, polygon),
      fetchWatercourses(centroid.lat, centroid.lng),
    ]);
    return {
      connector: CONNECTOR_REGISTRY.find((c) => c.id === "miljoeportal-arealdata")!,
      projectId,
      fetchedAt: nature.fetchedAt,
      status: "success",
      data: {
        protected_nature_types: nature.natureTypes,
        protected_nature_ha: nature.overlapHa,
        protected_nature_overlap_pct: nature.overlapPercent,
        watercourse_features_in_query: water.length,
        source: OFFICIAL_NATURE_SOURCE,
        watercourse_source: OFFICIAL_WATERCOURSE_SOURCE,
      },
      summary: `Screening: ${nature.overlapHa.toFixed(2)} ha geometrisk §3-overlap. ${water.length} vandløbsfeatures i forespørgselsområdet. Ingen afstand eller juridisk konklusion er udledt.`,
    };
  } catch (error) {
    return unavailable(
      "miljoeportal-arealdata",
      projectId,
      `Naturgrundlaget kunne ikke verificeres: ${error instanceof Error ? error.message : String(error)}. Manglende data betyder ikke fravær af beskyttet natur.`,
      true,
    );
  }
}
export async function fetchSatelliteVegetation(projectId: string, _location: string) {
  return unavailable(
    "copernicus-sentinel-2",
    projectId,
    "NDVI er ikke beregnet. Der kræves verificerede røde og nærinfrarøde spektralbånd.",
  );
}
export async function fetchRainfallContext(projectId: string, _municipality: string) {
  return unavailable(
    "dmi-opendata",
    projectId,
    "Nedbør og dimensioneringsregn er ikke målt eller verificeret for projektet.",
  );
}
export async function fetchGroundwaterContext(projectId: string, _location: string) {
  return unavailable(
    "geus-jupiter",
    projectId,
    "Grundvand og boringer er ikke verificeret. Ingen vandstand eller antal antages.",
  );
}
export async function fetchTerrainContext(projectId: string) {
  return unavailable("datafordeler-dhm", projectId, "Terrænhøjde og hældning er ikke verificeret.");
}
export async function fetchProtectedNatureContext(projectId: string) {
  return unavailable(
    "natura2000-eea",
    projectId,
    "Natura 2000-afstand og områdets bindinger er ikke verificeret.",
  );
}
export async function fetchSoilContext(projectId: string) {
  return unavailable(
    "esdac-soil",
    projectId,
    "Jordbund, organisk indhold og afstrømningskoefficient er ikke verificeret.",
  );
}
export async function buildProjectEnvironmentalContext(
  projectId: string,
  projectName: string,
  location: string,
  municipality: string,
  geometry?: ProjectGeometry,
): Promise<ProjectEnvironmentalContext> {
  const [nature, satellite, rainfall, groundwater, terrain, protectedNature, soil] =
    await Promise.all([
      fetchNatureContext(
        projectId,
        location,
        geometry?.centroid,
        geometry?.areaHa,
        geometry?.polygon,
      ),
      fetchSatelliteVegetation(projectId, location),
      fetchRainfallContext(projectId, municipality),
      fetchGroundwaterContext(projectId, location),
      fetchTerrainContext(projectId),
      fetchProtectedNatureContext(projectId),
      fetchSoilContext(projectId),
    ]);
  return {
    projectId,
    projectName,
    location,
    analyzedAt: new Date().toISOString(),
    natureContext: nature,
    satelliteContext: satellite,
    rainfallContext: rainfall,
    groundwaterContext: groundwater,
    terrainContext: terrain,
    protectedNatureContext: protectedNature,
    soilContext: soil,
    watercourseContext: null,
    overallReadiness: nature.status === "success" ? "partial" : "pending",
    scores: { natureSensitivity: "unknown", runoffRisk: "unknown", dataCompleteness: null },
    geometry: geometry ?? {
      polygon: null,
      centroid: null,
      areaHa: null,
      hasValidGeometry: false,
      geometrySource: "none",
      bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
    },
  };
}
