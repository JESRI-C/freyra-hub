/** Public catalogue candidates for display only; this read never mutates project/cache/context rows. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
} from "@/lib/project-nature-access.server";
import { validateProjectPolygon } from "@/services/geo-service";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import type { PublicBaselineSource } from "@/services/baseline/public-baseline-types";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { WaterPlanNatureInput } from "@/services/baseline/water-plan-nature-source";
import { parseSavedWaterPlanNatureSource } from "@/services/baseline/water-plan-nature-saved-payload";
import {
  natureCandidatesForDisplay,
  NATURE_DISPLAY_PROJECTION,
  type NatureFeatureCollection,
} from "@/services/nature-geo-transform";

const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Input = z.object({
  projectId: z.string().regex(POSTGRES_UUID, "Invalid project ID"),
  // Accepted for older callers, but never used to invent or change a project area.
  lat: z.number().gte(54).lte(58).optional(),
  lng: z.number().gte(7).lte(16).optional(),
});
export type NatureGeoInput = z.infer<typeof Input>;
export function parseNatureGeoInput(raw: unknown): NatureGeoInput {
  return Input.parse(raw);
}
export interface NatureGeoResult {
  paragraph3: NatureFeatureCollection | null;
  watercourses: NatureFeatureCollection | null;
  mode: "live" | "preview" | "error";
  status: "partial" | "disabled" | "unknown" | "failed" | "timeout";
  persisted: false;
  /** Write counts are always zero; candidate counts remain null when unavailable. */
  persistedCounts: { paragraph3: 0; watercourses: 0 };
  candidateCounts: { paragraph3: number | null; watercourses: number | null };
  provenance: {
    purpose: "current_catalogue_view";
    catalogueDate: string;
    fetchedAt: string;
    geometrySha256: string;
    sourcePayloadSha256: string;
    pageResponseSha256s: string[];
    queryBboxNative: [number, number, number, number];
    displayProjection: typeof NATURE_DISPLAY_PROJECTION;
    spatialCoverage: "unknown";
    temporalCoverage: "unknown";
    upstreamTransactionalSnapshot: false;
    juridicalPresenceAssessed: false;
    reportAccepted: false;
  } | null;
  error: { code: string; message: string } | null;
}
export function isOpenDataLiveEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env["ENABLE_LIVE_DATA"] ?? env["VITE_ENABLE_LIVE_DATA"];
  return (
    raw === undefined ||
    raw === "" ||
    !["false", "0", "off", "no"].includes(raw.trim().toLowerCase())
  );
}
function unavailable(
  status: "disabled" | "unknown" | "failed" | "timeout",
  code: string,
  message: string,
): NatureGeoResult {
  return {
    paragraph3: null,
    watercourses: null,
    mode: status === "disabled" ? "preview" : "error",
    status,
    persisted: false,
    persistedCounts: { paragraph3: 0, watercourses: 0 },
    candidateCounts: { paragraph3: null, watercourses: null },
    provenance: null,
    error: { code, message },
  };
}
async function loadStoredPolygon(
  client: ProjectAuthorizationClient,
  projectId: string,
): Promise<GeoJSONPolygon | null> {
  const result = await client
    .from("projects")
    .select("geometry_polygon")
    .eq("id", projectId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const raw = result.data["geometry_polygon"];
  const validated = validateProjectPolygon(raw);
  if (!validated.valid) return null;
  // The validator returns the stored geometry unchanged; no centroid fallback or area write.
  return validated.polygon;
}
export interface NatureGeoExecutionDependencies {
  isLiveEnabled(): boolean;
  authorizeProject: typeof requireProjectNatureAccess;
  loadStoredPolygon(
    client: ProjectAuthorizationClient,
    projectId: string,
  ): Promise<GeoJSONPolygon | null>;
  fetchSource(input: WaterPlanNatureInput): Promise<PublicBaselineSource>;
  now(): string;
}
const DEFAULT_EXECUTION_DEPENDENCIES: NatureGeoExecutionDependencies = {
  isLiveEnabled: isOpenDataLiveEnabled,
  authorizeProject: requireProjectNatureAccess,
  loadStoredPolygon,
  fetchSource: async (input) => {
    const { fetchWaterPlanNatureSource } =
      await import("@/services/baseline/water-plan-nature-source.server");
    return fetchWaterPlanNatureSource(input);
  },
  now: () => new Date().toISOString(),
};

/** Auth precedes every database area read and source fetch. No privileged writer is loaded. */
export async function executeNatureGeoRequest(
  data: NatureGeoInput,
  userId: string,
  authClient: ProjectAuthorizationClient,
  dependencyOverrides: Partial<NatureGeoExecutionDependencies> = {},
): Promise<NatureGeoResult> {
  const dependencies = { ...DEFAULT_EXECUTION_DEPENDENCIES, ...dependencyOverrides };
  await dependencies.authorizeProject(authClient, userId, data.projectId);
  if (!dependencies.isLiveEnabled())
    return unavailable("disabled", "LIVE_DISABLED", "Offentligt naturinventar er ikke slået til.");
  let polygon: GeoJSONPolygon | null;
  try {
    polygon = await dependencies.loadStoredPolygon(authClient, data.projectId);
  } catch {
    polygon = null;
  }
  if (!polygon)
    return unavailable(
      "unknown",
      "STORED_AREA_UNAVAILABLE",
      "Gem en gyldig projektpolygon for at se offentlige naturkandidater.",
    );
  try {
    const now = dependencies.now();
    if (!z.string().datetime({ offset: true }).safeParse(now).success)
      throw new Error("Invalid catalogue date");
    const catalogueDate = new Date(now).toISOString().slice(0, 10);
    const geometrySha256 = await baselineSha256(polygon);
    const source = await dependencies.fetchSource({
      polygon,
      geometrySha256,
      dateFrom: catalogueDate,
      dateTo: catalogueDate,
    });
    if (source.mode === "error" || source.payload === null || source.payloadSha256 === null) {
      return unavailable(
        source.status === "timeout" ? "timeout" : "failed",
        "PUBLIC_SOURCE_UNAVAILABLE",
        "Naturkilden kunne ikke læses. Antal og projektforhold er ukendte.",
      );
    }
    if (
      source.query.geometrySha256 !== geometrySha256 ||
      source.query.requestedFrom !== catalogueDate ||
      source.query.requestedTo !== catalogueDate ||
      source.payloadSha256 !== (await baselineSha256(source.payload))
    )
      throw new Error("Invalid source contract");
    const payload = parseSavedWaterPlanNatureSource(source);
    if (!payload) throw new Error("Invalid nature source payload");
    const collections = natureCandidatesForDisplay(payload);
    return {
      ...collections,
      mode: "live",
      status: "partial",
      persisted: false,
      persistedCounts: { paragraph3: 0, watercourses: 0 },
      candidateCounts: {
        paragraph3: collections.paragraph3.features.length,
        watercourses: collections.watercourses.features.length,
      },
      provenance: {
        purpose: "current_catalogue_view",
        catalogueDate,
        fetchedAt: source.fetchedAt,
        geometrySha256,
        sourcePayloadSha256: source.payloadSha256,
        pageResponseSha256s: payload.pages.map((page) => page.responseSha256),
        queryBboxNative: [...payload.queryProjection.bbox],
        displayProjection: NATURE_DISPLAY_PROJECTION,
        spatialCoverage: "unknown",
        temporalCoverage: "unknown",
        upstreamTransactionalSnapshot: false,
        juridicalPresenceAssessed: false,
        reportAccepted: false,
      },
      error: null,
    };
  } catch {
    return unavailable(
      "failed",
      "PUBLIC_SOURCE_FAILED",
      "Naturkilden kunne ikke hentes eller valideres. Projektforhold er ukendte.",
    );
  }
}
/** Legacy name retained for callers. This operation now only reads candidates for the map. */
export const fetchAndIngestNatureGeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseNatureGeoInput)
  .handler(
    async ({ data, context }): Promise<NatureGeoResult> =>
      executeNatureGeoRequest(
        data,
        context.userId,
        context.supabase as unknown as ProjectAuthorizationClient,
      ),
  );
