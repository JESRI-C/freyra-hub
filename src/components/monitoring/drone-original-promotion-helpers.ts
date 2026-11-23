import type {
  DroneOriginalPromotion,
  DroneOriginalPromotionInput,
} from "@/services/monitoring/drone-original-promotion-types";
import type { DroneOriginalValidation } from "@/services/monitoring/drone-original-validation.server";
import type { DroneOriginalPromotionOriginSummary } from "@/services/monitoring/drone-original-promotion-service";
import {
  checkOriginalsSequentially,
  originalCheckAvailability,
  storedOriginalCheckState,
  type OriginalCheckState,
  type OriginalCheckUpload,
} from "./drone-original-check-helpers";

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface DroneOriginalPromotionState {
  status: "awaiting_original" | "queued" | "promoting" | "canonical" | "failed";
  mediaId?: string;
  originId?: string;
  deduplicated?: boolean;
  error?: string;
}
export interface DroneOriginalProcessingCandidate {
  key: string;
  upload: OriginalCheckUpload;
  originalCheck?: OriginalCheckState;
  promotion?: DroneOriginalPromotionState;
}

/** The upload UUID is an idempotency identifier, not a credential. The writer
 * scopes its receipt by project and verified actor. No browser persistence is
 * needed to retain this same identifier after a reload or an uncertain retry. */
export function droneOriginalPromotionRequestId(projectId: string, uploadId: string): string {
  if (!Uuid.test(projectId) || !Uuid.test(uploadId))
    throw new Error("Originaltilknytningen kræver en gyldig sag og uploadreference.");
  return uploadId.toLowerCase();
}

export function isDroneOriginalPromotable(state: OriginalCheckState | null | undefined): boolean {
  return state?.status === "raw_original_validated" || state?.status === "review_required";
}

export function droneOriginalPromotionStatusLabel(state: DroneOriginalPromotionState): string {
  switch (state.status) {
    case "awaiting_original":
      return "Afventer gemt rå originalkontrol";
    case "queued":
      return "Original kontrolleret · tilknytning i kø";
    case "promoting":
      return "Tilknytter råoriginal";
    case "canonical":
      return state.deduplicated
        ? "Dublet tilknyttet · samme kanoniske original"
        : "Råoriginal tilknyttet · afventer faglig gennemgang";
    case "failed":
      return "Original kontrolleret · tilknytning fejlede";
  }
}

export function promotionStateFromOrigin(
  origin: DroneOriginalPromotionOriginSummary,
): DroneOriginalPromotionState {
  return {
    status: "canonical",
    mediaId: origin.mediaId,
    originId: origin.originId,
    deduplicated: origin.deduplicated,
  };
}

// Both the batch drawer and reload actions use this FIFO. H08 keeps its existing
// shared validation queue inside it; a failed promotion settles only that file.
let processingTail: Promise<void> = Promise.resolve();
function enqueueProcessing(operation: () => Promise<void>): Promise<void> {
  const next = processingTail.then(operation);
  processingTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function processDroneOriginalsSequentially(
  candidates: readonly DroneOriginalProcessingCandidate[],
  projectId: string,
  operations: {
    validate(input: { projectId: string; uploadId: string }): Promise<DroneOriginalValidation>;
    promote(input: DroneOriginalPromotionInput): Promise<DroneOriginalPromotion>;
  },
  updates: {
    onOriginalCheck(key: string, state: OriginalCheckState): void;
    onPromotion(key: string, state: DroneOriginalPromotionState): void;
  },
): Promise<void> {
  for (const candidate of candidates) {
    await enqueueProcessing(async () => {
      const admission = originalCheckAvailability(candidate.upload, projectId);
      if (!admission.eligible) {
        updates.onOriginalCheck(candidate.key, {
          status: "unprocessed",
          error: admission.reason ?? undefined,
        });
        updates.onPromotion(candidate.key, { status: "awaiting_original" });
        return;
      }
      let originalCheck = candidate.originalCheck ?? storedOriginalCheckState(candidate.upload);
      if (!originalCheck || ["queued", "validating", "failed"].includes(originalCheck.status)) {
        await checkOriginalsSequentially(
          [{ key: candidate.key, upload: candidate.upload }],
          projectId,
          operations.validate,
          (key, next) => {
            originalCheck = next;
            updates.onOriginalCheck(key, next);
          },
        );
      } else {
        updates.onOriginalCheck(candidate.key, originalCheck);
      }
      if (!isDroneOriginalPromotable(originalCheck)) {
        updates.onPromotion(candidate.key, { status: "awaiting_original" });
        return;
      }
      if (candidate.promotion?.status === "canonical") {
        updates.onPromotion(candidate.key, candidate.promotion);
        return;
      }
      updates.onPromotion(candidate.key, { status: "queued" });
      try {
        const requestId = droneOriginalPromotionRequestId(projectId, candidate.upload.id);
        updates.onPromotion(candidate.key, { status: "promoting" });
        const result = await operations.promote({
          projectId,
          uploadId: candidate.upload.id,
          requestId,
        });
        if (
          result.schema !== "gofreyra.drone-original-promotion/v1" ||
          result.projectId !== projectId ||
          result.uploadId !== candidate.upload.id ||
          result.requestId !== requestId ||
          !Uuid.test(result.mediaId) ||
          !Uuid.test(result.originId) ||
          result.originalSha256 !== originalCheck?.sha256 ||
          result.pixelDecoded !== false ||
          result.georeferenced !== false ||
          result.reportEligible !== false
        )
          throw new Error("Originaltilknytningens svar matcher ikke den modtagne fil.");
        updates.onPromotion(candidate.key, {
          status: "canonical",
          mediaId: result.mediaId,
          originId: result.originId,
          deduplicated: result.deduplicated,
        });
      } catch {
        updates.onPromotion(candidate.key, {
          status: "failed",
          error:
            "Tilknytningen kunne ikke gemmes. Originalen og serverkontrollen er stadig modtaget. Kontrollér adgang, og prøv tilknytningen igen uden ny upload.",
        });
      }
    });
  }
}
