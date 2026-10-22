// Real-data connector wrappers.
// Where a live source exists (Miljøportal §3 + vandløb, DMI observationer),
// we call it when the project has a valid centroid. Otherwise vi returnerer
// preview-data så UI'et altid har noget at vise.

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
import { fetchProjectLiveData } from "@/lib/live-data.functions";
import {
  fetchParagraph3Overlap,
  fetchWatercourses,
} from "@/services/nature/paragraph3-service";
import { fetchEnvironmentalBundle, type EnvironmentalBundle } from "@/lib/environmental.functions";


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
  centroid?: { lat: number; lng: number } | null,
  areaHa?: number | null,
): Promise<EnvironmentalContextResult> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "miljoeportal-arealdata")!;

  // Uden centroid kan vi ikke lave et opslag mod Miljøportalen — returner preview.
  if (!centroid) {
    return previewResult(
      connector,
      projectId,
      {
        protected_nature_types: ["Ikke beregnet"],
        watercourses_within_500m: null,
        nearest_watercourse_m: null,
        natura2000_nearby: null,
        buffer_zones: [],
      },
      `Naturkontekst for ${location}: kræver projektgeometri for at kunne beregnes.`,
    );
  }

  try {
    const [p3, watercourses] = await Promise.all([
      fetchParagraph3Overlap(centroid.lat, centroid.lng, areaHa ?? 1).catch(() => null),
      fetchWatercourses(centroid.lat, centroid.lng).catch(() => []),
    ]);

    // Groft nærmeste-afstands-estimat: første koordinat på hver linje.
    let nearestM: number | null = null;
    for (const w of watercourses) {
      const first = w.coordinates[0];
      if (!first) continue;
      const [lng, lat] = first;
      const dLat = (lat - centroid.lat) * 111_320;
      const dLng = (lng - centroid.lng) * 111_320 * Math.cos((centroid.lat * Math.PI) / 180);
      const d = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
      if (nearestM === null || d < nearestM) nearestM = d;
    }

    const natureTypes = p3?.natureTypes ?? [];
    const summary =
      p3 && p3.areas.length > 0
        ? `Naturkontekst: ${p3.areas.length} §3-arealer i området (${natureTypes.join(", ")}), ${watercourses.length} vandløb${nearestM !== null ? `, nærmeste ~${nearestM} m` : ""}.`
        : `Naturkontekst: Ingen §3-registreringer fundet i området, ${watercourses.length} vandløb${nearestM !== null ? `, nærmeste ~${nearestM} m` : ""}.`;

    return {
      connector,
      projectId,
      fetchedAt: new Date().toISOString(),
      status: "success",
      data: {
        protected_nature_types: natureTypes,
        protected_nature_ha: p3?.overlapHa ?? 0,
        protected_nature_overlap_pct: p3?.overlapPercent ?? 0,
        watercourses_within_500m: watercourses.length,
        nearest_watercourse_m: nearestM,
      },
      summary,
    };
  } catch (err) {
    return previewResult(
      connector,
      projectId,
      { error: err instanceof Error ? err.message : "Ukendt fejl" },
      `Naturkontekst for ${location}: kunne ikke hentes (bruger preview).`,
    );
  }
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

// ─── Bundle-backed context builders ────────────────────────────────────────────

async function buildNatureCtx(
  projectId: string,
  location: string,
  bundle: EnvironmentalBundle | null,
  centroid: { lat: number; lng: number } | null,
  areaHa: number | null,
): Promise<EnvironmentalContextResult | null> {
  if (bundle) {
    const connector = CONNECTOR_REGISTRY.find((c) => c.id === "miljoeportal-arealdata")!;
    const { nature } = bundle;
    return {
      connector,
      projectId,
      fetchedAt: bundle.fetchedAt,
      status: "success",
      data: {
        protected_nature_types: nature.natureTypes,
        protected_nature_ha: nature.paragraph3AreasHa,
        protected_nature_overlap_pct: nature.paragraph3Percent,
        watercourses_within_500m: nature.watercourseCount,
        nearest_watercourse_m: nature.nearestWatercourseM,
      },
      summary:
        nature.natureTypes.length > 0
          ? `Naturkontekst: ${nature.paragraph3AreasHa} ha §3 (${nature.natureTypes.join(", ")}), ${nature.watercourseCount} vandløb${nature.nearestWatercourseM !== null ? `, nærmeste ~${nature.nearestWatercourseM} m` : ""}.`
          : `Naturkontekst: Ingen §3-registreringer i området, ${nature.watercourseCount} vandløb${nature.nearestWatercourseM !== null ? `, nærmeste ~${nature.nearestWatercourseM} m` : ""}.`,
    };
  }
  return fetchNatureContext(projectId, location, centroid, areaHa).catch(() => null);
}

async function buildRainfallCtx(
  projectId: string,
  municipality: string,
  bundle: EnvironmentalBundle | null,
): Promise<EnvironmentalContextResult | null> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "dmi-opendata")!;
  if (!bundle) return fetchRainfallContext(projectId, municipality).catch(() => null);
  const { rainfall } = bundle;
  return {
    connector,
    projectId,
    fetchedAt: bundle.fetchedAt,
    status: rainfall.source === "dmi-live" ? "success" : "fallback",
    data: {
      annual_precipitation_mm: rainfall.annualMm,
      design_rain_10yr_mm_hr: rainfall.designRain10yrMmHr,
      design_rain_100yr_mm_hr: rainfall.designRain100yrMmHr,
    },
    summary: `Nedbør (${rainfall.source === "dmi-live" ? "DMI" : "klimanorm"}): ${rainfall.annualMm} mm/år, 10-årsregn ${rainfall.designRain10yrMmHr} mm/t.`,
  };
}

async function buildGroundwaterCtx(
  projectId: string,
  location: string,
  bundle: EnvironmentalBundle | null,
): Promise<EnvironmentalContextResult | null> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "geus-jupiter")!;
  if (!bundle) return fetchGroundwaterContext(projectId, location).catch(() => null);
  const { groundwater } = bundle;
  return {
    connector,
    projectId,
    fetchedAt: bundle.fetchedAt,
    status: "success",
    data: {
      boreholes_within_500m: groundwater.boreholesWithin500m,
      nearest_borehole_m: groundwater.nearestBoreholeM,
      groundwater_depth_m: groundwater.depthM,
    },
    summary: `GEUS Jupiter: ${groundwater.boreholesWithin500m} boringer <500 m${groundwater.nearestBoreholeM !== null ? `, nærmeste ${groundwater.nearestBoreholeM} m` : ""}${groundwater.depthM !== null ? `, vandstand ${groundwater.depthM} m u.t.` : ""}.`,
  };
}

async function buildTerrainCtx(
  projectId: string,
  bundle: EnvironmentalBundle | null,
): Promise<EnvironmentalContextResult | null> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "datafordeler-dhm")!;
  if (!bundle || bundle.terrain.elevationM === null) return fetchTerrainContext(projectId).catch(() => null);
  const { terrain } = bundle;
  return {
    connector,
    projectId,
    fetchedAt: bundle.fetchedAt,
    status: "success",
    data: {
      elevation_mean_m: terrain.elevationM,
      slope_max_pct: terrain.slopePct,
      slope_mean_pct: terrain.slopePct,
      terrain_type: terrain.aspect,
    },
    summary: `DHM: Terræn ${terrain.elevationM} m o.h., hældning ~${terrain.slopePct}% (${terrain.aspect}).`,
  };
}

async function buildProtectedCtx(
  projectId: string,
  bundle: EnvironmentalBundle | null,
): Promise<EnvironmentalContextResult | null> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "natura2000-eea")!;
  if (!bundle) return fetchProtectedNatureContext(projectId).catch(() => null);
  const { natura2000 } = bundle;
  const km = natura2000.withinM !== null ? Math.round(natura2000.withinM / 100) / 10 : null;
  return {
    connector,
    projectId,
    fetchedAt: bundle.fetchedAt,
    status: "success",
    data: {
      natura2000_sites_within_5km: natura2000.sitesWithin5km,
      nearest_natura2000_name: natura2000.nearestName,
      nearest_natura2000_km: km,
    },
    summary:
      natura2000.nearestName && km !== null
        ? `Natura 2000: Nærmeste ${natura2000.nearestName} ${km} km væk.`
        : `Natura 2000: Ingen habitatområder i nærheden.`,
  };
}

async function buildSoilCtx(
  projectId: string,
  bundle: EnvironmentalBundle | null,
): Promise<EnvironmentalContextResult | null> {
  const connector = CONNECTOR_REGISTRY.find((c) => c.id === "esdac-soil")!;
  if (!bundle) return fetchSoilContext(projectId).catch(() => null);
  const { soil } = bundle;
  return {
    connector,
    projectId,
    fetchedAt: bundle.fetchedAt,
    status: "success",
    data: {
      soil_type: soil.dominantType,
      permeability: soil.permeability,
      organic_carbon_pct: soil.organicPct,
      runoff_curve_number: soil.curveNumber,
    },
    summary: `Jordbund (GEUS): ${soil.dominantType}, ${soil.permeability} permeabilitet, CN=${soil.curveNumber}.`,
  };
}

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

  // Hent alle open-data konnektorer i én servertur når vi har en centroid.
  const bundle: EnvironmentalBundle | null = geometry?.centroid
    ? await fetchEnvironmentalBundle({
        data: {
          lat: geometry.centroid.lat,
          lng: geometry.centroid.lng,
          areaHa: geometry.areaHa ?? undefined,
        },
      }).catch(() => null)
    : null;

  const [natureCtx, satelliteCtx, rainfallCtx, groundwaterCtx, terrainCtx, protectedCtx, soilCtx] =
    await Promise.all([
      buildNatureCtx(projectId, locationLabel, bundle, geometry?.centroid ?? null, geometry?.areaHa ?? null),
      fetchSatelliteVegetation(projectId, locationLabel).catch(() => null),
      buildRainfallCtx(projectId, municipality, bundle),
      buildGroundwaterCtx(projectId, locationLabel, bundle),
      buildTerrainCtx(projectId, bundle),
      buildProtectedCtx(projectId, bundle),
      buildSoilCtx(projectId, bundle),
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
    // Route live connector calls through a TanStack server function so the
    // outbound HTTP runs server-side (no browser CORS, secrets stay on the
    // server). When live mode is off we keep the local preview path.
    const bundle = liveConfig.isLiveDataEnabled
      ? await fetchProjectLiveData({ data: { geometry: resolvedGeometry } }).catch(() => null)
      : null;

    const weatherResult = bundle?.weather ?? (await dmiClient.fetchPreview());
    const natureResult = bundle?.nature ?? (await miljoeportalClient.fetchPreview());


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
