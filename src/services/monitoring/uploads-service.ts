// Uploads service — CRUD, signed URLs and upload-type classification.
import { supabase, isSupabaseConfigured, requireSupabaseUrl } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logAuditEvent } from "./audit-service";
import { uploadWithTus } from "./resumable-upload-service";

export type Upload = Database["public"]["Tables"]["uploads"]["Row"];
export type UploadInsert = Database["public"]["Tables"]["uploads"]["Insert"];
export type UploadUpdate = Database["public"]["Tables"]["uploads"]["Update"];

export const UPLOAD_BUCKET = "monitoring-uploads";
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB
export const SIGNED_UPLOAD_URL_TTL_SECONDS = 300;
export const MAX_UPLOAD_USER_METADATA_BYTES = 1024 * 1024;

export type UploadType =
  | "image"
  | "video"
  | "audio"
  | "csv"
  | "excel"
  | "geojson"
  | "kml"
  | "gpx"
  | "pdf"
  | "document"
  | "archive"
  | "drone_photo"
  | "drone_video"
  | "orthophoto"
  | "sensor_data"
  | "field_observation"
  | "species_observation"
  | "map_layer"
  | "other";

const EXT_TO_TYPE: Record<string, UploadType> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  heic: "image",
  webp: "image",
  mp4: "video",
  mov: "video",
  avi: "video",
  webm: "video",
  wav: "audio",
  mp3: "audio",
  m4a: "audio",
  flac: "audio",
  ogg: "audio",
  csv: "csv",
  xls: "excel",
  xlsx: "excel",
  json: "geojson",
  geojson: "geojson",
  kml: "kml",
  gpx: "gpx",
  pdf: "pdf",
  doc: "document",
  docx: "document",
  txt: "document",
  md: "document",
  zip: "archive",
  tar: "archive",
  gz: "archive",
  tif: "orthophoto",
  tiff: "orthophoto",
};

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
  "application/json",
  "application/geo+json",
  "application/vnd.google-earth.kml+xml",
  "application/gpx+xml",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip",
  "application/x-zip-compressed",
  "text/csv",
  "text/plain",
  "text/xml",
  "application/xml",
];

export function detectUploadType(fileName: string, mime: string): UploadType {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext && EXT_TO_TYPE[ext]) return EXT_TO_TYPE[ext];
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "excel";
  if (mime.includes("word")) return "document";
  if (mime.includes("zip")) return "archive";
  return "other";
}

export function isMimeAllowed(mime: string): boolean {
  if (!mime) return false;
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  dng: "image/x-adobe-dng",
  webp: "image/webp",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  csv: "text/csv",
  json: "application/json",
  geojson: "application/geo+json",
  kml: "application/vnd.google-earth.kml+xml",
  gpx: "application/gpx+xml",
  pdf: "application/pdf",
};

export function resolveUploadMime(file: Pick<File, "name" | "type">): string {
  const declared = file.type.trim().toLowerCase();
  if (declared) return declared;
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_MIME_TYPES[extension] ?? "application/octet-stream";
}

export interface UploadIntent {
  uploadId: string;
  storagePath: string;
  intentExpiresAt: string;
}

export function createUploadRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // RFC 4122 v4 fallback for older embedded browsers. This is an idempotency
  // key, not a security token; the server still issues the storage identity.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

interface UploadRpcError {
  code?: string;
  message: string;
}

async function callUploadRpc<T>(
  functionName: "create_upload_intent" | "finalize_upload_intent" | "cancel_upload_intent",
  args: Record<string, unknown>,
): Promise<{ data: T[] | null; error: UploadRpcError | null }> {
  if (!supabase) throw new Error("Supabase not configured");
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: T[] | null; error: UploadRpcError | null }>;
  return rpc(functionName, args);
}

export class UploadTransferError extends Error {
  constructor(
    message: string,
    public readonly intent: UploadIntent,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "UploadTransferError";
  }
}

export async function createUploadIntent(params: {
  file: File;
  projectId: string | null;
  zoneId?: string | null;
  uploadType?: UploadType;
  userMetadata?: Record<string, unknown>;
  clientRequestId?: string;
}): Promise<UploadIntent> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  if (!params.projectId) throw new Error("Vælg et projekt før upload.");
  if (params.file.size <= 0 || params.file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Filen er tom eller for stor. Maks ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    );
  }
  const mime = resolveUploadMime(params.file);
  if (!isMimeAllowed(mime)) throw new Error(`Filtypen ${mime} understøttes ikke.`);
  const userMetadata = params.userMetadata ?? {};
  const metadataBytes = new TextEncoder().encode(JSON.stringify(userMetadata)).byteLength;
  if (metadataBytes > MAX_UPLOAD_USER_METADATA_BYTES) {
    throw new Error("Billedmetadata fylder mere end 1 MB og skal reduceres før upload.");
  }

  const { data, error } = await callUploadRpc<{
    upload_id: string;
    storage_path: string;
    intent_expires_at: string;
  }>("create_upload_intent", {
    p_project_id: params.projectId,
    p_original_file_name: params.file.name,
    p_mime_type: mime,
    p_file_size: params.file.size,
    p_client_request_id: params.clientRequestId ?? createUploadRequestId(),
    p_zone_id: params.zoneId ?? undefined,
    p_upload_type: params.uploadType ?? detectUploadType(params.file.name, mime),
    p_user_metadata: userMetadata,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.upload_id || !row.storage_path || !row.intent_expires_at) {
    throw new Error("Databasen returnerede ikke et gyldigt upload-intent.");
  }
  return {
    uploadId: row.upload_id,
    storagePath: row.storage_path,
    intentExpiresAt: row.intent_expires_at,
  };
}

/**
 * Uploads a file to the monitoring bucket under the user's folder and inserts
 * a matching row in public.uploads. Returns the created upload row.
 */
export async function uploadFileResumable(params: {
  file: File;
  projectId: string | null;
  zoneId?: string | null;
  uploadType?: UploadType;
  userMetadata?: Record<string, unknown>;
  onProgress?: (percentage: number, bytesUploaded: number, bytesTotal: number) => void;
  signal?: AbortSignal;
  resumeIntent?: UploadIntent;
  clientRequestId?: string;
}): Promise<Upload> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  // Re-issue the same idempotent database request on every attempt. This both
  // recovers a lost create-RPC response and proves that current file/scope
  // parameters still match the immutable intent before any TUS bytes move.
  const intent = await createUploadIntent(params);
  if (
    params.resumeIntent &&
    (params.resumeIntent.uploadId !== intent.uploadId ||
      params.resumeIntent.storagePath !== intent.storagePath)
  ) {
    throw new UploadTransferError(
      "Upload-intent matcher ikke den oprindelige fil og projektkontekst.",
      intent,
    );
  }

  if (params.resumeIntent) {
    const recovered = await finalizeIntent(intent);
    if (recovered.row) return recovered.row;
    const objectMissing =
      recovered.error?.code === "55000" &&
      recovered.error.message.toLowerCase().includes("object not found");
    if (!objectMissing) {
      throw new UploadTransferError(
        `Upload-intent kunne ikke genoptages: ${recovered.error?.message ?? "ukendt fejl"}`,
        intent,
        { cause: recovered.error ?? undefined },
      );
    }
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    throw new UploadTransferError("Upload kræver en aktiv session.", intent, {
      cause: sessionError ?? undefined,
    });
  }
  const mime = resolveUploadMime(params.file);

  try {
    await uploadWithTus({
      file: params.file,
      projectUrl: requireSupabaseUrl(),
      accessToken,
      bucketName: UPLOAD_BUCKET,
      objectName: intent.storagePath,
      contentType: mime,
      onProgress: params.onProgress,
      signal: params.signal,
    });
  } catch (error) {
    throw new UploadTransferError(
      error instanceof Error ? error.message : "Den resumérbare upload fejlede.",
      intent,
      { cause: error },
    );
  }

  const finalized = await finalizeIntent(intent);
  if (finalized.error) {
    throw new UploadTransferError(
      `Filen er overført, men modtagelsen kunne ikke verificeres: ${finalized.error.message}`,
      intent,
      { cause: finalized.error },
    );
  }
  if (!finalized.row)
    throw new UploadTransferError("Den modtagne upload kunne ikke genlæses.", intent);
  return finalized.row;
}

export const uploadFile = uploadFileResumable;

export async function cancelUploadIntent(uploadId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await callUploadRpc<{
    upload_id: string;
    storage_path: string;
    status: string;
  }>("cancel_upload_intent", { p_upload_id: uploadId });
  if (error) throw error;
  if (data?.[0]?.status !== "archived") throw new Error("Upload-intent blev ikke annulleret.");
}

async function finalizeIntent(
  intent: UploadIntent,
): Promise<{ row?: Upload; error?: UploadRpcError }> {
  const { data, error } = await callUploadRpc<{
    upload_id: string;
    storage_path: string;
    status: string;
  }>("finalize_upload_intent", { p_upload_id: intent.uploadId });
  if (error) return { error };
  if (!data?.[0]?.upload_id || !data[0].storage_path || !data[0].status) {
    return { error: { message: "Databasen bekræftede ikke den modtagne upload." } };
  }
  const row = await getUpload(intent.uploadId);
  return row ? { row } : { error: { message: "Den modtagne upload kunne ikke genlæses." } };
}

export async function listUploads(params: {
  projectId?: string | null;
  status?: string;
  limit?: number;
}): Promise<Upload[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let q = supabase.from("uploads").select("*").order("created_at", { ascending: false });
  if (params.projectId) q = q.eq("project_id", params.projectId);
  if (params.status) q = q.eq("status", params.status);
  q = q.limit(params.limit ?? 50);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Upload[] | null) ?? [];
}

export async function getUpload(id: string): Promise<Upload | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.from("uploads").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Upload | null) ?? null;
}

export type UploadUserUpdate = Pick<
  UploadUpdate,
  "project_id" | "organization_id" | "zone_id" | "user_metadata"
>;

export async function updateUpload(id: string, patch: UploadUserUpdate): Promise<Upload> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("uploads")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Upload;
}

export async function createSignedUrl(storagePath: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .createSignedUrl(storagePath, SIGNED_UPLOAD_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteUpload(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const existing = await getUpload(id);
  if (!existing) return;
  const { error: storageError } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .remove([existing.storage_path]);
  if (storageError) throw storageError;

  const { error } = await supabase.from("uploads").delete().eq("id", id).select("id").single();
  if (error) throw error;
  await logAuditEvent({
    projectId: existing.project_id,
    eventType: "upload_deleted",
    entityType: "upload",
    entityId: id,
    title: `Fil slettet: ${existing.original_file_name}`,
    beforeData: { id, upload_type: existing.upload_type, size: existing.file_size },
  });
}

export function uploadStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Overførsel ikke afsluttet",
    awaiting_validation: "Afventer validering",
    validating: "Valideres",
    ready: "Klar til import",
    importing: "Importeres",
    imported: "Importeret",
    imported_with_warnings: "Importeret med advarsler",
    rejected: "Afvist",
    failed: "Fejlet",
    archived: "Arkiveret",
  };
  return map[status] ?? status;
}
