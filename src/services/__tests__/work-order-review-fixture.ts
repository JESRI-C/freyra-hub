import { LifecycleRequestSchema, WorkOrderLifecycleSchema } from "@/lib/work-order-lifecycle";
import { WorkOrderReviewContextSchema } from "@/lib/work-order-review";
export const reviewId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const reviewActor = reviewId(1);
export const reviewScope = {
  actionId: reviewId(2),
  organizationId: reviewId(3),
  projectId: reviewId(4),
};
export function reviewContext() {
  const values = LifecycleRequestSchema.parse({
    operation: "submit",
    targetStatus: "submitted",
    planVersionId: reviewId(5),
    assignmentVersionId: reviewId(6),
    executionRevisionId: reviewId(7),
    submissionVersionId: reviewId(8),
    reviewScope: null,
    reason: "Synthetic handover",
  });
  const state = WorkOrderLifecycleSchema.parse({
    id: reviewId(11),
    action_id: reviewScope.actionId,
    organization_id: reviewScope.organizationId,
    project_id: reviewScope.projectId,
    version: 6,
    operation: "submit",
    status: "submitted",
    plan_version_id: reviewId(5),
    assignment_version_id: reviewId(6),
    execution_revision_id: reviewId(7),
    submission_version_id: reviewId(8),
    review_scope: null,
    started_at: "2026-11-02T08:00:00Z",
    started_source: "Synthetic start",
    started_by_id: reviewId(9),
    blocked: false,
    block_reason: null,
    block_owner_id: null,
    block_next_action: null,
    block_due_date: null,
    reason: values.reason,
    request_values: values,
    request_id: reviewId(10),
    created_by: reviewId(9),
    created_at: "2026-11-02T12:00:00Z",
  });
  return WorkOrderReviewContextSchema.parse({
    action_id: reviewScope.actionId,
    organization_id: reviewScope.organizationId,
    project_id: reviewScope.projectId,
    user_id: reviewActor,
    state,
    basis: {
      planVersionId: reviewId(5),
      planVersion: 1,
      assignmentVersionId: reviewId(6),
      assignmentVersion: 1,
      executionRevisionId: reviewId(7),
      executionVersion: 1,
      planGaps: [],
      assignmentValid: true,
      executionGaps: [],
      documentationGaps: [],
      unknownPlannedDate: true,
      actualDate: "2026-11-02",
      actualMethod: "Synthetic inspection",
      actualCoverage: "limited",
    },
    packet: {
      id: reviewId(8),
      version: 1,
      plan_version_id: reviewId(5),
      assignment_version_id: reviewId(6),
      execution_revision_id: reviewId(7),
    },
    packet_current: true,
    self_review: false,
    can_submit: false,
    can_review: true,
    can_reopen: false,
    recent_reviews: [],
  });
}
