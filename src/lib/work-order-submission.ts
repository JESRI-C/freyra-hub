import { z } from "zod";
import { WorkOrderScopeSchema } from "./work-order-access";
import { WorkOrderPlanSchema } from "./work-order-plan";
import { WorkOrderExecutionBindingSchema } from "./work-order-execution";
import { ActionExecutionSchema } from "./action-execution";
import { EvidenceVersionSchema } from "./work-order-evidence";
import { fieldJobGaps } from "./field-job-cards";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const submissionGapLabels = {
  plan_incomplete: "Planen mangler ansvarlig, metodeprofil eller arbejdsinstruktion.",
  assignment_invalid: "Opgaven mangler en gyldig, aktuel tildeling.",
  execution_incomplete: "Udførelsen mangler oplysninger, udfører eller påkrævet afvigelsesbilag.",
  not_performed: "Opgavens status skal være Udført.",
  task_blocked: "Opgavens blokering skal afklares først.",
  lifecycle_basis_changed: "Status skal bekræftes på den aktuelle plan, tildeling og udførelse.",
  observation_needs_review: "En tilknyttet registrering kræver gennemgang.",
  observation_incomplete: "En tilknyttet registrering mangler nødvendige svar.",
  original_unavailable: "Et originalfoto er ændret, utilgængeligt eller mangler gyldig kontrol.",
  evidence_missing: "Tilknyt mindst én gemt registrering med et verificeret originalfoto.",
  too_many_evidence: "Der er over 100 aktive dokumentationskoblinger. Afgræns afleveringen.",
  packet_too_large: "Dokumentationspakken er for stor til denne afleveringsvej.",
} as const;
const gap = z.enum(
  Object.keys(submissionGapLabels) as [
    keyof typeof submissionGapLabels,
    ...(keyof typeof submissionGapLabels)[],
  ],
);
export const SaveSubmissionSchema = WorkOrderScopeSchema.extend({
  expectedActorId: uuid,
  expectedVersion: z.number().int().min(0).max(2147483646),
  basisHash: hash,
  note: z.string().trim().min(1).max(2000),
  requestId: uuid,
}).strict();
export const SubmissionPageSchema = WorkOrderScopeSchema.extend({
  beforeVersion: z.number().int().positive().nullable(),
  pageSize: z.number().int().min(1).max(5),
}).strict();
export const SubmissionSnapshotSchema = WorkOrderScopeSchema.extend({
  schema: z.literal("freyra.work-order-submission/v1"),
  ruleSet: z.literal("freyra.submission-core/v1"),
  plan: z.object({ id: uuid, version: z.number().int().positive(), plan: WorkOrderPlanSchema }),
  assignment: z.object({
    id: uuid,
    version: z.number().int().positive(),
    mode: z.enum(["person", "group", "pool"]),
    claimedBy: uuid.nullable(),
  }),
  execution: z.object({ binding: WorkOrderExecutionBindingSchema, values: ActionExecutionSchema }),
  lifecycle: z.object({
    id: uuid,
    version: z.number().int().positive(),
    status: z.literal("performed"),
  }),
  evidence: z.array(EvidenceVersionSchema).min(1).max(100),
}).superRefine((s, ctx) => {
  const issue = () =>
    ctx.addIssue({ code: "custom", message: "Afleveringens kilder og versioner stemmer ikke." });
  const e = s.execution;
  if (
    e.binding.action_id !== s.actionId ||
    e.binding.organization_id !== s.organizationId ||
    e.binding.project_id !== s.projectId ||
    e.binding.plan_version_id !== s.plan.id ||
    e.binding.plan_version !== s.plan.version ||
    e.binding.assignment_version_id !== s.assignment.id ||
    e.values.actionId !== s.actionId ||
    e.values.stage !== "performed" ||
    e.values.actualDate !== e.binding.actual_start ||
    e.values.actualEndDate !== e.binding.actual_end ||
    e.values.method !== e.binding.actual_method ||
    e.values.coverage !== e.binding.coverage ||
    e.binding.documentation_gaps.length ||
    !s.plan.plan.responsibleId ||
    !s.plan.plan.profile ||
    !s.plan.plan.instructions.trim()
  )
    issue();
  const seen = new Set<string>();
  for (const row of s.evidence) {
    if (
      row.action_id !== s.actionId ||
      row.organization_id !== s.organizationId ||
      row.project_id !== s.projectId ||
      row.state !== "attached" ||
      row.observation_snapshot.status !== "recorded" ||
      seen.has(row.evidence_id) ||
      fieldJobGaps(row.observation_snapshot.template, row.observation_snapshot.values).length
    )
      issue();
    seen.add(row.evidence_id);
  }
});
export const SubmissionVersionSchema = z
  .object({
    id: uuid,
    action_id: uuid,
    organization_id: uuid,
    project_id: uuid,
    version: z.number().int().positive(),
    plan_version_id: uuid,
    assignment_version_id: uuid,
    execution_revision_id: uuid,
    lifecycle_version_id: uuid,
    basis_hash: hash,
    snapshot: SubmissionSnapshotSchema,
    note: z.string().trim().min(1).max(2000),
    request_id: uuid,
    created_by: uuid,
    created_at: z.string().datetime({ offset: true }),
  })
  .superRefine((row, ctx) => {
    const s = row.snapshot;
    if (
      row.action_id !== s.actionId ||
      row.organization_id !== s.organizationId ||
      row.project_id !== s.projectId ||
      row.plan_version_id !== s.plan.id ||
      row.assignment_version_id !== s.assignment.id ||
      row.execution_revision_id !== s.execution.binding.workspace_entry_id ||
      row.lifecycle_version_id !== s.lifecycle.id
    )
      ctx.addIssue({ code: "custom", message: "Afleveringsversionen tilhører et andet grundlag." });
  });
export const SubmissionContextSchema = z
  .object({
    action_id: uuid,
    organization_id: uuid,
    project_id: uuid,
    user_id: uuid,
    latest_version: z.number().int().min(0),
    can_prepare: z.boolean(),
    basis_hash: hash.nullable(),
    gaps: z.array(gap).max(12).nullable(),
    plan_version: z.number().int().positive().nullable(),
    execution_version: z.number().int().positive().nullable(),
    evidence_count: z.number().int().min(0).max(100).nullable(),
    context_changed: z.boolean().nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      value.can_prepare
        ? !value.basis_hash || value.gaps === null || value.evidence_count === null
        : value.basis_hash !== null ||
          value.gaps !== null ||
          value.evidence_count !== null ||
          value.plan_version !== null ||
          value.execution_version !== null ||
          value.context_changed !== null
    )
      ctx.addIssue({
        code: "custom",
        message: "Afleveringens adgang og kontrolgrundlag stemmer ikke.",
      });
    if (
      value.can_prepare &&
      value.gaps?.length === 0 &&
      (!value.plan_version || !value.execution_version || !value.evidence_count)
    )
      ctx.addIssue({
        code: "custom",
        message: "Et klart grundlag skal indeholde plan, udførelse og dokumentation.",
      });
  });
export type SubmissionVersion = z.infer<typeof SubmissionVersionSchema>;
export type SubmissionContext = z.infer<typeof SubmissionContextSchema>;
