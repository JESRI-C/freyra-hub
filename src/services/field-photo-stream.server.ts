import { createHash } from "node:crypto";
import type { FieldPhotoUpload } from "@/lib/field-photo-upload";
export interface FieldPhotoStorageClient {
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
  client: FieldPhotoStorageClient,
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
