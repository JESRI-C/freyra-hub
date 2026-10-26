import { inspectOrthophoto } from "./monitoring/orthophoto-metadata";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  ProjectMediaItem,
  MediaCategory,
  MediaSource,
  MediaStatus,
} from "@/lib/platform/media-types";
import { readOriginalMetadata, sha256 } from "./monitoring/drone-ingest";

// Minimal interface for an untyped Supabase query builder, used to access the
// project_media table which is not yet in the generated Database types.
interface UntypedQueryBuilder {
  select(columns?: string): UntypedQueryBuilder;
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  update(values: Record<string, unknown>): UntypedQueryBuilder;
  delete(): UntypedQueryBuilder;
  eq(column: string, value: unknown): UntypedQueryBuilder;
  limit(count: number): UntypedQueryBuilder;
  range(from: number, to: number): UntypedQueryBuilder;
  order(column: string, opts?: { ascending: boolean }): UntypedQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  then(resolve: (value: { data: unknown; error: { message: string } | null }) => void): void;
}

interface UntypedDb {
  from(table: string): UntypedQueryBuilder;
}

function getDb(): UntypedDb | null {
  return supabase as unknown as UntypedDb | null;
}

export interface UploadMediaInput {
  projectId: string;
  file: File;
  title: string;
  description?: string;
  category: MediaCategory;
  source: MediaSource;
  isReportReady: boolean;
  tags: string[];
  coordinates?: { lat: number; lng: number; altitudeM?: number; accuracyM?: number };
  capturedAt?: string;
  flightId?: string;
  assetType?: "original" | "orthophoto";
}

export interface MediaServiceResult<T> {
  data: T | null;
  error: string | null;
  duplicate?: boolean;
}

const BUCKET = "project-originals";

// Map a DB row (snake_case) to ProjectMediaItem (camelCase)
function rowToMediaItem(row: Record<string, unknown>): ProjectMediaItem {
  const lat = row["lat"] as number | null | undefined;
  const lng = row["lng"] as number | null | undefined;
  const altitudeM = row["altitude_m"] as number | null | undefined;
  const accuracyM = row["accuracy_m"] as number | null | undefined;

  const coordinates =
    lat != null && lng != null
      ? {
          lat,
          lng,
          ...(altitudeM != null ? { altitudeM } : {}),
          ...(accuracyM != null ? { accuracyM } : {}),
        }
      : undefined;

  return {
    id: String(row["id"]),
    projectId: String(row["project_id"]),
    title: String(row["title"]),
    description: row["description"] != null ? String(row["description"]) : undefined,
    category: row["category"] as MediaCategory,
    source: row["source"] as MediaSource,
    url: String(row["url"]),
    thumbnailUrl: row["thumbnail_url"] != null ? String(row["thumbnail_url"]) : undefined,
    uploadedAt: String(row["uploaded_at"]),
    capturedAt: row["captured_at"] != null ? String(row["captured_at"]) : undefined,
    coordinates,
    isReportReady: Boolean(row["is_report_ready"]),
    tags: Array.isArray(row["tags"]) ? (row["tags"] as string[]) : [],
    status: (row["status"] as MediaStatus) ?? "uploaded",
    actionId: (row["action_id"] as string | null | undefined) ?? null,
    documentId: (row["document_id"] as string | null | undefined) ?? null,
    direction: (row["direction"] as number | null | undefined) ?? null,
    beforeMediaId: (row["before_media_id"] as string | null | undefined) ?? null,
    flightId: (row["flight_id"] as string | null | undefined) ?? null,
    sha256: (row["sha256"] as string | null | undefined) ?? null,
    metadata: (row["metadata"] as Record<string, unknown> | undefined) ?? {},
  };
}

// List media for a project — falls back to seed data if Supabase not configured
export async function listProjectMedia(
  projectId: string,
): Promise<MediaServiceResult<ProjectMediaItem[]>> {
  if (!isSupabaseConfigured || supabase === null) {
    return { data: null, error: "Supabase ikke konfigureret. Ingen medier er hentet." };
  }

  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await getDb()!
      .from("project_media")
      .select("*")
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return { data: null, error: error.message };
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return { data: await Promise.all(rows.map(resolveMediaItem)), error: null };
}

// Upload a file to storage and insert a DB record
// Storage path: `{projectId}/{timestamp}_{filename}`
export async function uploadProjectMedia(
  input: UploadMediaInput,
): Promise<MediaServiceResult<ProjectMediaItem>> {
  if (!isSupabaseConfigured || supabase === null)
    return { data: null, error: "Supabase ikke konfigureret. Filen er ikke gemt." };
  if (!input.projectId) return { data: null, error: "Vælg et projekt før upload." };
  if (input.file.size > 200 * 1024 * 1024)
    return { data: null, error: "Maksimal filstørrelse er 200 MB." };
  const checksum = await sha256(input.file);
  const metadata = await readOriginalMetadata(input.file);
  const orthophoto = input.assetType === "orthophoto" ? await inspectOrthophoto(input.file) : null;
  const scope = input.flightId ?? "field";
  const { data: existing, error: lookupError } = await getDb()!
    .from("project_media")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("sha256", checksum)
    .eq("upload_scope", scope)
    .limit(1);
  if (lookupError) return { data: null, error: lookupError.message };
  if (Array.isArray(existing) && existing.length)
    return { data: await resolveMediaItem(existing[0]), error: null, duplicate: true };
  const filePath = `${input.projectId}/${scope}/${checksum}`;
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(filePath, input.file, {
    cacheControl: "3600",
    upsert: false,
    contentType: input.file.type || "application/octet-stream",
  });
  // A previous upload may have reached storage before its metadata insert failed.
  if (storageError && !/already exists|duplicate/i.test(storageError.message))
    return { data: null, error: storageError.message };
  const coordinates =
    metadata.latitude !== null && metadata.longitude !== null
      ? {
          lat: metadata.latitude,
          lng: metadata.longitude,
          altitudeM: metadata.altitudeM ?? undefined,
        }
      : input.coordinates;

  // Insert DB record
  const insertPayload = {
    project_id: input.projectId,
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    source: input.source,
    file_path: filePath,
    url: "",
    storage_bucket: BUCKET,
    sha256: checksum,
    upload_scope: scope,
    flight_id: input.flightId ?? null,
    metadata: {
      ...metadata,
      original_name: input.file.name,
      asset_type: input.assetType ?? "original",
      orthophoto,
      gps_source: metadata.latitude !== null ? "exif" : coordinates ? "manual" : "missing",
    },
    direction: metadata.direction,
    thumbnail_url: null,
    captured_at: metadata.capturedAt ?? input.capturedAt ?? null,
    lat: coordinates?.lat ?? null,
    lng: coordinates?.lng ?? null,
    altitude_m: coordinates?.altitudeM ?? null,
    accuracy_m: coordinates?.accuracyM ?? null,
    is_report_ready: input.isReportReady,
    tags: input.tags,
    status: "uploaded" as MediaStatus,
    file_size_bytes: input.file.size,
    mime_type: input.file.type || null,
  };

  const { data: insertData, error: insertError } = await getDb()!
    .from("project_media")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    // Preserve original for safe retry; never delete a possibly shared checksum object.
    return { data: null, error: insertError.message };
  }

  return { data: await resolveMediaItem(insertData as Record<string, unknown>), error: null };
}

// Update metadata (title, description, isReportReady, tags)
export async function updateProjectMedia(
  id: string,
  updates: Partial<Pick<ProjectMediaItem, "title" | "description" | "isReportReady" | "tags">>,
): Promise<MediaServiceResult<ProjectMediaItem>> {
  if (!isSupabaseConfigured || supabase === null) {
    return { data: null, error: "Supabase ikke konfigureret" };
  }

  const dbUpdates: Record<string, unknown> = {};
  if (updates.title !== undefined) dbUpdates["title"] = updates.title;
  if (updates.description !== undefined) dbUpdates["description"] = updates.description ?? null;
  if (updates.isReportReady !== undefined) dbUpdates["is_report_ready"] = updates.isReportReady;
  if (updates.tags !== undefined) dbUpdates["tags"] = updates.tags;

  const { data, error } = await getDb()!
    .from("project_media")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: await resolveMediaItem(data as Record<string, unknown>), error: null };
}

// Delete a media item (removes storage file + DB record)
export async function deleteProjectMedia(
  id: string,
  filePath: string,
): Promise<MediaServiceResult<void>> {
  if (!isSupabaseConfigured || supabase === null) {
    return { data: null, error: "Supabase ikke konfigureret" };
  }

  const { data: original, error: readError } = await getDb()!
    .from("project_media")
    .select("sha256,storage_bucket")
    .eq("id", id)
    .single();
  if (readError) return { data: null, error: readError.message };
  if (original?.sha256)
    return {
      data: null,
      error: "Originaler bevares af hensyn til dokumentation og kan ikke slettes her.",
    };

  // Delete legacy DB record first
  const { error: dbError } = await getDb()!.from("project_media").delete().eq("id", id);

  if (dbError) {
    return { data: null, error: dbError.message };
  }

  // Remove storage file (best-effort)
  if (filePath) {
    await supabase.storage
      .from(String(original?.storage_bucket ?? "project-media"))
      .remove([filePath]);
  }

  return { data: undefined, error: null };
}

// New originals are private. Signed URLs are issued only after storage RLS authorizes access.
async function resolveMediaItem(row: Record<string, unknown>): Promise<ProjectMediaItem> {
  const item = rowToMediaItem(row);
  if (row.storage_bucket && row.file_path && supabase) {
    const { data, error } = await supabase.storage
      .from(String(row.storage_bucket))
      .createSignedUrl(String(row.file_path), 900);
    item.url = error ? "" : (data?.signedUrl ?? "");
  }
  return item;
}
export function getMediaPublicUrl(_filePath: string): null {
  return null;
}
