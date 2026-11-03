import { z } from "zod";
import { WorkOrderActionIdSchema } from "./work-order-access";
import { WorkOrderLifecycleSchema, WorkOrderLifecycleBasisSchema } from "./work-order-lifecycle";
const uuid = z.string().uuid();
export const WorkOrderReviewContextSchema = z
  .object({
    action_id: WorkOrderActionIdSchema,
    organization_id: uuid,
    project_id: uuid,
    user_id: uuid,
    state: WorkOrderLifecycleSchema.nullable(),
    basis: WorkOrderLifecycleBasisSchema,
    packet: z
      .object({
        id: uuid,
        version: z.number().int().positive(),
        plan_version_id: uuid,
        assignment_version_id: uuid,
        execution_revision_id: uuid,
      })
      .nullable(),
    packet_current: z.boolean().nullable(),
    self_review: z.boolean(),
    can_submit: z.boolean(),
    can_review: z.boolean(),
    can_reopen: z.boolean(),
    recent_reviews: z
      .array(
        z.object({
          state: WorkOrderLifecycleSchema,
          submission_version: z.number().int().positive(),
        }),
      )
      .max(5),
  })
  .superRefine((c, ctx) => {
    const issue = () =>
      ctx.addIssue({
        code: "custom",
        message: "Gennemgangens versioner og rettigheder stemmer ikke.",
      });
    if ((c.self_review && c.can_review) || (c.packet_current !== null && !c.packet)) issue();
    if (
      c.can_submit &&
      (!c.packet || !c.packet_current || c.state?.status !== "performed" || c.state.blocked)
    )
      issue();
    if (
      c.can_reopen &&
      (!c.packet ||
        !c.state ||
        c.state.blocked ||
        !["submitted", "approved", "returned"].includes(c.state.status))
    )
      issue();
    if (
      c.state &&
      ["submitted", "approved", "returned"].includes(c.state.status) &&
      c.state.submission_version_id !== c.packet?.id
    )
      issue();
    let last = 2147483648;
    for (const entry of c.recent_reviews) {
      if (
        entry.state.operation !== "review" ||
        !entry.state.submission_version_id ||
        entry.state.version >= last
      )
        issue();
      last = entry.state.version;
    }
  });
export type WorkOrderReviewContext = z.infer<typeof WorkOrderReviewContextSchema>;
export type ApprovedFollowUpBasis = Pick<
  NonNullable<WorkOrderReviewContext["packet"]>,
  "id" | "version" | "plan_version_id"
>;
export type WorkOrderReviewAction = "submit" | "approve" | "return" | "reopen";
