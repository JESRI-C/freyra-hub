import { z } from "zod";
import { FieldPhotoUuid, FieldPhotoUploadPayload } from "./field-photo-upload";
import { WorkOrderActionIdSchema } from "./work-order-access";
import { WorkOrderPlanSchema } from "./work-order-plan";
import {
  FieldJobTemplateVersionSchema,
  FieldJobVersionSchema,
  FieldJobValuesSchema,
} from "./field-job-cards";

export const OFFLINE_DEVICE_KEY = "freyra-field-device-v1";
export const FIELD_OFFLINE_DB = "freyra-field-offline-v1";
export const FIELD_OFFLINE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const FIELD_OFFLINE_LEASE_MS = 120_000;
const actionId = WorkOrderActionIdSchema.transform((value) => value.toLowerCase());

export const FieldWorkPackSchema = z
  .object({
    actorId: FieldPhotoUuid,
    projectId: FieldPhotoUuid,
    organizationId: FieldPhotoUuid,
    projectName: z.string().min(1),
    savedAt: z.number().int().positive(),
    jobs: z.array(
      z.object({
        actionId,
        title: z.string(),
        template: FieldJobTemplateVersionSchema.nullable(),
        latest: FieldJobVersionSchema.nullable(),
        plan: z
          .object({
            id: FieldPhotoUuid,
            version: z.number().int().positive(),
            plan: WorkOrderPlanSchema,
          })
          .optional(),
        registrations: z.array(FieldJobVersionSchema).max(11).optional(),
        requirements: z
          .object({
            planVersionId: FieldPhotoUuid,
            planVersion: z.number().int().positive(),
            cards: z.array(FieldJobTemplateVersionSchema).min(1).max(10),
            canRecord: z.boolean(),
          })
          .optional(),
      }),
    ),
  })
  .superRefine((pack, ctx) => {
    const fail = () =>
      ctx.addIssue({
        code: "custom",
        message: "Opgavepakkens skabeloner og registreringer skal tilhøre samme sag og opgave.",
      });
    if (new Set(pack.jobs.map((job) => job.actionId)).size !== pack.jobs.length) fail();
    for (const job of pack.jobs) {
      if (
        job.plan &&
        job.requirements &&
        (job.plan.id !== job.requirements.planVersionId ||
          job.plan.version !== job.requirements.planVersion)
      )
        fail();
      const templates = [
        ...(job.template ? [job.template] : []),
        ...(job.requirements?.cards ?? []),
      ];
      if (
        templates.some(
          (template) =>
            template.project_id !== pack.projectId ||
            template.organization_id !== pack.organizationId,
        )
      )
        fail();
      if (
        job.requirements &&
        new Set(job.requirements.cards.map((card) => card.template_id)).size !==
          job.requirements.cards.length
      )
        fail();
      for (const row of [...(job.latest ? [job.latest] : []), ...(job.registrations ?? [])]) {
        if (
          row.project_id !== pack.projectId ||
          row.organization_id !== pack.organizationId ||
          row.action_id !== job.actionId ||
          !templates.some((template) => template.id === row.template_version_id)
        )
          fail();
      }
      if (job.latest && job.latest.template_version_id !== job.template?.id) fail();
    }
  });
export type FieldWorkPack = z.infer<typeof FieldWorkPackSchema>;
export const OfflineJobDraftSchema = z
  .object({
    organizationId: FieldPhotoUuid,
    actionId,
    templateVersionId: FieldPhotoUuid,
    requiredPlanVersionId: FieldPhotoUuid.optional(),
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
    supersedesId: FieldPhotoUuid.optional(),
    supersededBy: FieldPhotoUuid.optional(),
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
