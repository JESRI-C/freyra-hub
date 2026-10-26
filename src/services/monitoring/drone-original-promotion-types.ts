export const DRONE_ORIGINAL_PROMOTION_SCHEMA = "gofreyra.drone-original-promotion/v1" as const;

export interface DroneOriginalPromotionInput {
  projectId: string;
  uploadId: string;
  requestId: string;
}

/** A canonical raw file is still pending geographic and professional review. */
export interface DroneOriginalPromotion {
  schema: typeof DRONE_ORIGINAL_PROMOTION_SCHEMA;
  projectId: string;
  mediaId: string;
  uploadId: string;
  originId: string;
  requestId: string;
  receiptId: string;
  originalRole: "drone_original";
  originalSha256: string;
  originalValidationSha256: string;
  originalValidationStatus: "raw_original_validated" | "review_required";
  deduplicated: boolean;
  promotedAt: string;
  storage: {
    bucket: "monitoring-uploads";
    path: string;
    objectId: string;
    objectVersion: string | null;
    objectUpdatedAt: string;
  };
  pixelDecoded: false;
  georeferenced: false;
  reportEligible: false;
}
