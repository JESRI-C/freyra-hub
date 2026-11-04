import { z } from "zod";
import { WorkOrderActionIdSchema, WorkOrderScopeSchema } from "./work-order-access";
import { FieldJobTemplateDefinitionSchema, FieldJobValuesSchema } from "./field-job-cards";
import { PhotoCaptureSchema } from "./field-photo-position";
const uuid = z.string().uuid();
export const EvidencePageSchema = WorkOrderScopeSchema.extend({
  afterId: uuid.nullable(),
  pageSize: z.number().int().min(1).max(50),
}).strict();
export const EvidenceSourcesSchema = EvidencePageSchema.extend({
  kind: z.enum(["observation", "photo"]),
}).strict();
export const SaveEvidenceSchema = WorkOrderScopeSchema.extend({
  expectedActorId: uuid,
  evidenceId: uuid,
  expectedVersion: z.number().int().min(0).max(2147483646),
  observationVersionId: uuid,
  uploadId: uuid,
  executionRevisionId: uuid.nullable(),
  state: z.enum(["attached", "withdrawn"]),
  reason: z.string().trim().min(1).max(2000),
  requestId: uuid,
}).strict();
export const EvidenceOriginalInputSchema = WorkOrderScopeSchema.extend({
  id: uuid,
  expectedActorId: uuid,
}).strict();
export const OriginalPinSchema = z.object({
  schema: z.literal("freyra.task-original-pin/v1"),
  uploadId: uuid,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
  objectId: uuid,
  objectVersion: z.string().nullable(),
  objectUpdatedAt: z.string().datetime({ offset: true }),
  storagePath: z.string(),
  capturedAt: z.string().datetime({ offset: true }).nullable(),
  capture: PhotoCaptureSchema,
});
export const EvidenceVersionSchema = z
  .object({
    id: uuid,
    evidence_id: uuid,
    action_id: WorkOrderActionIdSchema,
    organization_id: uuid,
    project_id: uuid,
    version: z.number().int().positive(),
    observation_version_id: uuid,
    upload_id: uuid,
    execution_revision_id: uuid.nullable(),
    state: z.enum(["attached", "withdrawn"]),
    reason: z.string().min(1),
    observation_snapshot: z.object({
      schema: z.literal("freyra.task-observation-pin/v1"),
      id: uuid,
      version: z.number().int().positive(),
      template: FieldJobTemplateDefinitionSchema,
      templateVersionId: uuid.optional(),
      values: FieldJobValuesSchema,
      status: z.enum(["recorded", "needs_review"]),
      recordedAt: z.string().datetime({ offset: true }),
      recordedBy: uuid,
    }),
    original_snapshot: OriginalPinSchema,
    request_id: uuid,
    created_by: uuid,
    created_at: z.string().datetime({ offset: true }),
  })
  .superRefine((v, ctx) => {
    if (
      v.observation_snapshot.id !== v.observation_version_id ||
      v.original_snapshot.uploadId !== v.upload_id ||
      v.original_snapshot.storagePath !== `${v.project_id}/field-uploads/${v.upload_id}/original`
    )
      ctx.addIssue({
        code: "custom",
        message: "Dokumentationens referencer stemmer ikke overens.",
      });
  });
export const EvidenceSourceSchema = z.object({
  id: uuid,
  label: z.string(),
  version: z.number().int().positive().nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});
export type EvidenceVersion = z.infer<typeof EvidenceVersionSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
