import { z } from "zod";
import type { DroneLocalizationResult } from "@/services/geospatial/drone-localization";
import { MAX_DRONE_INSPECTION_ORIGINAL_BYTES } from "@/services/monitoring/drone-image-inspection";
import type { DroneLocalizationPhoto } from "@/services/geospatial/drone-localization";
import type { inspectDroneImage } from "@/lib/drone-image-inspection.functions";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Scope = z
  .object({
    actorId: Uuid,
    projectId: Uuid,
    baselineSnapshotId: Uuid,
    baselineSha256: z.string().regex(/^[0-9a-f]{64}$/),
    batchId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
    mediaIds: z
      .array(Uuid)
      .min(1)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export type DroneIntakeScope = z.infer<typeof Scope>;
const Receipt = z
  .object({
    schema: z.literal("gofreyra.drone-intake-image-requests/v1"),
    scope: Scope,
    requests: z
      .array(z.object({ mediaId: Uuid, requestId: Uuid }).strict())
      .min(1)
      .max(200),
  })
  .strict();
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Inspector = (input: {
  data: {
    projectId: string;
    mediaId: string;
    requestId: string;
    expectedCallerUserId: string;
    baselineSnapshotId: string;
    baselineSha256: string;
  };
}) => ReturnType<typeof inspectDroneImage>;
const locks = new Set<string>();
export function droneIntakeAiPhotos(photos: DroneLocalizationPhoto[]): DroneLocalizationPhoto[] {
  return photos.filter(
    (photo) =>
      Number.isFinite(photo.sizeBytes) &&
      photo.sizeBytes > 0 &&
      photo.sizeBytes <= MAX_DRONE_INSPECTION_ORIGINAL_BYTES,
  );
}
export function droneIntakeReceiptKey(raw: DroneIntakeScope): string {
  const scope = Scope.parse(raw);
  return `gofreyra.drone-intake-image-requests:${scope.actorId}:${scope.projectId}:${scope.batchId}:${scope.baselineSnapshotId}:${scope.baselineSha256}:${scope.mediaIds.join(",")}`;
}
export function readOrCreateDroneIntakeRequests(
  raw: DroneIntakeScope,
  storage: Storage,
  randomUUID: () => string = () => crypto.randomUUID(),
): z.infer<typeof Receipt> {
  const scope = Scope.parse(raw),
    key = droneIntakeReceiptKey(scope),
    saved = storage.getItem(key);
  if (saved !== null) {
    if (new TextEncoder().encode(saved).byteLength > 128_000)
      throw new Error("Den gemte analysereference er for stor.");
    const value = Receipt.parse(JSON.parse(saved));
    if (
      JSON.stringify(value.scope) !== JSON.stringify(scope) ||
      value.requests.length !== scope.mediaIds.length ||
      value.requests.some((request, index) => request.mediaId !== scope.mediaIds[index]) ||
      new Set(value.requests.map((request) => request.requestId)).size !== value.requests.length
    )
      throw new Error(
        "Det gemte analyseforsøg matcher ikke den præcise billedserie. Genåbn sagen.",
      );
    return value;
  }
  const value = Receipt.parse({
    schema: "gofreyra.drone-intake-image-requests/v1",
    scope,
    requests: scope.mediaIds.map((mediaId) => ({ mediaId, requestId: randomUUID() })),
  });
  if (new Set(value.requests.map((request) => request.requestId)).size !== value.requests.length)
    throw new Error("Analysens forsøgsnumre er ikke entydige.");
  const text = JSON.stringify(value);
  storage.setItem(key, text);
  if (storage.getItem(key) !== text)
    throw new Error("Analysens genoptagelse kunne ikke gemmes i denne browser.");
  return value;
}

/** Exactly twelve at most, serial calls, durable IDs and a stop after busy/failure. */
export async function runDroneIntakeImageChunk(
  scope: DroneIntakeScope,
  inspector: Inspector,
  options: {
    storage: Storage;
    startIndex: number;
    isCurrent(): boolean;
    onCompleted?(mediaId: string, nextIndex: number): void;
    randomUUID?(): string;
  },
): Promise<{ nextIndex: number; busyMediaId: string | null }> {
  const key = droneIntakeReceiptKey(scope);
  if (locks.has(key)) throw new Error("Billedserien behandles allerede.");
  if (
    !Number.isInteger(options.startIndex) ||
    options.startIndex < 0 ||
    options.startIndex >= scope.mediaIds.length
  )
    throw new Error("Billedseriens næste foto er ugyldigt.");
  const current = () => {
    if (!options.isCurrent()) throw new Error("Bruger, sag eller billedserie er ændret.");
  };
  current();
  locks.add(key);
  try {
    const receipt = readOrCreateDroneIntakeRequests(scope, options.storage, options.randomUUID);
    current();
    const end = Math.min(options.startIndex + 12, receipt.requests.length);
    for (let index = options.startIndex; index < end; index++) {
      current();
      const request = receipt.requests[index];
      const response = await inspector({
        data: {
          projectId: scope.projectId,
          mediaId: request.mediaId,
          requestId: request.requestId,
          expectedCallerUserId: scope.actorId,
          baselineSnapshotId: scope.baselineSnapshotId,
          baselineSha256: scope.baselineSha256,
        },
      });
      current();
      if (
        response.inspection.projectId !== scope.projectId ||
        response.inspection.mediaId !== request.mediaId ||
        response.inspection.sourceSnapshotId !== scope.baselineSnapshotId ||
        response.inspection.sourceSnapshotHash !== scope.baselineSha256
      )
        throw new Error("Billedanalysen matcher ikke denne sag og original.");
      if (response.status === "busy") return { nextIndex: index, busyMediaId: request.mediaId };
      if (
        response.status !== "completed" ||
        response.inspection.status !== "completed" ||
        !response.inspection.result
      )
        throw new Error("Billedanalysens resultat er ikke bekræftet.");
      options.onCompleted?.(request.mediaId, index + 1);
    }
    return { nextIndex: end, busyMediaId: null };
  } finally {
    locks.delete(key);
  }
}

export function droneIntakeRecordingDate(result: DroneLocalizationResult): string | null {
  const days = new Set(
    result.photos.flatMap((photo) => {
      if (!photo.capturedAtUtc || !Number.isFinite(new Date(photo.capturedAtUtc).getTime()))
        return [];
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: "Europe/Copenhagen",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(photo.capturedAtUtc));
      return [
        `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}-${parts.find((part) => part.type === "day")!.value}`,
      ];
    }),
  );
  return days.size === 1 ? [...days][0] : null;
}
export function droneIntakeBaselinePeriod(recordingDate: string): {
  dateFrom: string;
  dateTo: string;
} {
  const date = new Date(`${recordingDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(recordingDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== recordingDate
  )
    throw new Error("Bekræft en gyldig optagedato.");
  date.setUTCDate(date.getUTCDate() - 29);
  return { dateFrom: date.toISOString().slice(0, 10), dateTo: recordingDate };
}
