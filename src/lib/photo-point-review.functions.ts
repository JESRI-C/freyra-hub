import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
} from "./project-nature-access.server";
import type { SurveyRoundClient } from "./survey-round.functions";
import { executeGetSurveyRoundMedia } from "./survey-round-media.functions";
import { canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  droneImageInspectionFromRow,
  DRONE_IMAGE_INSPECTION_SELECT,
} from "@/services/monitoring/drone-image-inspection-persistence";
import {
  buildPhotoPointReview,
  photoPointReviewFromRow,
  PHOTO_POINT_REVIEW_SELECT,
  PhotoPointReviewInputSchema,
  type PhotoPointReviewInput,
} from "@/services/monitoring/photo-point-review";

const ListInput = z.object({ projectId: z.string().uuid(), bindingId: z.string().uuid() }).strict();
export interface PhotoPointReviewDependencies {
  authorize: typeof requireProjectNatureAccess;
  loadBinding: typeof executeGetSurveyRoundMedia;
  loadInspection(client: SurveyRoundClient, projectId: string, id: string): Promise<unknown>;
  getWriter(): Promise<SurveyRoundClient>;
  save(
    writer: SurveyRoundClient,
    input: PhotoPointReviewInput,
    actorId: string,
    text: string,
  ): Promise<unknown>;
  list(client: SurveyRoundClient, input: z.infer<typeof ListInput>): Promise<unknown[]>;
}
const DEFAULTS: PhotoPointReviewDependencies = {
  authorize: requireProjectNatureAccess,
  loadBinding: executeGetSurveyRoundMedia,
  loadInspection: async (client, projectId, id) => {
    const { data, error } = await client
      .from("drone_image_inspections")
      .select(DRONE_IMAGE_INSPECTION_SELECT)
      .eq("project_id", projectId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Billedvurderingen kunne ikke læses.");
    return data;
  },
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as SurveyRoundClient;
  },
  save: async (writer, input, actorId, text) => {
    const { data, error } = await writer.rpc("save_photo_point_review", {
      p_project_id: input.projectId,
      p_binding_id: input.bindingId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_review_text: text,
    });
    if (error || !data)
      throw new Error(
        "Den faglige vurdering blev ikke gemt. Genåbn punktet og kontrollér din adgang.",
      );
    return data;
  },
  list: async (client, input) => {
    const { data, error } = await client
      .from("photo_point_review_versions")
      .select(PHOTO_POINT_REVIEW_SELECT)
      .eq("project_id", input.projectId)
      .eq("binding_id", input.bindingId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(31);
    if (error || !Array.isArray(data)) throw new Error("Revisionssporet kunne ikke hentes.");
    return data;
  },
};
export async function executeSavePhotoPointReview(
  raw: PhotoPointReviewInput,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<PhotoPointReviewDependencies> = {},
) {
  const input = PhotoPointReviewInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  if (input.expectedCallerUserId !== actorId)
    throw new Error("Brugeren er ændret. Genåbn gennemgangen.");
  const check = async () => {
    if (
      !(
        await deps.authorize(
          client as unknown as ProjectAuthorizationClient,
          actorId,
          input.projectId,
        )
      ).canPersist
    )
      throw new Error("Faglig bekræftelse kræver redigeringsadgang til sagen.");
  };
  await check();
  const binding = await deps.loadBinding(
    { projectId: input.projectId, bindingId: input.bindingId },
    actorId,
    client,
  );
  if (!binding) throw new Error("Fotopunktets gemte version findes ikke med din adgang.");
  const inspection =
    input.inspectionId === null
      ? null
      : await droneImageInspectionFromRow(
          await deps.loadInspection(client, input.projectId, input.inspectionId),
          input.projectId,
          binding.mediaId,
        );
  const review = buildPhotoPointReview(input, binding, inspection);
  const text = canonicalBaselineJson(review);
  await check();
  const writer = await deps.getWriter();
  const saved = await photoPointReviewFromRow(
    await deps.save(writer, input, actorId, text),
    input.projectId,
    input.bindingId,
  );
  if (
    saved.reviewedBy !== actorId ||
    saved.requestId !== input.requestId ||
    canonicalBaselineJson(saved.review) !== text
  )
    throw new Error("Databasen bekræftede ikke den præcise faglige vurdering.");
  await check();
  return saved;
}
export async function executeListPhotoPointReviews(
  raw: z.infer<typeof ListInput>,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<PhotoPointReviewDependencies> = {},
) {
  const input = ListInput.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  const rows = await deps.list(client, input);
  if (rows.length > 31) throw new Error("Revisionssporet overskrider sidegrænsen.");
  const items = await Promise.all(
    rows.map((row) => photoPointReviewFromRow(row, input.projectId, input.bindingId)),
  );
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some(
      (item, index) =>
        index > 0 &&
        (Date.parse(items[index - 1].createdAt) < Date.parse(item.createdAt) ||
          (Date.parse(items[index - 1].createdAt) === Date.parse(item.createdAt) &&
            items[index - 1].id <= item.id)),
    )
  )
    throw new Error("Revisionssporets rækkefølge kunne ikke bekræftes.");
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  return { items: items.slice(0, 30), hasMore: items.length > 30 };
}
export const savePhotoPointReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PhotoPointReviewInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeSavePhotoPointReview(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const listPhotoPointReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListInput.parse(raw))
  .handler(({ data, context }) =>
    executeListPhotoPointReviews(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
