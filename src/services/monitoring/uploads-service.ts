// Uploads service — CRUD, signed URLs and upload-type classification.
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logAuditEvent } from "./audit-service";

export type Upload = Database["public"]["Tables"]["uploads"]["Row"];
export type UploadInsert = Database["public"]["Tables"]["uploads"]["Insert"];
export type UploadUpdate = Database["public"]["Tables"]["uploads"]["Update"];

export const UPLOAD_BUCKET = "monitoring-uploads";
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

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
  jpg: "image", jpeg: "image", png: "image", heic: "image", webp: "image",
  mp4: "video", mov: "video", avi: "video", webm: "video",
  wav: "audio", mp3: "audio", m4a: "audio", flac: "audio", ogg: "audio",
  csv: "csv",
  xls: "excel", xlsx: "excel",
  json: "geojson", geojson: "geojson",
  kml: "kml",
  gpx: "gpx",
  pdf: "pdf",
  doc: "document", docx: "document", txt: "document", md: "document",
  zip: "archive", tar: "archive", gz: "archive",
  tif: "orthophoto", tiff: "orthophoto",
};

const ALLOWED_MIME_PREFIXES = [
  "image/", "video/", "audio/",
  "application/pdf", "application/json", "application/geo+json",
  "application/vnd.google-earth.kml+xml", "application/gpx+xml",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip", "application/x-zip-compressed",
  "text/csv", "text/plain", "text/xml", "application/xml",
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

/**
 * Uploads a file to the monitoring bucket under the user's folder and inserts
 * a matching row in public.uploads. Returns the created upload row.
 */
export async function uploadFile(params: {
  file: File;
  projectId: string | null;
  zoneId?: string | null;
  uploadType?: UploadType;
  userMetadata?: Record<string, unknown>;
  detectedMetadata?: Record<string, unknown>;
}): Promise<Upload> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("Not authenticated");

  if (params.file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Filen er for stor. Maks ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }
  const mime = params.file.type || "application/octet-stream";
  if (!isMimeAllowed(mime)) {
    throw new Error(`Filtypen ${mime || "ukendt"} understøttes ikke.`);
  }

  const uploadType = params.uploadType ?? detectUploadType(params.file.name, mime);
  const safe = sanitizeFileName(params.file.name);
  const path = `${user.id}/${Date.now()}-${safe}`;

  const { error: upErr } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(path, params.file, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  const insert: UploadInsert = {
    project_id: params.projectId,
    zone_id: params.zoneId ?? null,
    uploaded_by: user.id,
    file_name: safe,
    original_file_name: params.file.name,
    mime_type: mime,
    file_size: params.file.size,
    storage_path: path,
    upload_type: uploadType,
    status: "awaiting_validation",
    detected_metadata: (params.detectedMetadata ?? {}) as never,
    user_metadata: (params.userMetadata ?? {}) as never,
  };
  const { data, error } = await supabase.from("uploads").insert(insert as never).select("*").single();
  if (error) {
    // Roll back the storage object so we don't leak orphans.
    await supabase.storage.from(UPLOAD_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  const row = data as Upload;
  await logAuditEvent({
    projectId: row.project_id,
    eventType: "upload_created",
    entityType: "upload",
    entityId: row.id,
    title: `Fil uploadet: ${row.original_file_name}`,
    description: `${uploadType} · ${Math.round(row.file_size / 1024)} KB`,
    afterData: { id: row.id, upload_type: uploadType, mime, size: row.file_size },
  });
  return row;
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

export async function updateUpload(id: string, patch: UploadUpdate): Promise<Upload> {
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

export async function setUploadStatus(id: string, status: string, patch: Partial<UploadUpdate> = {}): Promise<Upload> {
  return updateUpload(id, { status, ...patch } as UploadUpdate);
}

export async function createSignedUrl(storagePath: string, expiresIn = 60 * 60): Promise<string> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.storage.from(UPLOAD_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteUpload(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const existing = await getUpload(id);
  if (!existing) return;
  await supabase.storage.from(UPLOAD_BUCKET).remove([existing.storage_path]).catch(() => undefined);
  const { error } = await supabase.from("uploads").delete().eq("id", id);
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
    draft: "Kladde",
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
