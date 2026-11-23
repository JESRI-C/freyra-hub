import { downloadAndHashFieldPhoto } from "./field-photo-stream.server";
export { downloadAndHashFieldPhoto, hashFieldPhotoStream } from "./field-photo-stream.server";
import { z } from "zod";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
} from "@/lib/project-nature-access.server";
import {
  FieldPhotoUuid,
  parseFieldPhotoUpload,
  parseFieldPhotoReceipt,
  type FieldPhotoUpload,
  type FieldPhotoReceipt,
} from "@/lib/field-photo-upload";

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface RequestClient extends ProjectAuthorizationClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        ttl: number,
      ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
}

interface Dependencies {
  authorize: typeof requireProjectNatureAccess;
  writer(): Promise<RpcClient>;
  hash: typeof downloadAndHashFieldPhoto;
}
const defaults: Dependencies = {
  authorize: requireProjectNatureAccess,
  writer: async () =>
    (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as RpcClient,
  hash: downloadAndHashFieldPhoto,
};
export async function executeVerifyFieldPhoto(
  raw: { projectId: string; uploadId: string },
  actorId: string,
  client: RequestClient,
  overrides: Partial<Dependencies> = {},
): Promise<FieldPhotoReceipt> {
  const input = z
      .object({ projectId: FieldPhotoUuid, uploadId: FieldPhotoUuid })
      .strict()
      .parse(raw),
    deps = { ...defaults, ...overrides };
  const access = await deps.authorize(client, actorId, input.projectId);
  if (!access.canPersist && access.role !== "field")
    throw new Error("Du kan ikke kontrollere projektets originalfiler.");
  const writer = await deps.writer();
  const args = { p_project_id: input.projectId, p_upload_id: input.uploadId, p_actor_id: actorId };
  const prepared = await writer.rpc("prepare_field_photo_verification", args);
  if (prepared.error)
    throw new Error(
      "Serverkontrollen kunne ikke startes. Kontrollen kan være i gang; prøv igen om lidt.",
    );
  const result = z
    .object({
      upload: z.unknown(),
      receipt: z.unknown().nullable(),
      leaseId: FieldPhotoUuid.nullable(),
    })
    .parse(prepared.data);
  const upload = parseFieldPhotoUpload(result.upload, input.projectId, input.uploadId);
  if (result.receipt) return parseFieldPhotoReceipt(result.receipt, upload);
  if (!result.leaseId) throw new Error("Serveren returnerede ingen behandlingsreference.");
  try {
    const hashed = await deps.hash(client, upload);
    const completed = await writer.rpc("complete_field_photo_verification", {
      ...args,
      p_lease_id: result.leaseId,
      p_sha256: hashed.sha256,
      p_size_bytes: hashed.sizeBytes,
    });
    if (completed.error || !Array.isArray(completed.data) || completed.data.length !== 1)
      throw new Error("Kontrollen blev ikke kvitteret. Filversion eller adgang kan være ændret.");
    return parseFieldPhotoReceipt(completed.data[0], upload);
  } catch {
    // Releasing an old lease cannot steal a newer attempt. If this call fails,
    // the durable job becomes available again when its lease expires.
    await Promise.resolve(
      writer.rpc("release_field_photo_verification", {
        p_upload_id: input.uploadId,
        p_lease_id: result.leaseId,
        p_error: "verification_failed",
      }),
    ).catch(() => undefined);
    throw new Error(
      "Originalen er modtaget, men serverkontrollen mangler. Behold filen og prøv kontrollen igen.",
    );
  }
}
