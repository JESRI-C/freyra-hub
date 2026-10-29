import { z } from "zod";
import { ActionExecutionSchema, CalendarDate } from "./action-execution";
import { WorkOrderScopeSchema } from "./work-order-access";
export const LoadWorkOrderExecutionSchema = WorkOrderScopeSchema.extend({
  expectedActorId: z.string().uuid(),
  previousRevisionId: z.string().uuid().nullable(),
}).strict();
export const SaveWorkOrderExecutionSchema = WorkOrderScopeSchema.extend({
  expectedActorId: z.string().uuid(),
  planVersionId: z.string().uuid(),
  expectedPlanVersion: z.number().int().positive(),
  expectedVersion: z.number().int().min(0).max(2147483646),
  requestId: z.string().uuid(),
  execution: ActionExecutionSchema,
  performedById: z.string().uuid().nullable(),
  deviationReason: z.string().trim().max(2000),
})
  .strict()
  .superRefine((value, ctx) => {
    if (value.actionId !== value.execution.actionId)
      ctx.addIssue({
        code: "custom",
        path: ["execution", "actionId"],
        message: "Udførelsen tilhører en anden arbejdsopgave.",
      });
    if (value.expectedVersion > 0 && !value.execution.correctionReason)
      ctx.addIssue({
        code: "custom",
        path: ["execution", "correctionReason"],
        message: "Angiv årsagen til rettelsen.",
      });
    if (value.execution.deviation && !value.deviationReason)
      ctx.addIssue({
        code: "custom",
        path: ["deviationReason"],
        message: "Begrund afvigelsen fra planen.",
      });
  });
export const WorkOrderExecutionBindingSchema = z
  .object({
    workspace_entry_id: z.string().uuid(),
    action_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    project_id: z.string().uuid(),
    version: z.number().int().positive(),
    plan_version_id: z.string().uuid(),
    plan_version: z.number().int().positive(),
    performed_by_id: z.string().uuid().nullable(),
    membership_snapshot: z
      .object({
        schema: z.literal("freyra.work-order-performer/v1"),
        userId: z.string().uuid(),
        organizationRole: z.string(),
        projectRole: z.string().nullable(),
        assessedAt: z.string().datetime({ offset: true }),
        basis: z.enum(["current", "historical"]),
        sourceExecutionRevisionId: z.string().uuid().nullable(),
      })
      .nullable(),
    deviation_reason: z.string().max(2000),
    documentation_gaps: z.array(
      z.enum([
        "execution_not_performed",
        "actual_method_unknown",
        "performer_identity_unknown",
        "actual_coverage_unknown",
        "deviation_attachment_missing",
      ]),
    ),
    actual_start: CalendarDate.nullable(),
    actual_end: CalendarDate.nullable(),
    actual_method: z.string().nullable(),
    coverage: z.enum(["unknown", "limited", "documented"]),
    request_id: z.string().uuid(),
    created_by: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
  })
  .superRefine((row, ctx) => {
    if (
      (row.performed_by_id === null) !== (row.membership_snapshot === null) ||
      (row.membership_snapshot && row.membership_snapshot.userId !== row.performed_by_id)
    )
      ctx.addIssue({
        code: "custom",
        path: ["membership_snapshot"],
        message: "Udførerens medlemsgrundlag stemmer ikke.",
      });
  });
export type WorkOrderExecutionBinding = z.infer<typeof WorkOrderExecutionBindingSchema>;
export const workOrderExecutionGapLabels: Record<
  WorkOrderExecutionBinding["documentation_gaps"][number],
  string
> = {
  execution_not_performed: "Faktisk udførelse er ikke registreret.",
  actual_method_unknown: "Faktisk metode er uafklaret.",
  performer_identity_unknown: "Udføreren er ikke knyttet til et projektmedlem.",
  actual_coverage_unknown: "Faktisk dækning er uafklaret.",
  deviation_attachment_missing: "Afvigelsen mangler bilag.",
};
