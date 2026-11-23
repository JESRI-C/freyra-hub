import { getLiveDataConfig } from "@/config/live-data-config";
import { isDemoDataEnabled } from "@/lib/data-mode";
import {
  fetchWithTimeout,
  fetchConnector,
  previewResponse,
  missingKeyResponse,
  errorResponse,
  hasSourceGeometry,
} from "../live-data-client";
import type { ConnectorResponse } from "../live-data-client";
import type { ProjectGeometry } from "@/lib/supabase/types";
export interface SentinelScene {
  id: string;
  datetime: string;
  cloudCover?: number;
  platform: string;
  downloadUrl?: string;
}
export interface CopernicusData {
  scenes: SentinelScene[];
  latestNdviEstimate?: number;
  ndviIsSimulated: boolean;
  areaKm2?: number;
  fetchedAt: string;
}
const STAC_BASE = "https://catalogue.dataspace.copernicus.eu/stac/collections/SENTINEL-2/items";
const PREVIEW_DATA: CopernicusData = {
  scenes: [
    {
      id: "S2B_MSIL2A_preview",
      datetime: new Date(Date.now() - 7 * 86400000).toISOString(),
      cloudCover: 12.3,
      platform: "sentinel-2b",
    },
    {
      id: "S2A_MSIL2A_preview",
      datetime: new Date(Date.now() - 17 * 86400000).toISOString(),
      cloudCover: 4.1,
      platform: "sentinel-2a",
    },
  ],
  latestNdviEstimate: 0.68,
  ndviIsSimulated: true,
  fetchedAt: new Date().toISOString(),
};
export async function getStatus(): Promise<"live" | "preview" | "missing_key"> {
  const config = getLiveDataConfig();
  if (!config.credentials.copernicus.present) return "missing_key";
  if (!config.isLiveDataEnabled) return "preview";
  return "live";
}
export async function fetchByGeometry(
  geometry: ProjectGeometry,
): Promise<ConnectorResponse<CopernicusData>> {
  const config = getLiveDataConfig();
  if (!config.isLiveDataEnabled) return fetchPreview();
  if (!config.credentials.copernicus.present) return missingKeyResponse<CopernicusData>();
  if (!hasSourceGeometry(geometry)) {
    return errorResponse(
      "Copernicus kræver en gyldig projektgeometri med koordinater.",
      "invalid_geometry",
    );
  }
  const { lat, lng } = geometry.centroid!;
  const token = config.credentials.copernicus.token!;
  const delta = 0.1;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  const result = await fetchConnector(async () => {
    const params = new URLSearchParams({
      bbox,
      limit: "5",
      datetime: `${new Date(Date.now() - 90 * 86400000).toISOString()}/${new Date().toISOString()}`,
    });
    const res = await fetchWithTimeout(`${STAC_BASE}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 15000,
    });
    if (!res.ok) throw new Error(`Copernicus STAC ${res.status}`);
    const json = (await res.json()) as {
      features?: Array<{
        id: string;
        properties: {
          datetime: string;
          "eo:cloud_cover"?: number;
          platform: string;
        };
        assets?: Record<
          string,
          {
            href: string;
          }
        >;
      }>;
    };
    if (!Array.isArray(json.features))
      throw new Error("Copernicus svarede med et ugyldigt scenekatalog.");
    const scenes: SentinelScene[] = json.features.map((f) => ({
      id: f.id,
      datetime: f.properties.datetime,
      cloudCover: f.properties["eo:cloud_cover"],
      platform: f.properties.platform,
      downloadUrl: f.assets?.["visual"]?.href,
    }));
    return { scenes, ndviIsSimulated: false, fetchedAt: new Date().toISOString() };
  });
  if (result.status !== "ok") return result;
  return result.data?.scenes.length
    ? result
    : errorResponse(
        "Copernicus har ingen scener for området og perioden.",
        "no_coverage",
        result.latencyMs,
      );
}
export async function fetchPreview(): Promise<ConnectorResponse<CopernicusData>> {
  return errorResponse(
    "Copernicus er ikke konfigureret til live data. Forbind en verificeret kilde for at hente projektdata.",
    "disabled",
  );
}
export function normalizeResult(
  result: ConnectorResponse<CopernicusData>,
): Record<string, unknown> {
  return {
    mode: result.mode,
    status: result.status,
    latencyMs: result.latencyMs,
    sceneCount: result.data?.scenes.length,
    latestScene: result.data?.scenes[0]?.datetime,
    latestCloudCover: result.data?.scenes[0]?.cloudCover,
    ndviEstimate: result.data?.latestNdviEstimate,
    fetchedAt: result.data?.fetchedAt,
  };
}
