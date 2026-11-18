import { z } from "zod";

export const PhotoPointSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .strict();
export type PhotoPoint = z.infer<typeof PhotoPointSchema>;
export const PhotoCaptureSchema = z
  .object({
    schema: z.literal("freyra.field-photo/v1"),
    originalPosition: PhotoPointSchema.nullable(),
    initialPosition: PhotoPointSchema.nullable(),
    correctionReason: z.string().trim().max(2000),
  })
  .strict();
export function photoDistanceMeters(a: PhotoPoint, b: PhotoPoint): number {
  PhotoPointSchema.parse(a);
  PhotoPointSchema.parse(b);
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function photoPositionAssessment(
  original: PhotoPoint | null,
  target: PhotoPoint,
  radius = 50,
) {
  PhotoPointSchema.parse(target);
  z.number().int().min(0).max(10000).parse(radius);
  const distance = original ? photoDistanceMeters(original, target) : null;
  return {
    distanceM: distance,
    status:
      distance === null
        ? ("manual_unverified" as const)
        : distance > radius
          ? ("needs_review" as const)
          : ("within_limit" as const),
  };
}
export const PHOTO_POSITION_LABELS = {
  within_limit: "Inden for afstandsgrænsen",
  needs_review: "Over afstandsgrænsen – kræver afklaring",
  manual_unverified: "Originalposition mangler – manuelt placeret",
};
export const PhotoPositionVersionSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  media_id: z.string().uuid(),
  version: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  reason: z.string(),
  policy_version: z.number().int().nonnegative(),
  radius_m: z.number().int().nonnegative(),
  distance_m: z.number().nullable(),
  status: z.enum(["within_limit", "needs_review", "manual_unverified"]),
  created_by: z.string().uuid(),
  created_at: z.string(),
  request_id: z.string().uuid(),
});
export type PhotoPositionVersion = z.infer<typeof PhotoPositionVersionSchema>;
export const PhotoPositionPolicySchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  version: z.number().int().positive(),
  radius_m: z.number().int().min(0).max(10000),
  reason: z.string(),
  created_by: z.string().uuid(),
  created_at: z.string(),
  request_id: z.string().uuid(),
});
