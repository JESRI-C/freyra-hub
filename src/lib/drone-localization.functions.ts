import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
} from "./project-nature-access.server";
import type { SurveyRoundClient } from "./survey-round.functions";
import { parseHistoricalSurveyRoundMediaOriginalRows } from "./survey-round-media.functions";
import {
  canonicalDroneMediaReference,
  validateCanonicalDroneMediaRead,
  type CanonicalDroneMediaReference,
} from "@/services/monitoring/canonical-drone-media-reference";
import {
  buildDroneLocalizationFromPhotos,
  localizationPhoto,
  rankDroneLocalizationCandidates,
  type DroneLocalizationPhoto,
  type DroneLocalizationResult,
} from "@/services/geospatial/drone-localization";
import type {
  DatafordelerWatercourseCollection,
  WatercourseSearchBounds,
} from "@/services/geospatial/datafordeler-watercourse-source";

const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());
export const DroneLocalizationInputSchema = z
  .object({
    projectId: Uuid,
    mediaIds: z
      .array(Uuid)
      .min(1)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length, "Vælg hvert billede én gang."),
    expectedCallerUserId: Uuid,
  })
  .strict();
export type DroneLocalizationInput = z.infer<typeof DroneLocalizationInputSchema>;
export type { DroneLocalizationResult } from "@/services/geospatial/drone-localization";
export interface DroneLocalizationDependencies {
  authorize: typeof requireProjectNatureAccess;
  loadRows(
    client: SurveyRoundClient,
    projectId: string,
    mediaId: string,
  ): Promise<{ media: unknown; upload: unknown }>;
  getReader(): Promise<SurveyRoundClient>;
  prepare(
    reader: SurveyRoundClient,
    projectId: string,
    actorId: string,
    media: CanonicalDroneMediaReference,
  ): Promise<void>;
  findWatercourses(bounds: WatercourseSearchBounds): Promise<DatafordelerWatercourseCollection>;
}

async function readOne(client: SurveyRoundClient, table: string, projectId: string, id: string) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .eq("project_id", projectId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data)
    throw new Error("Originalens gemte oplysninger kunne ikke læses med din aktuelle adgang.");
  return data;
}
const DEFAULTS: DroneLocalizationDependencies = {
  authorize: requireProjectNatureAccess,
  loadRows: async (client, projectId, mediaId) => {
    const media = canonicalDroneMediaReference(
      await readOne(client, "project_media", projectId, mediaId),
      projectId,
      mediaId,
    );
    return { media, upload: await readOne(client, "uploads", projectId, media.source_upload_id) };
  },
  getReader: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as SurveyRoundClient;
  },
  prepare: async (reader, projectId, actorId, media) => {
    const { data, error } = await reader.rpc("prepare_project_media_original_read", {
      p_project_id: projectId,
      p_media_id: media.id,
      p_actor_id: actorId,
    });
    if (error || !data)
      throw new Error("Originalens aktuelle filversion eller projektadgang kunne ikke bekræftes.");
    validateCanonicalDroneMediaRead(data, media);
  },
  findWatercourses: async (bounds) => {
    const { findDatafordelerWatercoursesInBounds } =
      await import("@/services/geospatial/datafordeler-watercourse.server");
    return findDatafordelerWatercoursesInBounds(bounds);
  },
};

/** Four concurrent reads at most; a 200-photo upload never opens 200 RPCs together. */
async function boundedMap<T, R>(items: T[], operation: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  for (let i = 0; i < items.length; i += 4)
    result.push(...(await Promise.all(items.slice(i, i + 4).map(operation))));
  return result;
}

/** Read-only proposal. No photo bytes, private URLs, raw EXIF or client coordinates leave this boundary. */
export async function executeLocalizeDroneOriginals(
  raw: DroneLocalizationInput,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<DroneLocalizationDependencies> = {},
): Promise<DroneLocalizationResult> {
  const input = DroneLocalizationInputSchema.parse(raw);
  if (input.expectedCallerUserId !== actorId)
    throw new Error("Login er ændret. Genåbn billederne under den aktuelle bruger.");
  const deps = { ...DEFAULTS, ...overrides };
  const authorize = () =>
    deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  await authorize();
  const originals = await boundedMap(
    input.mediaIds,
    async (
      mediaId,
    ): Promise<{ media: CanonicalDroneMediaReference; photo: DroneLocalizationPhoto }> => {
      const rows = await deps.loadRows(client, input.projectId, mediaId);
      // Revalidate even injectable readers: provenance and the full saved metadata hash are authority.
      const { media, validation } = await parseHistoricalSurveyRoundMediaOriginalRows(
        rows.media,
        rows.upload,
        input.projectId,
        mediaId,
      );
      if (
        validation.status !== media.original_validation_status ||
        validation.original.sha256 !== media.original_sha256 ||
        validation.original.sizeBytes !== media.file_size_bytes ||
        validation.original.storagePath !== media.file_path ||
        validation.original.object.id !== media.storage_object_id ||
        validation.original.object.version !== media.storage_object_version ||
        validation.original.object.updated_at !== media.storage_object_updated_at
      )
        throw new Error("Originalens gemte identitet og serverkontrol matcher ikke.");
      const fileName = z
        .object({ original_file_name: z.string().min(1).max(255) })
        .parse(rows.upload).original_file_name;
      return { media, photo: localizationPhoto({ media, validation, fileName }) };
    },
  );
  const reader = await deps.getReader();
  await boundedMap(originals, (original) =>
    deps.prepare(reader, input.projectId, actorId, original.media),
  );
  const result = buildDroneLocalizationFromPhotos(
    input.projectId,
    actorId,
    originals.map((original) => original.photo),
  );
  for (let i = 0; i < result.clusters.length; i++) {
    const cluster = result.clusters[i];
    if (cluster.searchStatus !== "pending") continue;
    await authorize();
    try {
      result.clusters[i] = rankDroneLocalizationCandidates(
        cluster,
        result.photos,
        await deps.findWatercourses(cluster.searchBounds),
      );
    } catch {
      // No upstream exception text: it can include credential-bearing URLs.
      result.clusters[i] = { ...cluster, searchStatus: "unavailable" };
    }
  }
  // Revocation, replacement and validation changes during source queries discard the proposal.
  await authorize();
  await boundedMap(originals, (original) =>
    deps.prepare(reader, input.projectId, actorId, original.media),
  );
  await authorize();
  return result;
}

export const localizeDroneOriginals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => DroneLocalizationInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeLocalizeDroneOriginals(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
