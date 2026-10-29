import { z } from "zod";
import { CalendarDate } from "./action-execution";
const uuid = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
export const WorkOrderInstantSchema = z
  .string()
  .datetime({ offset: true })
  .regex(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);
/** Preserve PostgreSQL microseconds when comparing keyset cursors. */
export function workOrderInstantKey(value: string): bigint {
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
  const whole = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, "");
  return BigInt(Date.parse(whole)) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export const workOrderStatusLabels = {
  draft: "Kladde",
  planned: "Planlagt",
  assigned: "Tildelt",
  started: "Påbegyndt",
  performed: "Udført",
  submitted: "Afleveret",
  approved: "Godkendt",
  returned: "Returneret",
  reopened: "Genåbnet",
  cancelled: "Annulleret",
} as const;
export const WorkOrderStatusSchema = z.enum([
  "draft",
  "planned",
  "assigned",
  "started",
  "performed",
  "submitted",
  "approved",
  "returned",
  "reopened",
  "cancelled",
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;
const editableStatus = z.enum([
  "draft",
  "planned",
  "assigned",
  "started",
  "performed",
  "cancelled",
]);
export const lifecycleGapLabels = {
  plan_missing: "Planen er ikke gemt",
  responsible_unknown: "Planens ansvarlige er uafklaret",
  responsible_unavailable: "Planens ansvarlige er ikke længere medlem",
  profile_unknown: "Metodeprofilen er uafklaret",
  instructions_missing: "Planen mangler instruktion",
  execution_missing: "Faktisk udførelse er ikke gemt",
  execution_not_performed: "Registreringen angiver endnu ikke udført arbejde",
  actual_date_unknown: "Faktisk dato mangler",
  actual_method_unknown: "Faktisk metode mangler",
  actual_coverage_unknown: "Faktisk dækning mangler",
  execution_context_changed: "Udførelsen skal bekræftes på den aktuelle plan og tildeling",
} as const;
const gap = z.enum(
  Object.keys(lifecycleGapLabels) as [
    keyof typeof lifecycleGapLabels,
    ...(keyof typeof lifecycleGapLabels)[],
  ],
);
const scope = z
  .object({ actionId: uuid, organizationId: uuid, projectId: uuid, expectedActorId: uuid })
  .strict();
const references = {
  planVersionId: uuid.nullable(),
  assignmentVersionId: uuid.nullable(),
  executionRevisionId: uuid.nullable(),
};
export const LifecycleRequestSchema = z
  .object({
    operation: z.enum(["transition", "confirm", "block", "unblock"]),
    targetStatus: editableStatus.nullable(),
    ...references,
    reason: z.string().trim().max(2000).default(""),
    startedAt: WorkOrderInstantSchema.nullable().default(null),
    startedSource: z.string().trim().min(1).max(2000).nullable().default(null),
    blockOwnerId: uuid.nullable().default(null),
    blockReason: z.string().trim().min(1).max(2000).nullable().default(null),
    blockNextAction: z.string().trim().min(1).max(2000).nullable().default(null),
    blockDueDate: CalendarDate.nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if ((v.operation === "transition" || v.operation === "confirm") !== (v.targetStatus !== null))
      issue("Vælg status ved en statusændring.");
    if (v.operation === "confirm" && v.targetStatus === "cancelled")
      issue("En annulleret opgave kan ikke bekræftes som aktiv igen.");
    const starts = v.operation === "transition" && v.targetStatus === "started";
    if (
      starts ? !v.startedAt || !v.startedSource : v.startedAt !== null || v.startedSource !== null
    )
      issue("Faktisk start kræver tidspunkt med tidszone og kilde i startregistreringen.");
    if (
      v.operation === "block"
        ? !v.blockOwnerId || !v.blockReason || !v.blockNextAction
        : v.blockOwnerId !== null ||
          v.blockReason !== null ||
          v.blockNextAction !== null ||
          v.blockDueDate !== null
    )
      issue("En blokering kræver årsag, ansvarlig og næste handling.");
    if (
      (v.operation === "confirm" || v.operation === "unblock" || v.targetStatus === "cancelled") &&
      !v.reason
    )
      issue("Begrund rettelsen, ophævelsen eller annulleringen.");
  });
export type LifecycleRequest = z.infer<typeof LifecycleRequestSchema>;
export const MutateWorkOrderLifecycleSchema = scope
  .extend({
    expectedVersion: z.number().int().min(0).max(2147483646),
    values: LifecycleRequestSchema,
    requestId: uuid,
  })
  .strict();
const rowIdentity = {
  id: uuid,
  action_id: uuid,
  organization_id: uuid,
  project_id: uuid,
  version: z.number().int().positive(),
  request_id: uuid,
  created_by: uuid,
  created_at: WorkOrderInstantSchema,
};
const rowContext = {
  plan_version_id: uuid.nullable(),
  assignment_version_id: uuid.nullable(),
  execution_revision_id: uuid.nullable(),
};
export const WorkOrderLifecycleSchema = z
  .object({
    ...rowIdentity,
    ...rowContext,
    operation: z.enum(["transition", "confirm", "block", "unblock"]),
    status: WorkOrderStatusSchema,
    started_at: WorkOrderInstantSchema.nullable(),
    started_source: z.string().trim().min(1).max(2000).nullable(),
    started_by_id: uuid.nullable(),
    blocked: z.boolean(),
    block_reason: z.string().trim().min(1).max(2000).nullable(),
    block_owner_id: uuid.nullable(),
    block_next_action: z.string().trim().min(1).max(2000).nullable(),
    block_due_date: CalendarDate.nullable(),
    reason: z.string().trim().max(2000),
    request_values: LifecycleRequestSchema,
  })
  .superRefine((v, ctx) => {
    const r = v.request_values;
    if (
      v.operation !== r.operation ||
      v.reason !== r.reason ||
      v.plan_version_id !== r.planVersionId ||
      v.assignment_version_id !== r.assignmentVersionId ||
      v.execution_revision_id !== r.executionRevisionId ||
      (r.targetStatus !== null && r.targetStatus !== v.status)
    )
      ctx.addIssue({ code: "custom", message: "Statuskvitteringens grundlag stemmer ikke." });
    if (
      (v.started_at === null) !== (v.started_source === null) ||
      (v.started_at === null) !== (v.started_by_id === null)
    )
      ctx.addIssue({ code: "custom", message: "Startregistreringen er ufuldstændig." });
    if (
      v.blocked
        ? !v.block_reason || !v.block_owner_id || !v.block_next_action
        : v.block_reason !== null ||
          v.block_owner_id !== null ||
          v.block_next_action !== null ||
          v.block_due_date !== null
    )
      ctx.addIssue({ code: "custom", message: "Blokeringens oplysninger stemmer ikke." });
    if (
      r.operation === "transition" &&
      r.targetStatus === "started" &&
      (!v.started_at ||
        !r.startedAt ||
        !WorkOrderInstantSchema.safeParse(v.started_at).success ||
        !WorkOrderInstantSchema.safeParse(r.startedAt).success ||
        workOrderInstantKey(v.started_at) !== workOrderInstantKey(r.startedAt) ||
        v.started_source !== r.startedSource ||
        v.started_by_id !== v.created_by)
    )
      ctx.addIssue({
        code: "custom",
        message: "Starten er ikke bekræftet af den registrerede aktør.",
      });
    if (
      r.operation === "block" &&
      (!v.blocked ||
        v.block_reason !== r.blockReason ||
        v.block_owner_id !== r.blockOwnerId ||
        v.block_next_action !== r.blockNextAction ||
        v.block_due_date !== r.blockDueDate)
    )
      ctx.addIssue({ code: "custom", message: "Blokeringskvitteringen stemmer ikke." });
    if (r.operation === "unblock" && v.blocked)
      ctx.addIssue({ code: "custom", message: "Blokeringen er ikke ophævet." });
  });
export type WorkOrderLifecycle = z.infer<typeof WorkOrderLifecycleSchema>;
export const WorkOrderLifecycleBasisSchema = z
  .object({
    ...references,
    planVersion: z.number().int().positive().nullable(),
    assignmentVersion: z.number().int().positive().nullable(),
    executionVersion: z.number().int().positive().nullable(),
    planGaps: z.array(gap).max(10),
    assignmentValid: z.boolean(),
    executionGaps: z.array(gap).max(10),
    documentationGaps: z.array(z.string().max(120)).max(30),
    unknownPlannedDate: z.boolean(),
    actualDate: CalendarDate.nullable(),
    actualMethod: z.string().max(2000).nullable(),
    actualCoverage: z.enum(["unknown", "limited", "documented"]).nullable(),
  })
  .superRefine((v, ctx) => {
    for (const [id, version] of [
      [v.planVersionId, v.planVersion],
      [v.assignmentVersionId, v.assignmentVersion],
      [v.executionRevisionId, v.executionVersion],
    ])
      if ((id === null) !== (version === null))
        ctx.addIssue({
          code: "custom",
          message: "Grundlagets identitet og version følger ikke hinanden.",
        });
  });
export const GetWorkOrderLifecycleSchema = scope;
export const WorkOrderLifecycleContextSchema = z.object({
  action_id: uuid,
  organization_id: uuid,
  project_id: uuid,
  user_id: uuid,
  state: WorkOrderLifecycleSchema.nullable(),
  basis: WorkOrderLifecycleBasisSchema,
  context_changed: z.boolean(),
  can_manage: z.boolean(),
  can_start: z.boolean(),
  can_perform: z.boolean(),
  can_note: z.boolean(),
});
export type WorkOrderLifecycleContext = z.infer<typeof WorkOrderLifecycleContextSchema>;
export const noteKindLabels = {
  comment: "Note",
  deviation: "Afvigelsesnote",
  handover: "Overdragelse",
} as const;
export const NoteKindSchema = z.enum(["comment", "deviation", "handover"]);
export const WorkOrderNoteSchema = z.object({
  ...rowIdentity,
  ...rowContext,
  note_id: uuid,
  kind: NoteKindSchema,
  body: z.string().trim().min(1).max(4000),
  correction_reason: z.string().trim().max(2000),
  lifecycle_version_id: uuid.nullable(),
});
export type WorkOrderNote = z.infer<typeof WorkOrderNoteSchema>;
export const SaveWorkOrderNoteSchema = scope
  .extend({
    noteId: uuid,
    expectedVersion: z.number().int().min(0).max(2147483646),
    kind: NoteKindSchema,
    body: z.string().trim().min(1).max(4000),
    correctionReason: z.string().trim().max(2000),
    ...references,
    lifecycleVersionId: uuid.nullable(),
    requestId: uuid,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.expectedVersion > 0 && !v.correctionReason)
      ctx.addIssue({ code: "custom", message: "Begrund rettelsen af noten." });
  });
export const WorkOrderNoteHistorySchema = scope
  .extend({
    noteId: uuid,
    beforeVersion: z.number().int().positive().nullable(),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();
const logKey = z
  .string()
  .regex(
    /^(root|plan|access|assignment|execution|status|note|group):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
export const WorkOrderLogCursorSchema = z
  .object({ beforeAt: WorkOrderInstantSchema, beforeKey: logKey, asOf: WorkOrderInstantSchema })
  .strict();
export type WorkOrderLogCursor = z.infer<typeof WorkOrderLogCursorSchema>;
export const GetWorkOrderLogSchema = scope
  .extend({
    cursor: WorkOrderLogCursorSchema.nullable(),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();
export const WorkOrderLogEntrySchema = z
  .object({
    key: logKey,
    created_at: WorkOrderInstantSchema,
    created_by: uuid,
    kind: z.enum([
      "created",
      "plan",
      "access",
      "assignment",
      "execution",
      "status",
      "note",
      "group",
    ]),
    event_type: z.enum([
      "work_order.created",
      "work_order.plan_saved",
      "work_order.access_changed",
      "work_order.assignment_configured",
      "work_order.pool_claimed",
      "work_order.execution_saved",
      "work_order.lifecycle_changed",
      "work_order.note_saved",
      "work_order.group_saved",
    ]),
    source_id: uuid,
    source_version: z.number().int().positive().nullable(),
    origin: z.enum(["system", "manual"]),
    audit_recorded: z.boolean(),
    detail: z
      .object({
        title: z.string().max(160).optional(),
        name: z.string().max(160).optional(),
        reason: z.string().max(2000).optional(),
        active: z.boolean().optional(),
        recipientId: uuid.optional(),
        canExecute: z.boolean().optional(),
        canReview: z.boolean().optional(),
        mode: z.enum(["person", "group", "pool", "unassigned"]).optional(),
        claimedBy: uuid.nullable().optional(),
        actualDate: CalendarDate.nullable().optional(),
        method: z.string().max(2000).nullable().optional(),
        coverage: z.enum(["unknown", "limited", "documented"]).optional(),
        documentationGaps: z.array(z.string().max(120)).max(30).optional(),
        status: WorkOrderStatusSchema.optional(),
        operation: z.enum(["transition", "confirm", "block", "unblock"]).optional(),
        blocked: z.boolean().optional(),
        blockReason: z.string().max(2000).nullable().optional(),
        blockOwnerId: uuid.nullable().optional(),
        blockNextAction: z.string().max(2000).nullable().optional(),
        blockDueDate: CalendarDate.nullable().optional(),
        startedAt: WorkOrderInstantSchema.nullable().optional(),
        startedSource: z.string().max(2000).nullable().optional(),
        startedBy: uuid.nullable().optional(),
        noteId: uuid.optional(),
        kind: NoteKindSchema.optional(),
        body: z.string().min(1).max(4000).optional(),
        planVersionId: uuid.nullable().optional(),
        assignmentVersionId: uuid.nullable().optional(),
        executionRevisionId: uuid.nullable().optional(),
        lifecycleVersionId: uuid.nullable().optional(),
      })
      .strict(),
  })
  .superRefine((v, ctx) => {
    const types = {
      created: ["work_order.created"],
      plan: ["work_order.plan_saved"],
      access: ["work_order.access_changed"],
      assignment: ["work_order.assignment_configured", "work_order.pool_claimed"],
      execution: ["work_order.execution_saved"],
      status: ["work_order.lifecycle_changed"],
      note: ["work_order.note_saved"],
      group: ["work_order.group_saved"],
    };
    if (
      v.key !== `${v.kind === "created" ? "root" : v.kind}:${v.source_id}` ||
      !types[v.kind].includes(v.event_type) ||
      (v.source_version === null) !== (v.kind === "created") ||
      (v.origin === "manual") !== (v.kind === "note")
    )
      ctx.addIssue({
        code: "custom",
        message: "Logbogens oprindelse eller versionsreference stemmer ikke.",
      });
    if (
      v.kind === "note"
        ? !v.detail.noteId || !v.detail.kind || !v.detail.body
        : v.detail.noteId !== undefined || v.detail.body !== undefined
    )
      ctx.addIssue({
        code: "custom",
        message: "Manuelle noter og systemhændelser må ikke sammenblandes.",
      });
  });
export type WorkOrderLogEntry = z.infer<typeof WorkOrderLogEntrySchema>;
export const WorkOrderLogPageSchema = z.object({
  action_id: uuid,
  organization_id: uuid,
  project_id: uuid,
  user_id: uuid,
  as_of: WorkOrderInstantSchema,
  items: z.array(WorkOrderLogEntrySchema).max(50),
  next: WorkOrderLogCursorSchema.nullable(),
});
