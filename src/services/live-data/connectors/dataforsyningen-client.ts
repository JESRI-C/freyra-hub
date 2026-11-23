import { getLiveDataConfig } from "@/config/live-data-config";
import { isDemoDataEnabled } from "@/lib/data-mode";
import {
  fetchWithTimeout,
  fetchConnector,
  previewResponse,
  errorResponse,
  hasSourceGeometry,
} from "../live-data-client";
import type { ConnectorResponse } from "../live-data-client";
import type { ProjectGeometry } from "@/lib/supabase/types";
export interface GeoPlace {
  name: string;
  type: string;
  municipality?: string;
  region?: string;
  coordinates: [number, number];
}
export interface DataforsyningenData {
  nearestPlaces: GeoPlace[];
  municipalityName?: string;
  regionName?: string;
  fetchedAt: string;
}
const DATAFORDELER_BASE = "https://services.datafordeler.dk";
const OPEN_REVERSE_BASE = "https://api.dataforsyningen.dk/reverse";
interface ReverseGeoResponse {
  kommunekode?: string;
  kommunenavn?: string;
  regionsnavn?: string;
}
const PREVIEW_DATA: DataforsyningenData = {
  nearestPlaces: [
    {
      name: "Skallebæk Å",
      type: "Vandløb",
      municipality: "Haderslev",
      coordinates: [9.48, 55.26],
    },
    {
      name: "Stevning Skov",
      type: "Skov",
      municipality: "Haderslev",
      coordinates: [9.47, 55.27],
    },
  ],
  municipalityName: "Haderslev",
  regionName: "Region Syddanmark",
  fetchedAt: new Date().toISOString(),
};
export async function getStatus(): Promise<"live" | "preview" | "missing_key"> {
  const config = getLiveDataConfig();
  // Open geocoding API is always available when live data is enabled
  if (!config.isLiveDataEnabled) return "preview";
  return "live";
}
export async function fetchByGeometry(
  geometry: ProjectGeometry,
): Promise<ConnectorResponse<DataforsyningenData>> {
  const config = getLiveDataConfig();
  if (!config.isLiveDataEnabled) return fetchPreview();
  if (!hasSourceGeometry(geometry)) {
    return errorResponse(
      "Dataforsyningen kræver en gyldig projektgeometri med koordinater.",
      "invalid_geometry",
    );
  }
  const { lat, lng } = geometry.centroid!;
  // Path A: Datafordeler key present — use full place-name API
  if (config.credentials.datafordeler.present) {
    const key = config.credentials.datafordeler.key!;
    const result = await fetchConnector(async () => {
      const params = new URLSearchParams({
        username: "ANONYMOUS",
        password: key,
        x: String(lng),
        y: String(lat),
        buffer: "1000",
        srid: "4326",
      });
      const url = `${DATAFORDELER_BASE}/STEDNAVNE/Stednavne/1/rest/Stednavn?${params}`;
      const res = await fetchWithTimeout(url, { timeoutMs: 10000 });
      if (!res.ok) throw new Error(`Datafordeler API ${res.status}`);
      const json = (await res.json()) as {
        features?: Array<{
          properties: {
            navn: string;
            type: string;
            kommune?: string;
            region?: string;
          };
          geometry: {
            coordinates: [number, number];
          };
        }>;
      };
      if (!Array.isArray(json.features))
        throw new Error("Datafordeler svarede med et ugyldigt stednavneformat.");
      const nearestPlaces: GeoPlace[] = json.features.slice(0, 5).map((f) => ({
        name: f.properties.navn,
        type: f.properties.type,
        municipality: f.properties.kommune,
        region: f.properties.region,
        coordinates: f.geometry.coordinates,
      }));
      return { nearestPlaces, fetchedAt: new Date().toISOString() };
    });
    if (result.status !== "ok") return result;
    return result.data?.nearestPlaces.length
      ? result
      : errorResponse(
          "Datafordeler har ingen stednavne i det forespurgte område.",
          "no_coverage",
          result.latencyMs,
        );
  }
  // Path B: Open reverse-geocoding (no key required)
  const openResult = await fetchConnector(async () => {
    const params = new URLSearchParams({
      x: String(lng),
      y: String(lat),
      srid: "4326",
    });
    const res = await fetchWithTimeout(`${OPEN_REVERSE_BASE}?${params}`, { timeoutMs: 10000 });
    if (!res.ok) throw new Error(`Dataforsyningen reverse API ${res.status}`);
    const json = (await res.json()) as ReverseGeoResponse;
    return {
      nearestPlaces: [] as GeoPlace[],
      municipalityName: json.kommunenavn,
      regionName: json.regionsnavn,
      fetchedAt: new Date().toISOString(),
    };
  });
  if (openResult.status !== "ok") return openResult;
  return openResult.data?.municipalityName || openResult.data?.regionName
    ? openResult
    : errorResponse(
        "Dataforsyningen har ingen stedreference for koordinaterne.",
        "no_coverage",
        openResult.latencyMs,
      );
}
export async function fetchPreview(): Promise<ConnectorResponse<DataforsyningenData>> {
  return errorResponse(
    "Dataforsyningen er ikke konfigureret til live data. Forbind en verificeret kilde for at hente projektdata.",
    "disabled",
  );
}
export function normalizeResult(
  result: ConnectorResponse<DataforsyningenData>,
): Record<string, unknown> {
  return {
    mode: result.mode,
    status: result.status,
    latencyMs: result.latencyMs,
    placesFound: result.data?.nearestPlaces.length,
    municipality: result.data?.municipalityName,
    fetchedAt: result.data?.fetchedAt,
  };
}
