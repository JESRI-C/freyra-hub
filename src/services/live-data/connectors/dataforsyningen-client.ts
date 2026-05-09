import { getLiveDataConfig } from "@/config/live-data-config";
import {
  fetchWithTimeout,
  fetchConnector,
  previewResponse,
  missingKeyResponse,
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
  if (!config.credentials.datafordeler.present) return "missing_key";
  if (!config.isLiveDataEnabled) return "preview";
  return "live";
}

export async function fetchByGeometry(
  geometry: ProjectGeometry,
): Promise<ConnectorResponse<DataforsyningenData>> {
  const config = getLiveDataConfig();
  if (!config.isLiveDataEnabled) return previewResponse(PREVIEW_DATA);
  if (!config.credentials.datafordeler.present) return missingKeyResponse<DataforsyningenData>();

  const lat = geometry.centroid?.lat;
  const lng = geometry.centroid?.lng;
  if (!lat || !lng) return previewResponse(PREVIEW_DATA);

  const key = config.credentials.datafordeler.key!;

  return fetchConnector(async () => {
    const params = new URLSearchParams({
      username: "ANONYMOUS",
      password: key,
      x: String(lng),
      y: String(lat),
      buffer: "1000",
      srid: "4326",
    });
    const url = `${DATAFORDELER_BASE}/STEDNAVNE/Stednavne/1/rest/Stednavn?${params}`;
    const res = await fetchWithTimeout(url, { timeoutMs: 10_000 });
    if (!res.ok) throw new Error(`Datafordeler API ${res.status}`);
    const json = (await res.json()) as {
      features?: Array<{
        properties: {
          navn: string;
          type: string;
          kommune?: string;
          region?: string;
        };
        geometry: { coordinates: [number, number] };
      }>;
    };

    const nearestPlaces: GeoPlace[] = (json.features ?? []).slice(0, 5).map((f) => ({
      name: f.properties.navn,
      type: f.properties.type,
      municipality: f.properties.kommune,
      region: f.properties.region,
      coordinates: f.geometry.coordinates,
    }));

    return { nearestPlaces, fetchedAt: new Date().toISOString() };
  });
}

export async function fetchPreview(): Promise<ConnectorResponse<DataforsyningenData>> {
  return previewResponse(PREVIEW_DATA);
}

export function normalizeResult(
  result: ConnectorResponse<DataforsyningenData>,
): Record<string, unknown> {
  return {
    mode: result.mode,
    status: result.status,
    latencyMs: result.latencyMs,
    placesFound: result.data?.nearestPlaces.length ?? 0,
    municipality: result.data?.municipalityName,
    fetchedAt: result.data?.fetchedAt,
  };
}
