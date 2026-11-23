/**
 * Geo-search server functions.
 * All calls run server-side so we (a) avoid browser CORS surprises against
 * public Danish geodata endpoints and (b) can add credential-based sources
 * (Datafordeler matrikel) without leaking secrets into the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AreaFeature } from "@/services/geo-lookup-transform";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SearchInput = z.object({ q: z.string().trim().min(1).max(120) });
const ResolveInput = z.object({ href: z.string().url() });
const PointInput = z.object({
  lat: z.number().gte(54).lte(58),
  lng: z.number().gte(7).lte(16),
});
// Polygon som ring af [lng,lat]-par. Loft matcher tegneværktøjets MAX_DRAW_POINTS.
const PolygonInput = z.object({
  ring: z
    .array(z.tuple([z.number().gte(7).lte(16), z.number().gte(54).lte(58)]))
    .min(3)
    .max(501),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type { PlaceSuggestion } from "@/services/place-search.server";

export interface PickedFeature {
  source: "markblok" | "matrikel";
  label: string;
  properties: Record<string, string | number | null>;
  geometry: { type: "Polygon"; coordinates: number[][][] };
  areaHa: number;
  attribution: string;
  disclaimer: string;
}

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SearchInput.parse(raw))
  .handler(async ({ data }) => {
    const { findPlaces } = await import("@/services/place-search.server");
    return findPlaces(data.q);
  });

export const resolvePlace = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ResolveInput.parse(raw))
  .handler(async ({ data }) => {
    const { resolveAddress } = await import("@/services/place-search.server");
    return resolveAddress(data.href);
  });

export const pickMarkblok = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PointInput.parse(raw))
  .handler(async ({ data }): Promise<PickedFeature | null> => {
    const { pickProjectArea } = await import("@/services/project-area-lookup.server");
    return pickProjectArea("markblok", data.lat, data.lng);
  });

export const pickMatrikel = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PointInput.parse(raw))
  .handler(async ({ data }): Promise<PickedFeature | null> => {
    const { pickProjectArea } = await import("@/services/project-area-lookup.server");
    return pickProjectArea("matrikel", data.lat, data.lng);
  });

export interface AreaLookupResult {
  items: AreaFeature[];
  truncated: boolean;
}
export const listMatriklerInArea = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PolygonInput.parse(raw))
  .handler(async ({ data }): Promise<AreaLookupResult> => {
    const { lookupProjectArea } = await import("@/services/project-area-lookup.server");
    return lookupProjectArea("matrikel", data.ring);
  });
export const listMarkblokkeInArea = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PolygonInput.parse(raw))
  .handler(async ({ data }): Promise<AreaLookupResult> => {
    const { lookupProjectArea } = await import("@/services/project-area-lookup.server");
    return lookupProjectArea("markblok", data.ring);
  });

export const listLowlandInArea = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PolygonInput.parse(raw))
  .handler(async ({ data }): Promise<AreaLookupResult> => {
    const { lookupProjectArea } = await import("@/services/project-area-lookup.server");
    return lookupProjectArea("lowland", data.ring);
  });
