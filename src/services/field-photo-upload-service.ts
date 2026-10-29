import {
  supabase,
  requireSupabaseUrl,
  createActorBoundSupabaseClient,
} from "@/lib/supabase/client";
import {
  FieldPhotoUploadPayload,
  FieldPhotoUuid,
  parseFieldPhotoUpload,
  parseFieldPhotoReceipt,
} from "@/lib/field-photo-upload";
import { verifyFieldPhoto } from "@/lib/field-photo-verification.functions";
import { uploadWithTus } from "./monitoring/resumable-upload-service";
import type { z } from "zod";

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
export async function uploadFieldPhoto(input: {
  projectId: string;
  uploadId: string;
  file: File;
  payload: z.input<typeof FieldPhotoUploadPayload>;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  expectedActorId?: string;
}) {
  if (input.signal?.aborted) throw new Error("Uploaden er sat på pause. Behold originalfilen.");
  const projectId = FieldPhotoUuid.parse(input.projectId),
    uploadId = FieldPhotoUuid.parse(input.uploadId);
  const payload = FieldPhotoUploadPayload.parse(input.payload);
  if (!supabase) throw new Error("Databasen er ikke konfigureret.");
  if (
    input.file.size !== payload.sizeBytes ||
    input.file.type !== payload.mimeType ||
    input.file.name !== payload.originalName
  )
    throw new Error("Filen matcher ikke uploadopgaven.");
  const session = await supabase.auth.getSession();
  const actor = session.data.session?.user.id,
    token = session.data.session?.access_token;
  if (!actor || !token) throw new Error("Upload kræver en aktiv session.");
  if (input.expectedActorId && input.expectedActorId !== actor)
    throw new Error("Sessionen er ændret. Originalen tilhører en anden bruger.");
  const db = createActorBoundSupabaseClient(actor) as unknown as RpcClient;
  const args = { p_project_id: projectId, p_upload_id: uploadId };
  const begun = await db.rpc("begin_field_photo_upload", { ...args, p_payload: payload });
  if (input.signal?.aborted) throw new Error("Uploaden er sat på pause. Behold originalfilen.");
  if (begun.error || !Array.isArray(begun.data) || begun.data.length !== 1)
    throw new Error(
      "Uploadopgaven kunne ikke åbnes. Kontrollér din adgang; ændrede oplysninger kræver en ny uploadopgave.",
    );
  let upload = parseFieldPhotoUpload(begun.data[0], projectId, uploadId);
  if (upload.created_by !== actor || JSON.stringify(upload.payload) !== JSON.stringify(payload))
    throw new Error("Uploadopgaven matcher ikke din fil og bruger.");
  if (!upload.received_at) {
    // A previous TUS transfer may have completed before its response arrived.
    // Only a genuinely missing object is permission to send bytes again.
    let finalized = await db.rpc("finalize_field_photo_upload", args);
    if (input.signal?.aborted) throw new Error("Uploaden er sat på pause. Behold originalfilen.");
    if (finalized.error?.code === "P0002") {
      await uploadWithTus({
        file: input.file,
        projectUrl: requireSupabaseUrl(),
        accessToken: token,
        getAccessToken: async () => {
          const current = await supabase!.auth.getSession();
          if (current.data.session?.user.id !== actor || !current.data.session.access_token)
            throw new Error("Din session er ændret. Overførslen er sat på pause.");
          return current.data.session.access_token;
        },
        bucketName: "project-media",
        objectName: upload.storage_path,
        contentType: payload.mimeType,
        onProgress: (percent) => input.onProgress?.(percent),
        signal: input.signal,
      });
      if (input.signal?.aborted) throw new Error("Uploaden er sat på pause. Behold originalfilen.");
      finalized = await db.rpc("finalize_field_photo_upload", args);
    }
    if (finalized.error || !Array.isArray(finalized.data) || finalized.data.length !== 1)
      throw new Error("Overførslen er ikke kvitteret. Behold originalfilen og prøv igen.");
    upload = parseFieldPhotoUpload(finalized.data[0], projectId, uploadId);
    if (!upload.received_at) throw new Error("Serveren har ikke bekræftet modtagelsen.");
  }
  if (input.signal?.aborted)
    throw new Error(
      "Overførslen er modtaget; serverkontrollen er sat på pause. Behold originalfilen.",
    );
  const receipt = parseFieldPhotoReceipt(
    await verifyFieldPhoto({ data: { projectId, uploadId, expectedActorId: actor } }),
    upload,
  );
  if (receipt.status !== "verified")
    throw new Error(
      "Den gemte fils checksum matcher ikke originalen. Behold din fil; denne upload kræver afklaring.",
    );
  return { upload, receipt };
}
