import { getLiveDataConfig } from "@/config/live-data-config";
import { fetchWithTimeout, fetchConnector, previewResponse } from "../live-data-client";
import type { ConnectorResponse } from "../live-data-client";
import type { ProjectGeometry } from "@/lib/supabase/types";

export interface NatureRegistration {
  speciesName: string;
  danishName?: string;
  group: string;
  observationDate?: string;
  protected: boolean;
  source: string;
}

export interface MiljoeportalData {
  registrations: NatureRegistration[];
  protectedHabitats: string[];
  nearestProtectedArea?: string;
  fetchedAt: string;
}

const NATURDATA_BASE = "https://naturdata.miljoeportal.dk/api";

const PREVIEW_DATA: MiljoeportalData = {
  registrations: [
    {
      speciesName: "Bufo bufo",
      danishName: "Skrubtudse",
      group: "Reptiler & padder",
      protected: true,
      source: "preview",
    },
    {
      speciesName: "Circus aeruginosus",
      danishName: "Rørhøg",
      group: "Fugle",
      protected: true,
      source: "preview",
    },
    {
      speciesName: "Lutra lutra",
      danishName: "Odder",
      group: "Pattedyr",
      protected: true,
      source: "preview",
    },
  ],
  protectedHabitats: ["§3 sø", "§3 mose"],
  nearestProtectedArea: "Habitatområde H66 (2.1 km)",
  fetchedAt: new Date().toISOString(),
};

export async function getStatus(): Promise<"live" | "preview" | "missing_key"> {
  const config = getLiveDataConfig();
  return config.isLiveDataEnabled ? "live" : "preview";
}

export async function fetchByGeometry(
  geometry: ProjectGeometry,
): Promise<ConnectorResponse<MiljoeportalData>> {
  const config = getLiveDataConfig();
  if (!config.isLiveDataEnabled) return previewResponse(PREVIEW_DATA);

  const lat = geometry.centroid?.lat;
  const lng = geometry.centroid?.lng;
  if (!lat || !lng) return previewResponse(PREVIEW_DATA);

  return fetchConnector(async () => {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      radius: "1000",
      take: "20",
    });
    const res = await fetchWithTimeout(`${NATURDATA_BASE}/Species?${params}`, {
      timeoutMs: 15_000,
    });
    if (!res.ok) throw new Error(`Naturdatabasen API ${res.status}`);
    const json = (await res.json()) as {
      species?: Array<{
        scientificName: string;
        danishName?: string;
        group?: string;
        protected?: boolean;
      }>;
    };

    const registrations: NatureRegistration[] = (json.species ?? []).map((s) => ({
      speciesName: s.scientificName,
      danishName: s.danishName,
      group: s.group ?? "Ukendt",
      protected: s.protected ?? false,
      source: "Naturdatabasen",
    }));

    return {
      registrations,
      protectedHabitats: [],
      fetchedAt: new Date().toISOString(),
    };
  });
}

export async function fetchPreview(): Promise<ConnectorResponse<MiljoeportalData>> {
  return previewResponse(PREVIEW_DATA);
}

export function normalizeResult(
  result: ConnectorResponse<MiljoeportalData>,
): Record<string, unknown> {
  return {
    mode: result.mode,
    status: result.status,
    latencyMs: result.latencyMs,
    registrationCount: result.data?.registrations.length ?? 0,
    protectedCount: result.data?.registrations.filter((r) => r.protected).length ?? 0,
    fetchedAt: result.data?.fetchedAt,
  };
}
