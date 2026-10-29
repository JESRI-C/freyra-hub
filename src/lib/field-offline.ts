import { z } from "zod";
import { FieldPhotoUuid, FieldPhotoUploadPayload } from "./field-photo-upload";
import {
  FieldJobTemplateVersionSchema,
  FieldJobVersionSchema,
  FieldJobValuesSchema,
} from "./field-job-cards";

export const OFFLINE_DEVICE_KEY = "freyra-field-device-v1";
export const FIELD_OFFLINE_DB = "freyra-field-offline-v1";
export const FIELD_OFFLINE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const FIELD_OFFLINE_LEASE_MS = 120_000;

export const FieldWorkPackSchema = z.object({
  actorId: FieldPhotoUuid,
  projectId: FieldPhotoUuid,
  organizationId: FieldPhotoUuid,
  projectName: z.string().min(1),
  savedAt: z.number().int().positive(),
  jobs: z.array(
    z.object({
      actionId: FieldPhotoUuid,
      title: z.string(),
      template: FieldJobTemplateVersionSchema.nullable(),
      latest: FieldJobVersionSchema.nullable(),
    }),
  ),
});
export type FieldWorkPack = z.infer<typeof FieldWorkPackSchema>;
export const OfflineJobDraftSchema = z
  .object({
    organizationId: FieldPhotoUuid,
    actionId: FieldPhotoUuid,
    templateVersionId: FieldPhotoUuid,
    expectedVersion: z.number().int().nonnegative(),
    values: FieldJobValuesSchema,
    status: z.enum(["draft", "recorded", "needs_review"]),
    correctionReason: z.string().trim().min(1).max(2000),
  })
  .strict();
export type OfflineJobDraft = z.infer<typeof OfflineJobDraftSchema>;
const base = {
  id: FieldPhotoUuid,
  actorId: FieldPhotoUuid,
  projectId: FieldPhotoUuid,
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  state: z.enum(["queued", "sending", "retry", "blocked", "conflict", "complete"]),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.number().int().nonnegative(),
  leaseId: FieldPhotoUuid.nullable(),
  leaseUntil: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  dependsOn: FieldPhotoUuid.nullable(),
};
export const OfflineItemSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("photo"),
    payload: FieldPhotoUploadPayload,
    fileLastModified: z.number(),
    originalBytes: z.number().int().positive(),
    receipt: z.unknown().nullable(),
  }),
  z.object({
    ...base,
    kind: z.literal("job"),
    payload: OfflineJobDraftSchema,
    template: FieldJobTemplateVersionSchema,
    originalBytes: z.literal(0),
    receipt: z.unknown().nullable(),
  }),
]);
export type OfflineItem = z.infer<typeof OfflineItemSchema>;
export type OfflinePhotoItem = Extract<OfflineItem, { kind: "photo" }>;
export function sameOfflineOwner(item: OfflineItem, actorId: string, projectId?: string) {
  return item.actorId === actorId && (projectId === undefined || item.projectId === projectId);
}
export function offlineRetryDelay(attempts: number) {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000);
}
export function sameOfflineValue(left: unknown, right: unknown): boolean {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return value;
  }
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
/** This is a local device unlock, never proof of server access. Explicit logout removes it. */
export function readOfflineActor(storage?: Pick<Storage, "getItem">): string | null {
  let value: string | null;
  try {
    value = (storage ?? localStorage).getItem(OFFLINE_DEVICE_KEY);
  } catch {
    return null;
  }
  const parsed = FieldPhotoUuid.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function unlockOfflineActor(
  actorId: string,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  storage.setItem(OFFLINE_DEVICE_KEY, FieldPhotoUuid.parse(actorId));
}
export function lockOfflineActor(storage?: Pick<Storage, "removeItem">) {
  try {
    (storage ?? localStorage).removeItem(OFFLINE_DEVICE_KEY);
  } catch {
    /* No usable local unlock exists. */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("freyra-field-locked"));
}
