import { vi } from "vitest";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { ACTUAL_NATIVE_FEATURES } from "@/services/baseline/__tests__/water-plan-nature.fixtures";
import {
  WATER_PLAN_NATURE_CRS,
  WATER_PLAN_NATURE_PRODUCTS,
  type WaterPlanNatureInput,
} from "@/services/baseline/water-plan-nature-source";
import { fetchWaterPlanNatureSource } from "@/services/baseline/water-plan-nature-source.server";

export const NATURE_POLYGON: GeoJSONPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [9.25103, 55.33809],
      [9.27103, 55.33809],
      [9.27103, 55.37137],
      [9.25103, 55.37137],
      [9.25103, 55.33809],
    ],
  ],
};
export const NATURE_NOW = "2026-10-13T20:00:00Z";
export async function natureCatalogueFixture(
  input: WaterPlanNatureInput = {
    polygon: NATURE_POLYGON,
    dateFrom: "2026-10-13",
    dateTo: "2026-10-13",
  },
) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (request) => {
    const layer = new URL(String(request)).searchParams.get("typeNames");
    const product = WATER_PLAN_NATURE_PRODUCTS.find((item) => item.layer === layer)!;
    const features = structuredClone(ACTUAL_NATIVE_FEATURES[product.id]);
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features,
        numberMatched: features.length,
        totalFeatures: features.length,
        numberReturned: features.length,
        timeStamp: NATURE_NOW,
        crs: { type: "name", properties: { name: WATER_PLAN_NATURE_CRS } },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  return fetchWaterPlanNatureSource(input, { fetchImpl, now: () => NATURE_NOW });
}
