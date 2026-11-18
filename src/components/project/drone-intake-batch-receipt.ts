import { z } from "zod";
import type { CanonicalDroneBatch } from "@/components/monitoring/DroneBeforeBatchWizard";
import type { DroneIntakeMode } from "@/services/monitoring/drone-batch-intake";
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const NeutralBatch = z
  .object({
    projectId: Uuid,
    batchId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
    mediaIds: z
      .array(Uuid)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
    receivedCount: z.number().int().min(1).max(200),
  })
  .strict()
  .refine((value) => value.receivedCount >= value.mediaIds.length);
const Batch = NeutralBatch.refine((value) => value.mediaIds.length > 0);
const Receipt = z
  .object({ schema: z.literal("gofreyra.pending-drone-batch/v1"), actorId: Uuid, batch: Batch })
  .strict();
const SeriesReceipt = z
  .object({
    schema: z.literal("gofreyra.pending-drone-batches/v2"),
    actorId: Uuid,
    batches: z
      .array(Batch)
      .refine((items) => new Set(items.map(({ batchId }) => batchId)).size === items.length),
  })
  .strict();
const StoredReceipt = z.discriminatedUnion("schema", [Receipt, SeriesReceipt]);
const NeutralReceipt = SeriesReceipt.extend({
  schema: z.literal("gofreyra.neutral-drone-batches/v1"),
  batches: z
    .array(NeutralBatch)
    .refine((items) => new Set(items.map(({ batchId }) => batchId)).size === items.length),
});
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export function pendingDroneBatchKey(
  actorId: string,
  projectId: string,
  mode: DroneIntakeMode = "before",
) {
  const prefix =
    mode === "neutral" ? "gofreyra.neutral-drone-batch" : "gofreyra.pending-drone-batch";
  return `${prefix}:${Uuid.parse(actorId)}:${Uuid.parse(projectId)}`;
}
/** IDs only. Restoring a receipt never runs AI or persists an inspection. */
export function readPendingDroneBatches(
  storage: Storage,
  actorId: string,
  projectId: string,
  mode: DroneIntakeMode = "before",
): CanonicalDroneBatch[] {
  const text = storage.getItem(pendingDroneBatchKey(actorId, projectId, mode));
  if (text === null) return [];
  const value = (mode === "neutral" ? NeutralReceipt : StoredReceipt).parse(JSON.parse(text));
  const batches = "batch" in value ? [value.batch] : value.batches;
  if (value.actorId !== actorId || batches.some((batch) => batch.projectId !== projectId))
    throw new Error("Den gemte billedserie tilhører en anden bruger eller sag.");
  return batches;
}

export function mergeDroneBatch(batches: CanonicalDroneBatch[], batch: CanonicalDroneBatch) {
  const index = batches.findIndex(
    (item) => item.batchId === batch.batchId && item.projectId === batch.projectId,
  );
  if (index < 0) return [...batches, batch];
  const previous = batches[index];
  const mediaIds = [...new Set([...previous.mediaIds, ...batch.mediaIds])];
  return batches.map((item, position) =>
    position === index
      ? {
          ...batch,
          mediaIds,
          receivedCount: Math.max(previous.receivedCount, batch.receivedCount, mediaIds.length),
        }
      : item,
  );
}
export function savePendingDroneBatch(
  storage: Storage,
  actorId: string,
  batch: CanonicalDroneBatch,
  mode: DroneIntakeMode = "before",
) {
  const schema = mode === "neutral" ? NeutralReceipt : SeriesReceipt;
  const batches = mergeDroneBatch(
    readPendingDroneBatches(storage, actorId, batch.projectId, mode),
    (mode === "neutral" ? NeutralBatch : Batch).parse(batch),
  );
  const receipt = schema.parse({
    schema: schema.shape.schema.value,
    actorId,
    batches,
  });
  const text = JSON.stringify(receipt),
    key = pendingDroneBatchKey(actorId, batch.projectId, mode);
  storage.setItem(key, text);
  if (storage.getItem(key) !== text)
    throw new Error("Billedseriens genoptagelse kunne ikke gemmes i denne browser.");
  return batches;
}
