import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "./project-nature-access.server";
import {
  parsePreparedDroneOriginal,
  type PreparedDroneOriginal,
} from "@/services/monitoring/drone-original-validation.server";
import {
  droneOriginalPromotionFromRow,
  requirePromotableDroneOriginal,
} from "@/services/monitoring/drone-original-promotion.server";
import type {
  DroneOriginalPromotion,
  DroneOriginalPromotionInput,
} from "@/services/monitoring/drone-original-promotion-types";

const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());
const Input = z.object({ projectId: Uuid, uploadId: Uuid, requestId: Uuid }).strict();
interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}
export interface DroneOriginalPromotionWriter {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>;
}
export interface DroneOriginalPromotionDependencies {
  authorize(
    client: ProjectAuthorizationClient,
    actorId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  getWriter(): Promise<DroneOriginalPromotionWriter>;
  prepare(
    writer: DroneOriginalPromotionWriter,
    input: DroneOriginalPromotionInput,
    actorId: string,
  ): Promise<PreparedDroneOriginal>;
  persist(
    writer: DroneOriginalPromotionWriter,
    input: DroneOriginalPromotionInput,
    actorId: string,
    prepared: PreparedDroneOriginal,
  ): Promise<DroneOriginalPromotion>;
}
const DEFAULT_DEPENDENCIES: DroneOriginalPromotionDependencies = {
  authorize: requireProjectNatureAccess,
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as DroneOriginalPromotionWriter;
  },
  prepare: async (writer, input, actorId) => {
    const { data, error } = await writer.rpc("prepare_drone_original_validation", {
      p_project_id: input.projectId,
      p_upload_id: input.uploadId,
      p_actor_id: actorId,
    });
    if (error || !data)
      throw new Error(
        "Originalfilens serverkontrol og aktuelle projektadgang kunne ikke bekræftes.",
      );
    return parsePreparedDroneOriginal(data, input.projectId, input.uploadId);
  },
  persist: async (writer, input, actorId, prepared) => {
    const { data, error } = await writer.rpc("persist_drone_original_promotion", {
      p_project_id: input.projectId,
      p_upload_id: input.uploadId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_original_sha256: prepared.existing!.original.sha256,
      p_validation_sha256: prepared.existingSha256,
      p_object_id: prepared.object.id,
      p_object_version: prepared.object.version,
      p_object_updated_at: prepared.object.updated_at,
    });
    if (error || !data)
      throw new Error(
        "Originaltilknytningen blev ikke gemt. Filversion, anmodning eller projektadgang kan være ændret.",
      );
    return droneOriginalPromotionFromRow(data, input, actorId, prepared);
  },
};

/** Browser requests identify intake only; all file identity comes from H08. */
export async function executePromoteDroneOriginal(
  raw: DroneOriginalPromotionInput,
  actorId: string,
  client: ProjectAuthorizationClient,
  overrides: Partial<DroneOriginalPromotionDependencies> = {},
): Promise<DroneOriginalPromotion> {
  const input = Input.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const access = await dependencies.authorize(client, actorId, input.projectId);
  if (!access.canPersist && access.role !== "field")
    throw new Error("Du har ikke rettighed til at tilknytte projektets originalfiler.");
  const writer = await dependencies.getWriter();
  const prepared = await dependencies.prepare(writer, input, actorId);
  if (prepared.upload.id !== input.uploadId || prepared.upload.project_id !== input.projectId)
    throw new Error("Originalfilens reference tilhører ikke den ønskede sag og upload.");
  await requirePromotableDroneOriginal(prepared);
  // Every replay goes through the writer's current membership/object locks.
  return dependencies.persist(writer, input, actorId, prepared);
}

export const promoteDroneOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(({ data, context }) =>
    executePromoteDroneOriginal(
      data,
      context.userId,
      context.supabase as unknown as ProjectAuthorizationClient,
    ),
  );
