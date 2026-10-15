import { z } from "zod";
import type { CanonicalDroneBatch } from "@/components/monitoring/DroneBeforeBatchWizard";
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Batch = z
  .object({
    projectId: Uuid,
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
    receivedCount: z.number().int().min(1).max(200),
  })
  .strict()
  .refine((value) => value.receivedCount >= value.mediaIds.length);
const Receipt = z
  .object({ schema: z.literal("gofreyra.pending-drone-batch/v1"), actorId: Uuid, batch: Batch })
  .strict();
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export function pendingDroneBatchKey(actorId: string, projectId: string) {
  return `gofreyra.pending-drone-batch:${Uuid.parse(actorId)}:${Uuid.parse(projectId)}`;
}
/** IDs only. Restoring a receipt never runs AI or persists an inspection. */
export function readPendingDroneBatch(
  storage: Storage,
  actorId: string,
  projectId: string,
): CanonicalDroneBatch | undefined {
  const text = storage.getItem(pendingDroneBatchKey(actorId, projectId));
  if (text === null) return undefined;
  if (text.length > 20_000)
    throw new Error("Den gemte billedserie er ugyldig. Åbn billederne fra sagen.");
  const value = Receipt.parse(JSON.parse(text));
  if (value.actorId !== actorId || value.batch.projectId !== projectId)
    throw new Error("Den gemte billedserie tilhører en anden bruger eller sag.");
  return value.batch;
}
export function savePendingDroneBatch(
  storage: Storage,
  actorId: string,
  batch: CanonicalDroneBatch,
) {
  const receipt = Receipt.parse({ schema: "gofreyra.pending-drone-batch/v1", actorId, batch });
  const text = JSON.stringify(receipt),
    key = pendingDroneBatchKey(actorId, batch.projectId);
  storage.setItem(key, text);
  if (storage.getItem(key) !== text)
    throw new Error("Billedseriens genoptagelse kunne ikke gemmes i denne browser.");
}
