import { describe, expect, it } from "vitest";
import { FieldPhotoUploadPayload, parseFieldPhotoUpload } from "../field-photo-upload";
import { payload, received, projectId, uploadId } from "@/services/__tests__/field-photo-fixture";
const context = {
  schema: "freyra.field-photo-work-order/v1" as const,
  organizationId: "00000000-0000-4000-8000-000000000001",
  actionId: "00000000-0000-4000-8000-000000000002",
  planVersionId: "00000000-0000-4000-8000-000000000003",
};
describe("immutable field photo task context", () => {
  it("preserves the stored identity of legacy recurring work orders", () => {
    const legacy = "a1b2c3d4-5678-abcd-0123-456789abcdef";
    const workOrder = { ...context, actionId: legacy };
    expect(
      parseFieldPhotoUpload(
        {
          ...received,
          payload: { ...payload, workOrder },
          captured_action_id: legacy,
          captured_organization_id: context.organizationId,
          captured_plan_version_id: context.planVersionId,
        },
        projectId,
        uploadId,
      ).payload.workOrder?.actionId,
    ).toBe(legacy);
  });
  it("keeps legacy payloads and upload receipts unchanged", () => {
    expect(FieldPhotoUploadPayload.parse(payload)).toEqual(payload);
    expect(parseFieldPhotoUpload(received, projectId, uploadId)).toEqual(received);
  });
  it("preserves the exact capture task and optional historical plan", () => {
    const withTask = FieldPhotoUploadPayload.parse({ ...payload, workOrder: context });
    const source = {
      ...received,
      payload: withTask,
      captured_action_id: context.actionId,
      captured_organization_id: context.organizationId,
      captured_plan_version_id: context.planVersionId,
    };
    expect(parseFieldPhotoUpload(source, projectId, uploadId).payload.workOrder).toEqual(context);
    expect(
      FieldPhotoUploadPayload.parse({ ...payload, workOrder: { ...context, planVersionId: null } })
        .workOrder?.planVersionId,
    ).toBeNull();
  });
  it("rejects a receipt with missing or different task binding before acknowledging the original", () => {
    const source = {
      ...received,
      payload: { ...payload, workOrder: context },
      captured_action_id: context.actionId,
      captured_organization_id: context.organizationId,
      captured_plan_version_id: context.planVersionId,
    };
    expect(() =>
      parseFieldPhotoUpload({ ...source, captured_action_id: undefined }, projectId, uploadId),
    ).toThrow("opgavekvittering");
    expect(() =>
      parseFieldPhotoUpload({ ...source, captured_plan_version_id: uploadId }, projectId, uploadId),
    ).toThrow("opgavekvittering");
    expect(() => parseFieldPhotoUpload({ ...source, payload }, projectId, uploadId)).toThrow(
      "opgavekvittering",
    );
  });
  it("does not accept unversioned or invented observation bindings in capture context", () => {
    expect(() =>
      FieldPhotoUploadPayload.parse({ ...payload, workOrder: { ...context, schema: "unknown" } }),
    ).toThrow();
    expect(() =>
      FieldPhotoUploadPayload.parse({
        ...payload,
        workOrder: { ...context, observationVersionId: uploadId },
      }),
    ).toThrow();
  });
});
