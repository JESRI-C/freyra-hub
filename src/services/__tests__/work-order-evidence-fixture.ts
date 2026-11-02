import type { EvidenceVersion } from "@/lib/work-order-evidence";
import type { WorkOrderExecutionBinding } from "@/lib/work-order-execution";
export const id = (n: number) => `dd020000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const scope = { actionId: id(31), organizationId: id(11), projectId: id(21) };
export const actor = id(1);
export const input = {
  ...scope,
  expectedActorId: actor,
  evidenceId: id(71),
  expectedVersion: 0,
  observationVersionId: id(47),
  uploadId: id(51),
  executionRevisionId: null,
  state: "attached" as const,
  reason: "Dokumenterer observationen",
  requestId: id(81),
};
export function execution(n = 201, v = 2): WorkOrderExecutionBinding {
  return {
    workspace_entry_id: id(n),
    action_id: scope.actionId,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    version: v,
    plan_version_id: id(101),
    plan_version: 1,
    assignment_version_id: null,
    performed_by_id: null,
    membership_snapshot: null,
    deviation_reason: "",
    documentation_gaps: ["performer_identity_unknown"],
    actual_start: "2026-11-02",
    actual_end: null,
    actual_method: "Håndskæring",
    coverage: "limited",
    request_id: id(104),
    created_by: actor,
    created_at: "2026-11-02T09:00:00+00:00",
  };
}
export function version(n = 91): EvidenceVersion {
  return {
    id: id(n),
    evidence_id: input.evidenceId,
    action_id: scope.actionId,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    version: 1,
    observation_version_id: input.observationVersionId,
    upload_id: input.uploadId,
    execution_revision_id: null,
    state: "attached",
    reason: input.reason,
    request_id: input.requestId,
    created_by: actor,
    created_at: "2026-11-02T09:00:00+00:00",
    observation_snapshot: {
      schema: "freyra.task-observation-pin/v1",
      id: input.observationVersionId,
      version: 1,
      template: {
        schema: "freyra.field-job-template/v1",
        title: "Besigtigelse",
        domain: "nature",
        fields: [
          { key: "count", label: "Antal", type: "number", required: true },
          { key: "checked", label: "Kontrolleret", type: "boolean", required: true },
          { key: "date", label: "Dato", type: "date", required: false },
        ],
      },
      values: { count: 0, checked: false, date: null },
      status: "recorded",
      recordedAt: "2026-11-02T09:00:00+00:00",
      recordedBy: actor,
    },
    original_snapshot: {
      schema: "freyra.task-original-pin/v1",
      uploadId: input.uploadId,
      sha256: "a".repeat(64),
      sizeBytes: 8,
      objectId: id(61),
      objectVersion: null,
      objectUpdatedAt: "2026-11-02T09:00:00+00:00",
      storagePath: `${scope.projectId}/field-uploads/${input.uploadId}/original`,
      capturedAt: null,
      capture: {
        schema: "freyra.field-photo/v1",
        originalPosition: null,
        initialPosition: { lat: 55, lng: 10 },
        correctionReason: "Manuel placering",
      },
    },
  };
}
