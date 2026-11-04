import { z } from "zod";

export type ObservationDraftJson =
  | null
  | boolean
  | number
  | string
  | ObservationDraftJson[]
  | { [key: string]: ObservationDraftJson };

const json: z.ZodType<ObservationDraftJson> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);
const uuid = z.string().uuid();
const inputUuid = uuid.transform((value) => value.toLowerCase());
const sourceHash = z.string().regex(/^[0-9a-f]{64}$/);
// PostgreSQL serializes special numeric values such as NaN as strings. Keep the
// source value; its presence does not establish usable coordinates or quality.
const sourceNumber = z.union([z.number().finite(), z.string()]).nullable();
const sourceTime = z.string().nullable();

export const ObservationDraftSnapshotSchema = z
  .object({
    id: uuid,
    project_id: uuid,
    zone_id: uuid.nullable(),
    observation_type: z.string(),
    observed_at: sourceTime,
    observer_id: uuid.nullable(),
    species_name: z.string().nullable(),
    species_confidence: sourceNumber,
    count_value: z.number().finite().nullable(),
    latitude: sourceNumber,
    longitude: sourceNumber,
    accuracy_m: sourceNumber,
    notes: z.string().nullable(),
    visibility: z.string(),
    status: z.string(),
    metadata: json,
    created_at: sourceTime,
    updated_at: sourceTime,
  })
  .catchall(json);
export type ObservationDraftSnapshot = z.infer<typeof ObservationDraftSnapshotSchema>;

/** Stored observation_media metadata only, never proof of original file bytes. */
export const ObservationDraftMediaReferenceSchema = z
  .object({
    id: uuid,
    observation_id: uuid,
    media_type: z.string(),
    storage_path: z.string(),
    mime_type: z.string().nullable(),
    file_size_bytes: sourceNumber,
    width: sourceNumber,
    height: sourceNumber,
    exif_data: json,
    ai_suggestions: json,
    uploaded_by: uuid.nullable(),
    created_at: sourceTime,
  })
  .catchall(json);
export type ObservationDraftMediaReference = z.infer<typeof ObservationDraftMediaReferenceSchema>;

export const ObservationDraftSourceSchema = z
  .object({
    observation_id: uuid,
    source_hash: sourceHash,
    snapshot: ObservationDraftSnapshotSchema,
    media_refs: z.array(ObservationDraftMediaReferenceSchema),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.snapshot.id !== source.observation_id)
      ctx.addIssue({ code: "custom", message: "Observationens kildeidentitet stemmer ikke." });
    let previous: string | null = null;
    for (const media of source.media_refs) {
      if (
        media.observation_id !== source.observation_id ||
        (previous !== null && media.id <= previous)
      )
        ctx.addIssue({ code: "custom", message: "Mediehenvisningerne tilhører ikke samme kilde." });
      previous = media.id;
    }
  });
export type ObservationDraftSource = z.infer<typeof ObservationDraftSourceSchema>;
export type WorkOrderObservationSource = ObservationDraftSource;

const inputScope = {
  expectedActorId: inputUuid,
  organizationId: inputUuid,
  projectId: inputUuid,
};
const receiptScope = { organization_id: uuid, project_id: uuid, user_id: uuid };

export const ListWorkOrderObservationSourcesInputSchema = z
  .object({
    ...inputScope,
    cursor: inputUuid.nullable().default(null),
    pageSize: z.number().int().min(1).max(50).default(30),
    search: z.string().trim().max(200).default(""),
  })
  .strict();
export type ListWorkOrderObservationSourcesInput = z.infer<
  typeof ListWorkOrderObservationSourcesInputSchema
>;

export const WorkOrderObservationSourceReferenceSchema = z
  .object({
    observationId: inputUuid,
    sourceHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/i)
      .transform((value) => value.toLowerCase()),
  })
  .strict();
export type WorkOrderObservationSourceReference = z.infer<
  typeof WorkOrderObservationSourceReferenceSchema
>;

export const CreateWorkOrderObservationDraftInputSchema = z
  .object({
    ...inputScope,
    actionId: inputUuid,
    requestId: inputUuid,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10000),
    sources: z.array(WorkOrderObservationSourceReferenceSchema).min(1).max(20),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (new Set(input.sources.map((source) => source.observationId)).size !== input.sources.length)
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Vælg hver observation én gang.",
      });
  });
export type CreateWorkOrderObservationDraftInput = z.infer<
  typeof CreateWorkOrderObservationDraftInputSchema
>;

export const GetWorkOrderObservationDraftInputSchema = z
  .object({ ...inputScope, actionId: inputUuid })
  .strict();
export type GetWorkOrderObservationDraftInput = z.infer<
  typeof GetWorkOrderObservationDraftInputSchema
>;

export const ObservationSourceReceiptSchema = z
  .object({ ...receiptScope, items: z.array(ObservationDraftSourceSchema).max(51) })
  .strict();
export type ObservationSourcePage = {
  items: ObservationDraftSource[];
  nextCursor: string | null;
};
export type WorkOrderObservationSourcePage = ObservationSourcePage;

/** The preserved creation origin, not the work order's current lifecycle. */
export const WorkOrderObservationOriginSchema = z
  .object({
    ...receiptScope,
    action_id: uuid,
    request_id: uuid,
    created_by: uuid,
    created_at: z.string().datetime({ offset: true }),
    title: z.string().min(1).max(200),
    description: z.string().max(10000),
    status: z.literal("draft"),
    sources: z.array(ObservationDraftSourceSchema).min(1).max(20),
  })
  .strict()
  .superRefine((origin, ctx) => {
    let previous: string | null = null;
    for (const source of origin.sources) {
      if (previous !== null && source.observation_id <= previous)
        ctx.addIssue({ code: "custom", message: "Kilderne skal være entydige og ordnede." });
      previous = source.observation_id;
    }
  });
export type WorkOrderObservationOrigin = z.infer<typeof WorkOrderObservationOriginSchema>;
export type WorkOrderObservationDraft = WorkOrderObservationOrigin;

export const GetWorkOrderObservationDraftReceiptSchema = z
  .object({ ...receiptScope, action_id: uuid, origin: WorkOrderObservationOriginSchema.nullable() })
  .strict();
