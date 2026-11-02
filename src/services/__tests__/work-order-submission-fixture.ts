import type { SubmissionContext, SubmissionVersion } from "@/lib/work-order-submission";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
import { emptyExecution } from "@/lib/action-execution";
import { id, scope, actor, version as evidence, execution } from "./work-order-evidence-fixture";
export { id, scope, actor };
export const input = {
  ...scope,
  expectedActorId: actor,
  expectedVersion: 0,
  basisHash: "a".repeat(64),
  note: "Til faglig gennemgang",
  requestId: id(301),
};
export function context(): SubmissionContext {
  return {
    action_id: scope.actionId,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    user_id: actor,
    latest_version: 0,
    can_prepare: true,
    basis_hash: input.basisHash,
    gaps: [],
    plan_version: 1,
    execution_version: 2,
    evidence_count: 1,
    context_changed: null,
  };
}
export function submission(version = 1): SubmissionVersion {
  const plan = {
    ...emptyWorkOrderPlan("Plejeopgave"),
    responsibleId: actor,
    profile: "nature" as const,
    instructions: "Besigtig området før indsatsen.",
  };
  const binding = {
    ...execution(),
    assignment_version_id: id(111),
    performed_by_id: actor,
    documentation_gaps: [],
    membership_snapshot: {
      schema: "freyra.work-order-performer/v1" as const,
      userId: actor,
      organizationRole: "viewer",
      projectRole: "field",
      assessedAt: "2026-11-02T09:00:00Z",
      basis: "current" as const,
      sourceExecutionRevisionId: null,
    },
  };
  return {
    id: id(300 + version),
    action_id: scope.actionId,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    version,
    plan_version_id: id(101),
    assignment_version_id: id(111),
    execution_revision_id: binding.workspace_entry_id,
    lifecycle_version_id: id(112),
    basis_hash: input.basisHash,
    note: input.note,
    request_id: input.requestId,
    created_by: actor,
    created_at: "2026-11-02T09:00:00Z",
    snapshot: {
      ...scope,
      schema: "freyra.work-order-submission/v1",
      ruleSet: "freyra.submission-core/v1",
      plan: { id: id(101), version: 1, plan },
      assignment: { id: id(111), version: 1, mode: "person", claimedBy: null },
      execution: {
        binding,
        values: {
          ...emptyExecution(scope.actionId),
          dataBasis: "synthetic",
          stage: "performed",
          actualDate: "2026-11-02",
          method: "Visuel kontrol",
          reach: "Prøveareal",
          performedBy: "Testperson",
          sourceReference: "Testlog",
          coverage: "limited",
          coverageDescription: "Kun prøveområdet er undersøgt.",
        },
      },
      lifecycle: { id: id(112), version: 5, status: "performed" },
      evidence: [evidence()],
    },
  };
}
