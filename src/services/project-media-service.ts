import { inspectOrthophoto } from "./monitoring/orthophoto-metadata";
import { readOriginalMetadata, sha256 } from "./monitoring/drone-ingest";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { isDemoDataEnabled } from "@/lib/data-mode";
import type {
  ProjectMediaItem,
  MediaCategory,
  MediaSource,
  MediaStatus,
} from "@/lib/platform/media-types";
import { getProjectMedia as getSeedMedia } from "@/data/project-media";
import { getCanonicalDroneMediaUrl } from "@/lib/canonical-drone-media.functions";
import { canonicalDroneMediaReference } from "./monitoring/canonical-drone-media-reference";
// Minimal interface for an untyped Supabase query builder, used to access the
// project_media table which is not yet in the generated Database types.
interface UntypedQueryBuilder {
  select(
    columns?: string,
    options?: {
      count: "exact";
      head: true;
    },
  ): UntypedQueryBuilder;
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  update(values: Record<string, unknown>): UntypedQueryBuilder;
  delete(): UntypedQueryBuilder;
  eq(column: string, value: unknown): UntypedQueryBuilder;
  limit(count: number): UntypedQueryBuilder;
  range(from: number, to: number): UntypedQueryBuilder;
  order(
    column: string,
    opts?: {
      ascending: boolean;
    },
  ): UntypedQueryBuilder;
  single(): Promise<{
    data: Record<string, unknown> | null;
    error: {
      message: string;
    } | null;
  }>;
  then(
    resolve: (value: {
      data: unknown;
      count?: number | null;
      error: {
        message: string;
      } | null;
    }) => void,
  ): void;
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
  coordinates?: {
    lat: number;
    lng: number;
    altitudeM?: number;
    accuracyM?: number;
  };
  capturedAt?: string;
  flightId?: string;
  assetType?: "original" | "orthophoto";
}
export interface MediaServiceResult<T> {
  data: T | null;
  error: string | null;
  duplicate?: boolean;
}
const BUCKET = "project-media";
const ORIGINALS_BUCKET = "project-originals";
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
    flightId: (row["flight_id"] as string | null | undefined) ?? null,
    sha256:
      (row["sha256"] as string | null | undefined) ??
      ((row["metadata"] as Record<string, unknown> | undefined)?.original_sha256 as
        | string
        | undefined) ??
      null,
    metadata: {
      ...((row["metadata"] as Record<string, unknown> | undefined) ?? {}),
      // Historical field uploads retained a sanitized filename only in the path.
      storage_file_name:
        typeof row["file_path"] === "string"
          ? row["file_path"]
              .split("/")
              .at(-1)
              ?.replace(/^\d{13}_/, "")
          : undefined,
    },
  };
}
async function materializePrivateMedia(
  row: Record<string, unknown>,
  expectedProjectId?: string,
): Promise<MediaServiceResult<ProjectMediaItem>> {
  if (expectedProjectId && row["project_id"] !== expectedProjectId)
    return { data: null, error: "Medierækken matcher ikke det valgte projekt." };
  const bucket = row["storage_bucket"] ?? BUCKET;
  if (bucket === "monitoring-uploads") {
    try {
      const reference = canonicalDroneMediaReference(
        row,
        String(row["project_id"]),
        String(row["id"]),
      );
      // Browser-supplied buckets/paths are not inputs. The server loads the
      // caller's RLS row, checks the exact object twice and signs via caller RLS.
      const result = await getCanonicalDroneMediaUrl({
        data: { projectId: reference.project_id, mediaId: reference.id },
      });
      if (
        result.projectId !== reference.project_id ||
        result.mediaId !== reference.id ||
        result.originalSha256 !== reference.original_sha256 ||
        result.expiresInSeconds !== 60 ||
        result.reportEligible !== false ||
        result.georeferenced !== false
      )
        throw new Error("Originalreference kunne ikke bekræftes");
      return {
        data: rowToMediaItem({ ...row, is_report_ready: false }, result.signedUrl),
        error: null,
      };
    } catch {
      return {
        data: null,
        error:
          "Den kanoniske original kunne ikke læses. Filversion eller projektadgang skal kontrolleres; prøv igen.",
      };
    }
  }
  if (bucket === ORIGINALS_BUCKET) {
    const checksum = row["sha256"];
    const scope = row["upload_scope"];
    const path = getAuthorizedMediaPath(row);
    if (
      typeof checksum !== "string" ||
      !/^[a-f0-9]{64}$/.test(checksum) ||
      typeof scope !== "string" ||
      path !== `${row["project_id"]}/${scope}/${checksum}`
    )
      return { data: null, error: "Originalens filreference eller checksum er ugyldig." };
    if (!supabase) return { data: null, error: "Databasen er ikke konfigureret." };
    const signed = await supabase.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data)
      return { data: null, error: signed.error?.message ?? "Originalen kunne ikke åbnes." };
    return { data: rowToMediaItem(row, signed.data.signedUrl), error: null };
  }
  if (bucket !== BUCKET || row["original_role"] != null)
    return {
      data: null,
      error: "Projektmediet har en ugyldig Storage-bucket eller originalreference.",
    };
  const filePath = getAuthorizedMediaPath(row);
  if (!filePath) {
    return { data: null, error: "Medierækken har en ugyldig eller forkert scoped Storage-sti" };
  }
  const signedUrl = await createMediaSignedUrl(filePath);
  if (!signedUrl.data) return { data: null, error: signedUrl.error };
  return { data: rowToMediaItem(row, signedUrl.data), error: null };
}
// Demo media is available only by explicit offline choice.
/** Count promoted originals through caller RLS without downloading or signing every photo. */
export async function countCanonicalProjectOriginals(projectId: string): Promise<number> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Billederne kunne ikke hentes.");
  const { count, error } = await getDb()!
    .from("project_media")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("original_role", "drone_original")
    .eq("storage_bucket", "monitoring-uploads");
  if (error || count == null) throw new Error("Billederne kunne ikke hentes.");
  return count;
}
/** Refresh a single private link immediately before downloading a batch item. */
export async function getProjectMedia(
  projectId: string,
  mediaId: string,
): Promise<MediaServiceResult<ProjectMediaItem>> {
  if (!isSupabaseConfigured || !supabase)
    return { data: null, error: "Kundedatabasen er ikke konfigureret." };
  const { data, error } = await getDb()!
    .from("project_media")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", mediaId)
    .single();
  if (error || !data)
    return { data: null, error: "Originalen blev ikke fundet, eller projektadgangen er ændret." };
  return materializePrivateMedia(data as Record<string, unknown>, projectId);
}
export async function listProjectMedia(
  projectId: string,
): Promise<MediaServiceResult<ProjectMediaItem[]>> {
  if (!isSupabaseConfigured || supabase === null) {
    return { data: null, error: "Kundedatabasen er ikke konfigureret." };
  }
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = getDb()!
      .from("project_media")
      .select("*")
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false });
    if (typeof query.order === "function") query = query.order("id", { ascending: true });
    const paged = typeof query.range === "function";
    const { data, error } = await (paged ? query.range(offset, offset + 499) : query);
    if (error) return { data: null, error: error.message };
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (!paged || page.length < 500) break;
  }
  const materialized = await Promise.all(
    rows.map((row) => materializePrivateMedia(row, projectId)),
  );
  const signingFailure = materialized.find((result) => result.data === null);
  if (signingFailure) {
    return { data: null, error: signingFailure.error ?? "Kunne ikke signere projektmedie" };
  }
  return {
    data: materialized.map((result) => result.data as ProjectMediaItem),
    error: null,
  };
}

/** Location hints only: no file URLs or signed originals are requested for map setup. */
export async function getProjectPhotoPositions(projectId: string) {
  const db = getDb();
  if (!db) throw new Error("Kundedatabasen er ikke konfigureret.");
  const { data, error } = await db
    .from("project_media")
    .select("id,project_id,title,lat,lng")
    .eq("project_id", projectId)
    .order("id", { ascending: true })
    .limit(500);
  if (error) throw new Error("Billedernes positioner kunne ikke hentes.");
  return ((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
    if (
      row.project_id !== projectId ||
      typeof row.lat !== "number" ||
      typeof row.lng !== "number" ||
      !Number.isFinite(row.lat) ||
      !Number.isFinite(row.lng) ||
      row.lat < 54 ||
      row.lat > 58 ||
      row.lng < 7 ||
      row.lng > 16
    )
      return [];
    return [
      { id: String(row.id), label: String(row.title || "Billede"), lat: row.lat, lng: row.lng },
    ];
  });
}
// Upload a file to storage and insert a DB record
// Storage path: `{projectId}/{timestamp}_{filename}`
async function uploadPrivateOriginal(
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
  if (Array.isArray(existing) && existing.length) {
    const result = await materializePrivateMedia(existing[0], input.projectId);
    return { ...result, duplicate: true };
  }
  const filePath = `${input.projectId}/${scope}/${checksum}`;
  const { error: storageError } = await supabase.storage
    .from(ORIGINALS_BUCKET)
    .upload(filePath, input.file, {
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
    storage_bucket: ORIGINALS_BUCKET,
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
  return materializePrivateMedia(insertData as Record<string, unknown>, input.projectId);
}
export async function uploadProjectMedia(
  input: UploadMediaInput,
): Promise<MediaServiceResult<ProjectMediaItem>> {
  if (input.source === "drone" || input.category === "drone_image" || input.assetType)
    return uploadPrivateOriginal(input);
  if (!isSupabaseConfigured || supabase === null) {
    return {
      data: null,
      error: "Upload kræver en konfigureret kundedatabase. Filen er ikke gemt.",
    };
  }
  // Build storage path
  const timestamp = Date.now();
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${input.projectId}/${timestamp}_${safeName}`;
  const checksum = await sha256(input.file);
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
    // The top-level checksum is reserved by the DB for immutable project-originals paths.
    // Ordinary field uploads retain their byte checksum in provenance metadata.
    metadata: { original_name: input.file.name, original_sha256: checksum },
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
  return materializePrivateMedia(insertData as Record<string, unknown>, input.projectId);
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
    .select("id,project_id,file_path,storage_bucket,original_role")
    .eq("id", id)
    .single();
  if (lookupError || !mediaRow) {
    return { data: null, error: lookupError?.message ?? "Projektmediet blev ikke fundet" };
  }
  if (mediaRow["storage_bucket"] === "monitoring-uploads" || mediaRow["original_role"] != null)
    return {
      data: null,
      error:
        "Kanoniske droneoriginaler og deres dubletproveniens kan ikke slettes gennem mediegalleriet.",
    };
  if (mediaRow["storage_bucket"] != null && mediaRow["storage_bucket"] !== BUCKET)
    return { data: null, error: "Projektmediet har en ugyldig Storage-bucket." };
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
