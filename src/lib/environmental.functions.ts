/** Legacy point-only environmental bundle cannot establish project overlap or observed conditions. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export interface EnvironmentalBundle {
  nature: {
    paragraph3AreasHa: number;
    paragraph3Percent: number;
    natureTypes: string[];
    watercourseCount: number;
    nearestWatercourseM: number | null;
  };
  natura2000: {
    withinM: number | null; // 0 = inside
    nearestName: string | null;
    sitesWithin5km: number;
  };
  soil: {
    dominantType: string;
    permeability: "high" | "medium" | "low" | "unknown";
    organicPct: number;
    curveNumber: number;
  };
  terrain: {
    elevationM: number | null;
    slopePct: number | null;
    aspect: "flat" | "gentle" | "moderate" | "steep" | "unknown";
  };
  groundwater: {
    boreholesWithin500m: number;
    nearestBoreholeM: number | null;
    depthM: number | null;
  };
  rainfall: {
    annualMm: number;
    designRain10yrMmHr: number;
    designRain100yrMmHr: number;
    source: "dmi-live" | "climate-norm";
  };
  fetchedAt: string;
}

export const ENVIRONMENTAL_BUNDLE_BLOCKER =
  "Miljøbundle er ikke tilgængeligt: kilder, projektpolygon og målemetoder skal verificeres. Der returneres ingen preview-tal eller beregnet overlap ud fra et enkelt punkt.";
export const fetchEnvironmentalBundle = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        lat: z.number().gte(54).lte(58),
        lng: z.number().gte(7).lte(16),
        areaHa: z.number().nonnegative().optional(),
      })
      .parse(raw),
  )
  .handler(async (): Promise<EnvironmentalBundle> => {
    throw new Error(ENVIRONMENTAL_BUNDLE_BLOCKER);
  });
