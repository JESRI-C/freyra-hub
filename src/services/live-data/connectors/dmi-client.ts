import { getLiveDataConfig } from "@/config/live-data-config";
import { fetchWithTimeout, fetchConnector, previewResponse } from "../live-data-client";
import type { ConnectorResponse } from "../live-data-client";
import type { ProjectGeometry } from "@/lib/supabase/types";

export interface DmiObservation {
  parameterId: string;
  value: number;
  unit: string;
  observed: string;
  stationId: string;
}

export interface DmiWeatherData {
  temperature?: DmiObservation;
  precipitation?: DmiObservation;
  windSpeed?: DmiObservation;
  humidity?: DmiObservation;
  observedAt: string;
  stationName?: string;
}

const DMI_OBS_PATH = "/v2/metObs/collections/observation/items";

export const PREVIEW_DATA: DmiWeatherData = {
  temperature: {
    parameterId: "temp_dry",
    value: 12.4,
    unit: "°C",
    observed: new Date().toISOString(),
    stationId: "preview",
  },
  precipitation: {
    parameterId: "precip_past10min",
    value: 0.2,
    unit: "mm",
    observed: new Date().toISOString(),
    stationId: "preview",
  },
  windSpeed: {
    parameterId: "wind_speed",
    value: 5.1,
    unit: "m/s",
    observed: new Date().toISOString(),
    stationId: "preview",
  },
  humidity: {
    parameterId: "humidity",
    value: 78,
    unit: "%",
    observed: new Date().toISOString(),
    stationId: "preview",
  },
  observedAt: new Date().toISOString(),
  stationName: "Preview Station",
};

export async function getStatus(): Promise<"live" | "preview" | "missing_key"> {
  const config = getLiveDataConfig();
  return config.isLiveDataEnabled ? "live" : "preview";
}

export async function fetchByGeometry(
  geometry: ProjectGeometry,
): Promise<ConnectorResponse<DmiWeatherData>> {
  const config = getLiveDataConfig();
  if (!config.isLiveDataEnabled) return previewResponse(PREVIEW_DATA);

  const lat = geometry.centroid?.lat;
  const lng = geometry.centroid?.lng;
  const base = config.dmiBaseUrl;

  const result = await fetchConnector(async () => {
    const params = new URLSearchParams({
      parameterId: "temp_dry,precip_past10min,wind_speed,humidity",
      limit: "4",
      ...(lat && lng ? { bbox: `${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}` } : {}),
    });
    const res = await fetchWithTimeout(`${base}${DMI_OBS_PATH}?${params}`);
    if (!res.ok) throw new Error(`DMI API ${res.status}`);
    const json = (await res.json()) as {
      features: Array<{
        properties: {
          parameterId: string;
          value: number;
          unit: string;
          observed: string;
          stationId: string;
        };
      }>;
    };

    const obs: DmiWeatherData = { observedAt: new Date().toISOString() };
    for (const f of json.features ?? []) {
      const p = f.properties;
      const o: DmiObservation = {
        parameterId: p.parameterId,
        value: p.value,
        unit: p.unit,
        observed: p.observed,
        stationId: p.stationId,
      };
      if (p.parameterId === "temp_dry") obs.temperature = o;
      else if (p.parameterId === "precip_past10min") obs.precipitation = o;
      else if (p.parameterId === "wind_speed") obs.windSpeed = o;
      else if (p.parameterId === "humidity") obs.humidity = o;
    }
    return obs;
  });

  // If live call failed or returned no usable data, fall back to preview (not error)
  if (result.status !== "ok" || !result.data?.temperature) {
    return { ...previewResponse(PREVIEW_DATA), latencyMs: result.latencyMs };
  }
  return result;
}

export async function fetchPreview(): Promise<ConnectorResponse<DmiWeatherData>> {
  return previewResponse(PREVIEW_DATA);
}

export function normalizeResult(
  result: ConnectorResponse<DmiWeatherData>,
): Record<string, unknown> {
  if (!result.data) return { mode: result.mode, status: result.status };
  return {
    mode: result.mode,
    status: result.status,
    latencyMs: result.latencyMs,
    temperature: result.data.temperature?.value,
    precipitation: result.data.precipitation?.value,
    windSpeed: result.data.windSpeed?.value,
    humidity: result.data.humidity?.value,
    observedAt: result.data.observedAt,
  };
}
