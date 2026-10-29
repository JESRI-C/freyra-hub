import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import {
  PhotoPointSchema,
  PhotoPositionPolicySchema,
  PhotoPositionVersionSchema,
  type PhotoPoint,
} from "@/lib/field-photo-position";
import { assertProjectScope, type ProjectScope } from "./project-workspace-service";
const uuid = z.string().uuid(),
  version = z.number().int().min(0).max(2147483646),
  reason = z.string().trim().min(1, "Angiv en begrundelse.").max(2000);
async function db(scope: ProjectScope) {
  uuid.parse(scope.projectId);
  uuid.parse(scope.organizationId);
  await assertProjectScope(scope);
  if (!supabase) throw new Error("Database er ikke konfigureret.");
  return supabase as unknown as SupabaseClient;
}
function check(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "40001" || error.code === "23505")
    throw new Error("Placering eller afstandsregel er ændret. Genindlæs før du gemmer.");
  if (["42P01", "PGRST202", "PGRST205"].includes(error.code ?? ""))
    throw new Error("Fotoets positionshistorik er endnu ikke installeret i dette miljø.");
  throw new Error(
    "Fotoets positionshistorik kunne ikke læses eller gemmes. Kontrollér adgang og input.",
  );
}
function scoped<T extends { project_id: string; organization_id: string }>(
  scope: ProjectScope,
  row: T,
) {
  if (row.project_id !== scope.projectId || row.organization_id !== scope.organizationId)
    throw new Error("Forkert projektreference.");
  return row;
}
export const FieldPhotoSummarySchema = z.object({
  id: uuid,
  title: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});
export async function listFieldPhotos(scope: ProjectScope) {
  const client = await db(scope);
  const { data, error } = await client
    .from("project_media")
    .select("id,title,lat,lng,metadata")
    .eq("project_id", scope.projectId)
    .eq("metadata->field_photo_capture->>schema", "freyra.field-photo/v1")
    .order("uploaded_at", { ascending: false })
    .order("id")
    .limit(50);
  check(error);
  return (data ?? []).map((r) => FieldPhotoSummarySchema.parse(r));
}
export async function getFieldPhotoPolicy(scope: ProjectScope) {
  const client = await db(scope);
  const { data, error } = await client
    .from("field_photo_policy_versions")
    .select("*")
    .eq("project_id", scope.projectId)
    .eq("organization_id", scope.organizationId)
    .order("version", { ascending: false })
    .limit(1);
  check(error);
  return data?.length ? scoped(scope, PhotoPositionPolicySchema.parse(data[0])) : null;
}
export async function listFieldPhotoPositions(scope: ProjectScope, mediaId: string) {
  uuid.parse(mediaId);
  const client = await db(scope);
  const { data, error } = await client
    .from("field_photo_position_versions")
    .select("*")
    .eq("project_id", scope.projectId)
    .eq("organization_id", scope.organizationId)
    .eq("media_id", mediaId)
    .order("version", { ascending: false })
    .limit(100);
  check(error);
  return (data ?? []).map((r) => {
    const row = scoped(scope, PhotoPositionVersionSchema.parse(r));
    if (row.media_id !== mediaId) throw new Error("Forkert fotoreference.");
    return row;
  });
}
export async function saveFieldPhotoPosition(
  scope: ProjectScope,
  input: {
    mediaId: string;
    point: PhotoPoint;
    reason: string;
    expectedVersion: number;
    expectedPolicyVersion: number;
    requestId: string;
  },
) {
  uuid.parse(input.mediaId);
  uuid.parse(input.requestId);
  const point = PhotoPointSchema.parse(input.point);
  const client = await db(scope);
  const { data, error } = await client.rpc("save_field_photo_position", {
    p_project_id: scope.projectId,
    p_organization_id: scope.organizationId,
    p_media_id: input.mediaId,
    p_lat: point.lat,
    p_lng: point.lng,
    p_reason: reason.parse(input.reason),
    p_expected_version: version.parse(input.expectedVersion),
    p_expected_policy_version: version.parse(input.expectedPolicyVersion),
    p_request_id: input.requestId,
  });
  check(error);
  if (!Array.isArray(data) || data.length !== 1) throw new Error("Fotoets kvittering mangler.");
  const row = scoped(scope, PhotoPositionVersionSchema.parse(data[0]));
  if (row.media_id !== input.mediaId || row.request_id !== input.requestId)
    throw new Error("Fotoets kvittering matcher ikke anmodningen.");
  return row;
}
export async function saveFieldPhotoPolicy(
  scope: ProjectScope,
  input: { radiusM: number; reason: string; expectedVersion: number; requestId: string },
) {
  uuid.parse(input.requestId);
  const client = await db(scope);
  const { data, error } = await client.rpc("save_field_photo_policy", {
    p_project_id: scope.projectId,
    p_organization_id: scope.organizationId,
    p_radius_m: z.number().int().min(0).max(10000).parse(input.radiusM),
    p_reason: reason.parse(input.reason),
    p_expected_version: version.parse(input.expectedVersion),
    p_request_id: input.requestId,
  });
  check(error);
  if (!Array.isArray(data) || data.length !== 1)
    throw new Error("Afstandsreglens kvittering mangler.");
  const row = scoped(scope, PhotoPositionPolicySchema.parse(data[0]));
  if (row.request_id !== input.requestId)
    throw new Error("Afstandsreglens kvittering matcher ikke anmodningen.");
  return row;
}
