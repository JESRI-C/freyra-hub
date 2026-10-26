/** Legacy ingest is deliberately closed: it used unauthenticated service-role writes. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { NatureFeatureCollection } from "@/services/nature-geo-transform";
export interface NatureGeoResult {
  paragraph3: NatureFeatureCollection;
  watercourses: NatureFeatureCollection;
  mode: "live" | "preview";
  persisted: boolean;
  persistedCounts: { paragraph3: number; watercourses: number };
}

export function isOpenDataLiveEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env["ENABLE_LIVE_DATA"] ?? env["VITE_ENABLE_LIVE_DATA"];
  if (raw === undefined || raw === "") return true;
  const v = raw.trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "off" || v === "no");
}

export const LEGACY_NATURE_INGEST_BLOCKER =
  "Ældre naturimport er blokeret: projektadgang og autoriseret persistence er ikke implementeret. Brug de officielle kortlag i Kort & zoner; ingen arealer eller fravær er konkluderet.";
export const fetchAndIngestNatureGeo = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().min(1).nullable().optional(),
        lat: z.number().gte(54).lte(58),
        lng: z.number().gte(7).lte(16),
      })
      .parse(raw),
  )
  .handler(async (): Promise<NatureGeoResult> => {
    throw new Error(LEGACY_NATURE_INGEST_BLOCKER);
  });
