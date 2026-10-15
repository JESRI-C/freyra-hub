import type { SurveyRoundMediaCandidate } from "@/lib/survey-round-media.functions";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";
import type { DroneLocalizationPhoto } from "@/services/geospatial/drone-localization";
import {
  createInspectionPhotoBatch,
  inspectionPhotoBatchKey,
  readInspectionPhotoBatch,
  runInspectionPhotoBatch,
  writeInspectionPhotoBatch,
  type InspectionPhotoBatchApi,
  type InspectionPhotoBatchStorage,
} from "./inspection-photo-batch";

const active = new Set<string>();
/** The confirmed subset is fixed to the new round; server writes/readbacks verify original pins. */
export async function bindConfirmedDroneIntakePhotos(
  input: { actorId: string; round: SurveyRoundVersion; photos: DroneLocalizationPhoto[] },
  api: InspectionPhotoBatchApi,
  options: {
    storage: InspectionPhotoBatchStorage;
    isCurrent(): boolean;
    onProgress?(confirmed: number, total: number): void;
    randomUUID?(): string;
  },
) {
  const scope = { actorId: input.actorId, round: input.round },
    key = inspectionPhotoBatchKey(scope);
  const assertCurrent = () => {
    if (!options.isCurrent())
      throw new Error("Bruger, sag eller den bekræftede billedserie er ændret.");
  };
  if (active.has(key)) throw new Error("Billedtilknytningen er allerede i gang.");
  if (
    !input.photos.length ||
    input.photos.length > 200 ||
    new Set(input.photos.map((photo) => photo.mediaId)).size !== input.photos.length
  )
    throw new Error("Bekræft mellem 1 og 200 forskellige fotos.");
  assertCurrent();
  active.add(key);
  try {
    const access = await api.getAccess({ data: { projectId: input.round.projectId } });
    assertCurrent();
    if (
      access.userId !== input.actorId ||
      access.projectId !== input.round.projectId ||
      !access.canAssign
    )
      throw new Error("Den aktuelle bruger kan ikke tilknytte billeder til sagen.");
    // These bounded DTOs came from the exact original replay, not a UUID-sorted
    // project catalogue. Every server write and readback still verifies provenance.
    const selected: SurveyRoundMediaCandidate[] = input.photos.map((photo) => ({
      mediaId: photo.mediaId,
      fileName: photo.fileName,
      originalSha256: photo.originalSha256,
      originalValidationSha256: photo.originalValidationSha256,
      originalValidationStatus: photo.originalValidationStatus,
      sizeBytes: photo.sizeBytes,
    }));
    const previous = options.storage.getItem(key);
    let receipt = readInspectionPhotoBatch(previous, scope);
    if (!receipt) {
      receipt = createInspectionPhotoBatch(scope, selected, options.randomUUID);
      writeInspectionPhotoBatch(options.storage, scope, receipt, previous);
    }
    if (
      receipt.entries.length !== selected.length ||
      receipt.entries.some(
        (entry) =>
          !selected.some(
            (candidate) =>
              candidate.mediaId === entry.receipt.input.mediaId &&
              candidate.originalSha256 === entry.receipt.originalSha256 &&
              candidate.originalValidationSha256 === entry.receipt.originalValidationSha256,
          ),
      )
    )
      throw new Error(
        "Runden har allerede et andet fastholdt billedvalg. Genåbn rundens billedtilknytning; spørgsmål og originaler overskrives ikke.",
      );
    assertCurrent();
    return await runInspectionPhotoBatch({
      scope,
      storage: options.storage,
      api,
      expectedBatch: receipt,
      assertCurrent,
      onProgress: (batch) => {
        assertCurrent();
        options.onProgress?.(
          batch.entries.filter((entry) => entry.status === "confirmed").length,
          batch.entries.length,
        );
      },
    });
  } finally {
    active.delete(key);
  }
}
