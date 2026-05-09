// Scaffold fetch functions for each connector.
// Returns fallback/preview data when API keys are not configured.
// In production, replace fallback blocks with real API calls.

import { CONNECTOR_REGISTRY } from "@/data/connectors-registry";
import type {
  EnvironmentalContextResult,
  ProjectEnvironmentalContext,
  LiveDataSnapshot,
  DataConnector,
  ProjectGeometry,
} from "@/lib/supabase/types";
import { getLiveDataConfig } from "@/config/live-data-config";
import { dmiClient, miljoeportalClient } from "@/services/live-data";

// Check if a specific connector is configured
function isConnectorConfigured(connector: DataConnector): boolean {
  if (!connector.requires_api_key) return true;
  if (!connector.env_key_name) return true;
  const val = (import.meta.env[connector.env_key_name] as string | undefined) ?? "";
  return Boolean(val);
}

// Generic scaffold result when connector is not configured
function previewResult(
  connector: DataConnector,
  projectId: string,
  fallbackData: Record<string, unknown>,
  summary: string,
): EnvironmentalContextResult {
  return {
    connector,
    projectId,
    fetchedAt: new Date().toISOString(),
    status: "fallback",
    data: fallbackData,
    summary,
  };
}

// ─── Individual connector fetch functions ─────────────────────────────────────

export async function fetchNatureContext(
  projectId: string,
  location: string,
): Promise<EnvironmentalContextResult> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "miljoeportal-arealdata")!;
  // Scaffold: return preview data; replace with real WFS call in production
  return previewResult(
    connector,
    projectId,
    {
      protected_nature_types: ["§3 Eng", "§3 Mose"],
      watercourses_within_500m: 2,
      nearest_watercourse_m: 45,
      natura2000_nearby: false,
      buffer_zones: ["Å-beskyttelseslinje 150m"],
    },
    `Naturkontekst for ${location}: 2 §3-naturtyper inden for 500m, vandløb 45m fra projektgrænse.`,
  );
}

export async function fetchSatelliteVegetation(
  projectId: string,
  location: string,
): Promise<EnvironmentalContextResult> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "copernicus-sentinel-2")!;
  if (!isConnectorConfigured(connector)) {
    return previewResult(
      connector,
      projectId,
      {
        ndvi_mean: 0.42,
        ndvi_trend: "stable",
        land_cover_dominant: "Urban/semi-urban",
        green_fraction_pct: 18,
        analysis_date: "2026-04-15",
      },
      `Sentinel-2 preview: NDVI 0.42 (stabil), 18% grøn arealandel nær ${location}.`,
    );
  }
  // TODO: real Copernicus Dataspace API call
  return previewResult(
    connector,
    projectId,
    {},
    "Sentinel-2 forbundet — kald ikke implementeret endnu.",
  );
}

export async function fetchRainfallContext(
  projectId: string,
  municipality: string,
): Promise<EnvironmentalContextResult> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "dmi-opendata")!;
  if (!isConnectorConfigured(connector)) {
    return previewResult(
      connector,
      projectId,
      {
        annual_precipitation_mm: 612,
        design_rain_10yr_mm_hr: 14.2,
        design_rain_100yr_mm_hr: 22.8,
        wettest_month: "Oktober",
        climate_zone: "Tempereret, maritime",
      },
      `DMI preview: ${municipality} — 612mm/år, 10-årsregn: 14.2mm/t.`,
    );
  }
  // TODO: real DMI Open Data API call
  return previewResult(connector, projectId, {}, "DMI forbundet — kald ikke implementeret endnu.");
}

export async function fetchGroundwaterContext(
  projectId: string,
  location: string,
): Promise<EnvironmentalContextResult> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "geus-jupiter")!;
  // GEUS Jupiter is open, no key needed
  return previewResult(
    connector,
    projectId,
    {
      boreholes_within_500m: 3,
      nearest_borehole_m: 120,
      groundwater_depth_m: 2.8,
      groundwater_type: "Primær grundvandsmagasin",
      drinking_water_interest: true,
    },
    `GEUS Jupiter preview: 3 boringer inden for 500m, grundvand 2.8m u.t. nær ${location}.`,
  );
}

export async function fetchTerrainContext(projectId: string): Promise<EnvironmentalContextResult> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "datafordeler-dhm")!;
  if (!isConnectorConfigured(connector)) {
    return previewResult(
      connector,
      projectId,
      {
        elevation_mean_m: 8.4,
        slope_max_pct: 3.2,
        slope_mean_pct: 1.1,
        flow_direction: "Nord-nordvest",
        terrain_type: "Svagt skrånende flodslette",
      },
      `DHM preview: Terræn 8.4m o.h., maks hældning 3.2%, afstrømning mod NNV.`,
    );
  }
  return previewResult(connector, projectId, {}, "DHM forbundet — kald ikke implementeret endnu.");
}

export async function fetchProtectedNatureContext(
  projectId: string,
): Promise<EnvironmentalContextResult> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "natura2000-eea")!;
  return previewResult(
    connector,
    projectId,
    {
      natura2000_sites_within_5km: 1,
      nearest_natura2000_name: "Vadehavet",
      nearest_natura2000_km: 4.2,
      habitat_types_present: ["6510 Lavlandsenge"],
      bird_directive_relevant: false,
    },
    `Natura 2000 preview: Nærmeste Natura 2000-område 4.2km væk.`,
  );
}

export async function fetchSoilContext(projectId: string): Promise<EnvironmentalContextResult> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "esdac-soil")!;
  return previewResult(
    connector,
    projectId,
    {
      soil_type: "Lerjord",
      permeability: "Lav",
      erosion_risk: "Moderat",
      organic_carbon_pct: 2.1,
      runoff_curve_number: 74,
    },
    `ESDAC preview: Lerjord, lav permeabilitet, afstrømningstal CN=74.`,
  );
}

// ─── Aggregate context builder ─────────────────────────────────────────────────

export async function buildProjectEnvironmentalContext(
  projectId: string,
  projectName: string,
  location: string,
  municipality: string,
  geometry?: ProjectGeometry, // NEW optional param
): Promise<ProjectEnvironmentalContext> {
  // Derive a location label from geometry centroid if available
  const locationLabel = geometry?.centroid
    ? `${geometry.centroid.lat.toFixed(4)}°N, ${geometry.centroid.lng.toFixed(4)}°Ø`
    : location;

  const [natureCtx, satelliteCtx, rainfallCtx, groundwaterCtx, terrainCtx, protectedCtx, soilCtx] =
    await Promise.all([
      fetchNatureContext(projectId, locationLabel).catch(() => null),
      fetchSatelliteVegetation(projectId, locationLabel).catch(() => null),
      fetchRainfallContext(projectId, municipality).catch(() => null),
      fetchGroundwaterContext(projectId, locationLabel).catch(() => null),
      fetchTerrainContext(projectId).catch(() => null),
      fetchProtectedNatureContext(projectId).catch(() => null),
      fetchSoilContext(projectId).catch(() => null),
    ]);

  const results = [
    natureCtx,
    satelliteCtx,
    rainfallCtx,
    groundwaterCtx,
    terrainCtx,
    protectedCtx,
    soilCtx,
  ];
  const successCount = results.filter((r) => r !== null).length;
  const completeness = Math.round((successCount / 7) * 100);

  // Derive simple scores from fallback data
  const natura2000Nearby = ((protectedCtx?.data.nearest_natura2000_km as number) ?? 10) < 2;
  const watercourseClose = ((natureCtx?.data.nearest_watercourse_m as number) ?? 500) < 100;
  const groundwaterShallow = ((groundwaterCtx?.data.groundwater_depth_m as number) ?? 5) < 3;

  let natureSensitivity: "low" | "medium" | "high" | "critical" = "low";
  if (natura2000Nearby) natureSensitivity = "critical";
  else if (watercourseClose && groundwaterShallow) natureSensitivity = "high";
  else if (watercourseClose || groundwaterShallow) natureSensitivity = "medium";

  const slopePct = (terrainCtx?.data.slope_max_pct as number) ?? 0;
  const cn = (soilCtx?.data.runoff_curve_number as number) ?? 60;
  let runoffRisk: "low" | "medium" | "high" | "critical" = "low";
  if (watercourseClose && cn > 70 && slopePct > 5) runoffRisk = "critical";
  else if (watercourseClose && cn > 65) runoffRisk = "high";
  else if (cn > 65 || slopePct > 3) runoffRisk = "medium";

  // Tilt runoff risk upward for very large project areas
  if (geometry?.areaHa != null && geometry.areaHa > 5000) {
    if (runoffRisk === "low") runoffRisk = "medium";
    else if (runoffRisk === "medium") runoffRisk = "high";
  }

  const resolvedGeometry: ProjectGeometry = geometry ?? {
    polygon: null,
    centroid: null,
    areaHa: null,
    hasValidGeometry: false,
    geometrySource: "none",
    bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
  };

  // Live data integration
  const liveConfig = getLiveDataConfig();
  let liveData: LiveDataSnapshot | undefined;

  if (resolvedGeometry.hasValidGeometry) {
    const [weatherResult, natureResult] = await Promise.all([
      liveConfig.isLiveDataEnabled
        ? dmiClient.fetchByGeometry(resolvedGeometry).catch(() => dmiClient.fetchPreview())
        : dmiClient.fetchPreview(),
      liveConfig.isLiveDataEnabled
        ? miljoeportalClient
            .fetchByGeometry(resolvedGeometry)
            .catch(() => miljoeportalClient.fetchPreview())
        : miljoeportalClient.fetchPreview(),
    ]);

    const weatherNorm = dmiClient.normalizeResult(weatherResult);
    const natureNorm = miljoeportalClient.normalizeResult(natureResult);

    liveData = {
      weather: weatherResult.data
        ? {
            mode: weatherResult.mode,
            status: weatherResult.status,
            temperature:
              typeof weatherNorm.temperature === "number" ? weatherNorm.temperature : undefined,
            precipitation:
              typeof weatherNorm.precipitation === "number" ? weatherNorm.precipitation : undefined,
            windSpeed:
              typeof weatherNorm.windSpeed === "number" ? weatherNorm.windSpeed : undefined,
            humidity: typeof weatherNorm.humidity === "number" ? weatherNorm.humidity : undefined,
            fetchedAt: weatherResult.fetchedAt,
          }
        : null,
      nature:
        natureResult.data !== null
          ? {
              mode: natureResult.mode,
              status: natureResult.status,
              registrationCount:
                typeof natureNorm.registrationCount === "number" ? natureNorm.registrationCount : 0,
              protectedCount:
                typeof natureNorm.protectedCount === "number" ? natureNorm.protectedCount : 0,
              fetchedAt:
                typeof natureNorm.fetchedAt === "string"
                  ? natureNorm.fetchedAt
                  : new Date().toISOString(),
            }
          : null,
      fetchedAt: new Date().toISOString(),
    };
  } else {
    const [weatherPreview, naturePreview] = await Promise.all([
      dmiClient.fetchPreview(),
      miljoeportalClient.fetchPreview(),
    ]);
    const weatherNorm = dmiClient.normalizeResult(weatherPreview);
    const natureNorm = miljoeportalClient.normalizeResult(naturePreview);
    liveData = {
      weather: weatherPreview.data
        ? {
            mode: weatherPreview.mode,
            status: weatherPreview.status,
            temperature:
              typeof weatherNorm.temperature === "number" ? weatherNorm.temperature : undefined,
            precipitation:
              typeof weatherNorm.precipitation === "number" ? weatherNorm.precipitation : undefined,
            windSpeed:
              typeof weatherNorm.windSpeed === "number" ? weatherNorm.windSpeed : undefined,
            humidity: typeof weatherNorm.humidity === "number" ? weatherNorm.humidity : undefined,
            fetchedAt: weatherPreview.fetchedAt,
          }
        : null,
      nature: naturePreview.data
        ? {
            mode: naturePreview.mode,
            status: naturePreview.status,
            registrationCount:
              typeof natureNorm.registrationCount === "number" ? natureNorm.registrationCount : 0,
            protectedCount:
              typeof natureNorm.protectedCount === "number" ? natureNorm.protectedCount : 0,
            fetchedAt:
              typeof natureNorm.fetchedAt === "string"
                ? natureNorm.fetchedAt
                : new Date().toISOString(),
          }
        : null,
      fetchedAt: new Date().toISOString(),
    };
  }

  return {
    projectId,
    projectName,
    location,
    analyzedAt: new Date().toISOString(),
    natureContext: natureCtx,
    watercourseContext: null, // placeholder for future EU-Hydro connector
    satelliteContext: satelliteCtx,
    rainfallContext: rainfallCtx,
    terrainContext: terrainCtx,
    groundwaterContext: groundwaterCtx,
    protectedNatureContext: protectedCtx,
    soilContext: soilCtx,
    overallReadiness: completeness >= 80 ? "complete" : completeness >= 40 ? "partial" : "pending",
    scores: {
      natureSensitivity,
      runoffRisk,
      dataCompleteness: completeness,
    },
    geometry: resolvedGeometry,
    liveData,
  };
}
