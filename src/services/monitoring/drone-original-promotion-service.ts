import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export interface DroneOriginalPromotionOriginSummary {
  uploadId: string;
  mediaId: string;
  originId: string;
  originalSha256: string;
  originalValidationStatus: "raw_original_validated" | "review_required";
  deduplicated: boolean;
}
interface OriginQuery {
  select(columns: string): OriginQuery;
  eq(column: string, value: string): OriginQuery;
  in(column: string, values: readonly string[]): OriginQuery;
  order(column: string, options: { ascending: boolean }): OriginQuery;
  limit(count: number): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}
interface OriginReader {
  from(table: "project_media_upload_origins"): OriginQuery;
}
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Hash = /^[0-9a-f]{64}$/;
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && Uuid.test(value);
}

/** This summary proves a saved raw-file relation, never review or report authority. */
export function parseDroneOriginalPromotionOrigins(
  value: unknown,
  projectId: string,
): DroneOriginalPromotionOriginSummary[] {
  if (!Array.isArray(value)) throw new Error("Originaltilknytningerne kunne ikke bekræftes.");
  const seen = new Set<string>();
  return value.map((item) => {
    const row = record(item);
    const media = record(row?.media);
    if (
      !row ||
      !media ||
      row.project_id !== projectId ||
      media.project_id !== projectId ||
      !isUuid(row.id) ||
      !isUuid(row.upload_id) ||
      !isUuid(row.media_id) ||
      media.id !== row.media_id ||
      !isUuid(media.source_upload_id) ||
      typeof row.original_sha256 !== "string" ||
      !Hash.test(row.original_sha256) ||
      media.original_sha256 !== row.original_sha256 ||
      media.original_role !== "drone_original" ||
      !["raw_original_validated", "review_required"].includes(
        String(media.original_validation_status),
      ) ||
      media.is_report_ready !== false ||
      seen.has(row.upload_id)
    )
      throw new Error("Originaltilknytningernes sag eller filidentitet kunne ikke bekræftes.");
    seen.add(row.upload_id);
    return {
      uploadId: row.upload_id,
      mediaId: row.media_id,
      originId: row.id,
      originalSha256: row.original_sha256,
      originalValidationStatus:
        media.original_validation_status as DroneOriginalPromotionOriginSummary["originalValidationStatus"],
      deduplicated: media.source_upload_id !== row.upload_id,
    };
  });
}

/** Ordinary caller client + tenant RLS; no service credentials or signed URLs. */
export async function listDroneOriginalPromotionOrigins(
  projectId: string,
  uploadIds?: readonly string[],
): Promise<DroneOriginalPromotionOriginSummary[]> {
  if (
    !Uuid.test(projectId) ||
    uploadIds?.some((id) => !Uuid.test(id)) ||
    (uploadIds?.length ?? 0) > 200
  )
    throw new Error("Originaltilknytningerne kræver gyldige projektreferencer og højst 200 filer.");
  if (!isSupabaseConfigured || !supabase) throw new Error("Kundedatabasen er ikke konfigureret.");
  if (uploadIds?.length === 0) return [];
  let query = (supabase as unknown as OriginReader)
    .from("project_media_upload_origins")
    .select(
      "id,project_id,upload_id,media_id,original_sha256,media:project_media!project_media_upload_origins_media_id_fkey(id,project_id,source_upload_id,original_sha256,original_role,original_validation_status,is_report_ready)",
    )
    .eq("project_id", projectId);
  if (uploadIds) query = query.in("upload_id", [...new Set(uploadIds)]);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error)
    throw new Error(
      "Originaltilknytningerne kunne ikke hentes. Kontrollér din adgang, og prøv igen.",
    );
  return parseDroneOriginalPromotionOrigins(data, projectId);
}
