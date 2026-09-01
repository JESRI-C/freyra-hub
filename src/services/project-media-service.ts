import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  ProjectMediaItem,
  MediaCategory,
  MediaSource,
  MediaStatus,
} from "@/lib/platform/media-types";
import { getProjectMedia as getSeedMedia } from "@/data/project-media";

// Minimal interface for an untyped Supabase query builder, used to access the
// project_media table which is not yet in the generated Database types.
interface UntypedQueryBuilder {
  select(columns?: string): UntypedQueryBuilder;
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  update(values: Record<string, unknown>): UntypedQueryBuilder;
  delete(): UntypedQueryBuilder;
  eq(column: string, value: unknown): UntypedQueryBuilder;
  limit(count: number): UntypedQueryBuilder;
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
}

export interface MediaServiceResult<T> {
  data: T | null;
  error: string | null;
}

const BUCKET = "project-media";
const SIGNED_URL_TTL_SECONDS = 5 * 60;

function getAuthorizedMediaPath(row: Record<string, unknown>): string | null {
  const projectId = typeof row["project_id"] === "string" ? row["project_id"] : "";
  const filePath = typeof row["file_path"] === "string" ? row["file_path"] : "";
  const segments = filePath.split("/");

  if (
    !projectId ||
    !filePath ||
    filePath.startsWith("/") ||
    filePath.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  const hasLegacyProjectScope = segments[0] === projectId;
  const hasCanonicalProjectScope =
    segments[0] === "organizations" && segments[2] === "projects" && segments[3] === projectId;

  return hasLegacyProjectScope || hasCanonicalProjectScope ? filePath : null;
}

async function createMediaSignedUrl(filePath: string): Promise<MediaServiceResult<string>> {
  if (!isSupabaseConfigured || supabase === null) {
    return { data: null, error: "Supabase ikke konfigureret" };
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return {
      data: null,
      error: error?.message ?? "Storage returnerede ingen signeret URL",
    };
  }

  return { data: data.signedUrl, error: null };
}

// Map a DB row (snake_case) to ProjectMediaItem (camelCase)
function rowToMediaItem(row: Record<string, unknown>, signedUrl: string): ProjectMediaItem {
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
    // Live media URLs are always short-lived and are never read from persisted
    // `url`/`thumbnail_url` values. Those columns may contain legacy public URLs.
    url: signedUrl,
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
  };
}

async function materializePrivateMedia(
  row: Record<string, unknown>,
): Promise<MediaServiceResult<ProjectMediaItem>> {
  const filePath = getAuthorizedMediaPath(row);
  if (!filePath) {
    return { data: null, error: "Medierækken har en ugyldig eller forkert scoped Storage-sti" };
  }

  const signedUrl = await createMediaSignedUrl(filePath);
  if (!signedUrl.data) return { data: null, error: signedUrl.error };

  return { data: rowToMediaItem(row, signedUrl.data), error: null };
}

// List media for a project — falls back to seed data if Supabase not configured
export async function listProjectMedia(
  projectId: string,
): Promise<MediaServiceResult<ProjectMediaItem[]>> {
  if (!isSupabaseConfigured || supabase === null) {
    return { data: getSeedMedia(projectId), error: null };
  }

  const { data, error } = await getDb()!
    .from("project_media")
    .select("*")
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const materialized = await Promise.all(rows.map(materializePrivateMedia));
  const signingFailure = materialized.find((result) => result.data === null);
  if (signingFailure) {
    return { data: null, error: signingFailure.error ?? "Kunne ikke signere projektmedie" };
  }

  return {
    data: materialized.map((result) => result.data as ProjectMediaItem),
    error: null,
  };
}

// Upload a file to storage and insert a DB record
// Storage path: `{projectId}/{timestamp}_{filename}`
export async function uploadProjectMedia(
  input: UploadMediaInput,
): Promise<MediaServiceResult<ProjectMediaItem>> {
  if (!isSupabaseConfigured || supabase === null) {
    // Preview mode — construct a mock item without actual upload
    const mockItem: ProjectMediaItem = {
      id: `mock-${Date.now()}`,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      category: input.category,
      source: input.source,
      url: URL.createObjectURL(input.file),
      uploadedAt: new Date().toISOString(),
      capturedAt: input.capturedAt,
      coordinates: input.coordinates,
      isReportReady: input.isReportReady,
      tags: input.tags,
      status: "uploaded",
    };
    return { data: mockItem, error: null };
  }

  // Build storage path
  const timestamp = Date.now();
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${input.projectId}/${timestamp}_${safeName}`;

  // Upload file to storage
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(filePath, input.file, {
    cacheControl: "300",
    upsert: false,
    contentType: input.file.type || undefined,
  });

  if (storageError) {
    return { data: null, error: storageError.message };
  }

  // Insert DB record
  const insertPayload = {
    project_id: input.projectId,
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    source: input.source,
    file_path: filePath,
    // `url` is kept only for compatibility with the current non-null schema.
    // The live application ignores persisted URL fields and signs `file_path`.
    url: "",
    thumbnail_url: null,
    captured_at: input.capturedAt ?? null,
    lat: input.coordinates?.lat ?? null,
    lng: input.coordinates?.lng ?? null,
    altitude_m: input.coordinates?.altitudeM ?? null,
    accuracy_m: input.coordinates?.accuracyM ?? null,
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

  if (insertError || !insertData) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([filePath]);
    const insertMessage = insertError?.message ?? "Databasen returnerede ikke det oprettede medie";
    return {
      data: null,
      error: cleanupError
        ? `${insertMessage}; Storage-oprydning fejlede: ${cleanupError.message}`
        : insertMessage,
    };
  }

  return materializePrivateMedia(insertData as Record<string, unknown>);
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

  if (error || !data) {
    return {
      data: null,
      error: error?.message ?? "Databasen returnerede ikke det opdaterede medie",
    };
  }

  return materializePrivateMedia(data as Record<string, unknown>);
}

// Delete a media item (removes storage file + DB record)
export async function deleteProjectMedia(id: string): Promise<MediaServiceResult<void>> {
  if (!isSupabaseConfigured || supabase === null) {
    return { data: null, error: "Supabase ikke konfigureret" };
  }

  // RLS authorizes this row lookup. Never trust a path supplied by a caller.
  const { data: mediaRow, error: lookupError } = await getDb()!
    .from("project_media")
    .select("project_id,file_path")
    .eq("id", id)
    .single();

  if (lookupError || !mediaRow) {
    return { data: null, error: lookupError?.message ?? "Projektmediet blev ikke fundet" };
  }

  const filePath = getAuthorizedMediaPath(mediaRow);
  if (!filePath) {
    return { data: null, error: "Projektmediet har en ugyldig eller forkert scoped Storage-sti" };
  }

  // Remove the object while the metadata row still exists, so a project-aware
  // Storage DELETE policy can authorize the operation.
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([filePath]);
  if (storageError) {
    return { data: null, error: storageError.message };
  }

  const { error: dbError } = await getDb()!
    .from("project_media")
    .delete()
    .eq("id", id)
    .select("id")
    .single();

  if (dbError) {
    return { data: null, error: dbError.message };
  }

  return { data: undefined, error: null };
}
