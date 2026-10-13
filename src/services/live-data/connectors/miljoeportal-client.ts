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

const AREALDATA_WFS = "https://arealdata.miljoeportal.dk/api/wfs";

export async function fetchByGeometry(
  geometry: ProjectGeometry,
): Promise<ConnectorResponse<MiljoeportalData>> {
  const config = getLiveDataConfig();
  if (!config.isLiveDataEnabled) return fetchPreview();

  if (!hasSourceGeometry(geometry)) {
    return errorResponse(
      "Miljøportal kræver en gyldig projektgeometri med koordinater.",
      "invalid_geometry",
    );
  }
  const { lat, lng } = geometry.centroid!;

  const result = await fetchConnector(async () => {
    // --- Primary source: Naturdatabasen species ---
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
    if (!Array.isArray(json.species))
      throw new Error("Naturdatabasen svarede med et ugyldigt dataformat.");
    const registrations: NatureRegistration[] = json.species.map((s) => ({
      speciesName: s.scientificName,
      danishName: s.danishName,
      group: s.group ?? "Ukendt",
      protected: s.protected ?? false,
      source: "Naturdatabasen",
    }));

    // --- Secondary source: §3-protected nature areas (Arealdata WFS) ---
    const protectedHabitats: string[] = [];
    const wfsParams = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: "dai:p3",
      outputFormat: "application/json",
      bbox: `${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`,
    });
    const wfsRes = await fetchWithTimeout(`${AREALDATA_WFS}?${wfsParams}`, {
      timeoutMs: 12_000,
    });
    if (!wfsRes.ok) throw new Error(`Arealdata WFS ${wfsRes.status}`);
    const wfsJson = (await wfsRes.json()) as {
      features?: unknown[];
      totalFeatures?: number;
    };
    if (!Array.isArray(wfsJson.features))
      throw new Error("Arealdata svarede med et ugyldigt dataformat.");
    const count = wfsJson.features.length;
    if (count > 0) {
      protectedHabitats.push(
        `§3-beskyttede naturarealer (${count} område${count === 1 ? "" : "r"})`,
      );
    }

    return {
      registrations,
      protectedHabitats,
      fetchedAt: new Date().toISOString(),
    };
  });

  if (result.status !== "ok") return result;
  if (!result.data?.registrations.length && !result.data?.protectedHabitats.length) {
    return errorResponse(
      "Miljøportal har ingen registreringer i det forespurgte område; det dokumenterer ikke fravær af naturbeskyttelse.",
      "no_coverage",
      result.latencyMs,
    );
  }
  return result;
}

export async function fetchPreview(): Promise<ConnectorResponse<MiljoeportalData>> {
  return isDemoDataEnabled && !getLiveDataConfig().isLiveDataEnabled
    ? previewResponse(PREVIEW_DATA)
    : errorResponse(
        "Miljøportal er ikke konfigureret til live data. Eksempeldata kræver eksplicit offline demo.",
        "disabled",
      );
}

export function normalizeResult(
  result: ConnectorResponse<MiljoeportalData>,
): Record<string, unknown> {
  return {
    mode: result.mode,
    status: result.status,
    latencyMs: result.latencyMs,
    registrationCount: result.data?.registrations.length,
    protectedCount: result.data?.registrations.filter((r) => r.protected).length,
    fetchedAt: result.data?.fetchedAt,
  };
}
