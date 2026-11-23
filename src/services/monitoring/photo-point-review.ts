import { z } from "zod";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import type { DroneImageInspectionRecord } from "./drone-image-inspection-persistence";

const Uuid = z.string().uuid();
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const ReviewText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) =>
      [...text].every(
        (char) => char === "\n" || (char.codePointAt(0)! >= 32 && !/[\u007f-\u009f]/.test(char)),
      ),
    );
export const PhotoPointReviewInputSchema = z
  .object({
    projectId: Uuid,
    bindingId: Uuid,
    bindingSha256: Hash,
    requestId: Uuid,
    expectedCallerUserId: Uuid,
    decision: z.enum(["confirmed", "rejected"]),
    note: ReviewText(2000),
    reviewerName: ReviewText(150),
    inspectionId: Uuid.nullable(),
    inspectionSha256: Hash.nullable(),
  })
  .strict()
  .refine((value) => (value.inspectionId === null) === (value.inspectionSha256 === null));
export type PhotoPointReviewInput = z.infer<typeof PhotoPointReviewInputSchema>;
export const PhotoPointReviewSchema = z
  .object({
    schema: z.literal("freyra.photo-point-review/v1"),
    projectId: Uuid,
    bindingId: Uuid,
    bindingSha256: Hash,
    mediaId: Uuid,
    originalSha256: Hash,
    baselineId: Uuid,
    baselineSha256: Hash,
    decision: z.enum(["confirmed", "rejected"]),
    note: ReviewText(2000),
    reviewerName: ReviewText(150),
    inspectionId: Uuid.nullable(),
    inspectionSha256: Hash.nullable(),
  })
  .strict()
  .refine((value) => (value.inspectionId === null) === (value.inspectionSha256 === null));
export type PhotoPointReview = z.infer<typeof PhotoPointReviewSchema>;

/** A professional decision concerns the exact photo/source pair. It does not
 * change the model draft into an approved ecological finding or approve a report. */
export function buildPhotoPointReview(
  input: PhotoPointReviewInput,
  binding: SurveyRoundMediaVersion,
  inspection: DroneImageInspectionRecord | null,
): PhotoPointReview {
  if (
    binding.id !== input.bindingId ||
    binding.projectId !== input.projectId ||
    binding.manifestSha256 !== input.bindingSha256
  )
    throw new Error("Fotopunktets version er ændret. Genåbn gennemgangen.");
  const original = binding.manifest;
  if (
    input.inspectionId !== null &&
    (!inspection ||
      inspection.id !== input.inspectionId ||
      inspection.resultSha256 !== input.inspectionSha256 ||
      inspection.status !== "completed" ||
      inspection.projectId !== input.projectId ||
      inspection.mediaId !== binding.mediaId ||
      inspection.originalSha256 !== original.originalSha256 ||
      inspection.originalValidationSha256 !== original.originalValidationSha256 ||
      inspection.storageObjectId !== original.storage.objectId ||
      inspection.storageObjectVersion !== original.storage.objectVersion ||
      inspection.storageObjectUpdatedAt !== original.storage.objectUpdatedAt ||
      inspection.sourceSnapshotId !== original.baselineId ||
      inspection.sourceSnapshotHash !== original.baselineSha256)
  )
    throw new Error("Billedvurderingen matcher ikke fotopunktets gemte kildeversion.");
  return PhotoPointReviewSchema.parse({
    schema: "freyra.photo-point-review/v1",
    projectId: input.projectId,
    bindingId: binding.id,
    bindingSha256: binding.manifestSha256,
    mediaId: binding.mediaId,
    originalSha256: original.originalSha256,
    baselineId: original.baselineId,
    baselineSha256: original.baselineSha256,
    decision: input.decision,
    note: input.note,
    reviewerName: input.reviewerName,
    inspectionId: input.inspectionId,
    inspectionSha256: input.inspectionSha256,
  });
}
const Row = z
  .object({
    id: Uuid,
    project_id: Uuid,
    binding_id: Uuid,
    reviewed_by: Uuid,
    request_id: Uuid,
    review: PhotoPointReviewSchema,
    review_text: z.string().max(16_384),
    review_sha256: Hash,
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type PhotoPointReviewRecord = {
  id: string;
  projectId: string;
  bindingId: string;
  reviewedBy: string;
  requestId: string;
  review: PhotoPointReview;
  reviewSha256: string;
  createdAt: string;
};
export const PHOTO_POINT_REVIEW_SELECT =
  "id,project_id,binding_id,reviewed_by,request_id,review,review_text,review_sha256,created_at";
export async function photoPointReviewFromRow(
  raw: unknown,
  projectId: string,
  bindingId?: string,
): Promise<PhotoPointReviewRecord> {
  const row = Row.parse(raw);
  if (
    row.project_id !== projectId ||
    row.review.projectId !== projectId ||
    row.binding_id !== row.review.bindingId ||
    (bindingId !== undefined && row.binding_id !== bindingId) ||
    canonicalBaselineJson(row.review) !== row.review_text ||
    (await baselineSha256(row.review)) !== row.review_sha256
  )
    throw new Error("Den gemte faglige vurdering kunne ikke verificeres.");
  return {
    id: row.id,
    projectId,
    bindingId: row.binding_id,
    reviewedBy: row.reviewed_by,
    requestId: row.request_id,
    review: row.review,
    reviewSha256: row.review_sha256,
    createdAt: row.created_at,
  };
}
