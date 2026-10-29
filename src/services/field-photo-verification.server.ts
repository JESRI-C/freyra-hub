import { createHash } from "node:crypto";
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

/** Hash in bounded memory; never trust Content-Length as proof of completion. */
export async function hashFieldPhotoStream(
  response: Response,
  expectedSize: number,
): Promise<{ sha256: string; sizeBytes: number }> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("Originalfilen kunne ikke hentes.");
  }
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) !== expectedSize)) {
    await response.body.cancel();
    throw new Error("Originalfilens størrelse matcher ikke uploaden.");
  }
  const reader = response.body.getReader(),
    hash = createHash("sha256");
  let sizeBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sizeBytes += value.byteLength;
      if (sizeBytes > expectedSize)
        throw new Error("Originalfilen overstiger uploadens størrelse.");
      hash.update(value);
    }
    if (sizeBytes !== expectedSize) throw new Error("Originalfilens overførsel er ufuldstændig.");
    return { sha256: hash.digest("hex"), sizeBytes };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function downloadAndHashFieldPhoto(
  client: RequestClient,
  upload: FieldPhotoUpload,
  options: { supabaseUrl?: string; fetch?: typeof fetch } = {},
) {
  const signed = await client.storage
    .from("project-media")
    .createSignedUrl(upload.storage_path, 60);
  if (signed.error || !signed.data)
    throw new Error("Originalfilen kunne ikke åbnes med din aktuelle adgang.");
  const configured = options.supabaseUrl ?? process.env.SUPABASE_URL;
  if (!configured) throw new Error("Serverens Storage-adresse er ikke konfigureret.");
  const url = new URL(signed.data.signedUrl);
  const expected = `/storage/v1/object/sign/project-media/${upload.storage_path.split("/").map(encodeURIComponent).join("/")}`;
  if (
    url.origin !== new URL(configured).origin ||
    url.pathname !== expected ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get("token")
  )
    throw new Error("Originalfilens Storage-adresse er ugyldig.");
  const response = await (options.fetch ?? fetch)(url.toString(), {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  return hashFieldPhotoStream(response, upload.payload.sizeBytes);
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
