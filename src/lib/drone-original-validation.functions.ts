import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "@/lib/project-nature-access.server";
import {
  originalValidationSha256,
  parsePreparedDroneOriginal,
  parseStoredDroneOriginalValidation,
  validateDroneOriginalBytes,
  type DroneOriginalValidation,
  type PreparedDroneOriginal,
} from "@/services/monitoring/drone-original-validation.server";

const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());
const Input = z.object({ projectId: Uuid, uploadId: Uuid }).strict();
export type DroneOriginalValidationInput = z.infer<typeof Input>;
interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}
export interface DroneOriginalWriter {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>;
}
export interface DroneOriginalRequestClient extends ProjectAuthorizationClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl: string } | null; error: { message?: string } | null }>;
    };
  };
}

export async function downloadCanonicalDroneOriginal(
  client: DroneOriginalRequestClient,
  prepared: PreparedDroneOriginal,
  options: { supabaseUrl?: string; fetch?: typeof fetch } = {},
): Promise<Uint8Array> {
  // The caller authorizes signing via Storage RLS. The short-lived URL stays on
  // the server; final commit rechecks revocation and the exact object version.
  const { data, error } = await client.storage
    .from("monitoring-uploads")
    .createSignedUrl(prepared.upload.storage_path, 60);
  if (error || !data)
    throw new Error("Den private originalfil kunne ikke læses med din aktuelle projektadgang.");
  const configuredUrl = options.supabaseUrl ?? process.env.SUPABASE_URL;
  if (!configuredUrl) throw new Error("Serverens Storage-adresse er ikke konfigureret.");
  const url = new URL(data.signedUrl),
    origin = new URL(configuredUrl).origin;
  const expectedPath = `/storage/v1/object/sign/monitoring-uploads/${prepared.upload.storage_path.split("/").map(encodeURIComponent).join("/")}`;
  if (
    url.origin !== origin ||
    url.pathname !== expectedPath ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get("token")
  ) {
    throw new Error("Storage-adressen matcher ikke den kanoniske originalfil.");
  }
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(url.toString(), {
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new Error("Originalfilens private download fejlede eller overskred 20 sekunder.");
  }
  if (!response.ok || !response.body) throw new Error("Den private originalfil kunne ikke hentes.");
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) !== prepared.upload.file_size)
  ) {
    await response.body.cancel().catch(() => undefined);
    throw new Error("Storage-download matcher ikke uploadens filstørrelse.");
  }
  const bytes = new Uint8Array(prepared.upload.file_size),
    reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > bytes.byteLength)
        throw new Error("Storage-download overstiger uploadens filstørrelse.");
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== bytes.byteLength)
      throw new Error("Storage-download er afbrudt eller ufuldstændig.");
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw new Error(
      error instanceof Error && error.message.startsWith("Storage-download")
        ? error.message
        : "Originalfilens private download fejlede eller overskred 20 sekunder.",
    );
  } finally {
    reader.releaseLock();
  }
  return bytes;
}
export interface DroneOriginalDependencies {
  authorize(
    client: ProjectAuthorizationClient,
    actorId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  getWriter(): Promise<DroneOriginalWriter>;
  prepare(
    writer: DroneOriginalWriter,
    input: DroneOriginalValidationInput,
    actorId: string,
  ): Promise<PreparedDroneOriginal>;
  download(
    client: DroneOriginalRequestClient,
    prepared: PreparedDroneOriginal,
  ): Promise<Uint8Array>;
  validate: typeof validateDroneOriginalBytes;
  persist(
    writer: DroneOriginalWriter,
    input: DroneOriginalValidationInput,
    actorId: string,
    prepared: PreparedDroneOriginal,
    result: DroneOriginalValidation,
  ): Promise<DroneOriginalValidation>;
}

const DEFAULT_DEPENDENCIES: DroneOriginalDependencies = {
  authorize: requireProjectNatureAccess,
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as DroneOriginalWriter;
  },
  prepare: async (writer, input, actorId) => {
    const { data, error } = await writer.rpc("prepare_drone_original_validation", {
      p_project_id: input.projectId,
      p_upload_id: input.uploadId,
      p_actor_id: actorId,
    });
    if (error || !data)
      throw new Error(
        "Originalfilens upload-intent, Storage-version og aktuelle projektrettighed kunne ikke bekræftes.",
      );
    return parsePreparedDroneOriginal(data, input.projectId, input.uploadId);
  },
  download: downloadCanonicalDroneOriginal,
  validate: validateDroneOriginalBytes,
  persist: async (writer, input, actorId, prepared, result) => {
    const checksum = await originalValidationSha256(result);
    const { data, error } = await writer.rpc("persist_drone_original_validation", {
      p_project_id: input.projectId,
      p_upload_id: input.uploadId,
      p_actor_id: actorId,
      p_object_id: prepared.object.id,
      p_object_version: prepared.object.version,
      p_object_updated_at: prepared.object.updated_at,
      p_result: result,
      p_result_sha256: checksum,
    });
    if (error || !data)
      throw new Error(
        "Originalvalideringen blev ikke gemt. Filversion eller projektrettighed kan være ændret under hentningen.",
      );
    const stored = z.object({ result: z.unknown(), result_sha256: z.string() }).parse(data);
    return parseStoredDroneOriginalValidation(stored.result, stored.result_sha256, prepared.upload);
  },
};

/** Only project/upload ids are accepted; client EXIF, hash, status and approval are never authority. */
export async function executeValidateDroneOriginal(
  raw: DroneOriginalValidationInput,
  actorId: string,
  client: DroneOriginalRequestClient,
  overrides: Partial<DroneOriginalDependencies> = {},
): Promise<DroneOriginalValidation> {
  const input = Input.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const access = await dependencies.authorize(client, actorId, input.projectId);
  if (!access.canPersist && access.role !== "field")
    throw new Error("Du har ikke rettighed til at behandle projektets originalfiler.");
  const writer = await dependencies.getWriter();
  const prepared = await dependencies.prepare(writer, input, actorId);
  if (prepared.existing) return prepared.existing;
  const bytes = await dependencies.download(client, prepared);
  const result = await dependencies.validate(prepared.upload, prepared.object, bytes, actorId);
  // The RPC rechecks current memberships and Storage-version under row locks.
  return dependencies.persist(writer, input, actorId, prepared, result);
}

export const validateDroneOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(({ data, context }) =>
    executeValidateDroneOriginal(
      data,
      context.userId,
      context.supabase as unknown as DroneOriginalRequestClient,
    ),
  );
