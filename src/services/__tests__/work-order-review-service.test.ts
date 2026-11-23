import { describe, expect, it, vi } from "vitest";
import { getWorkOrderReviewContext } from "../work-order-review-service";
import { LifecycleRequestSchema, WorkOrderLifecycleSchema } from "@/lib/work-order-lifecycle";
import {
  reviewActor as actor,
  reviewContext,
  reviewId as id,
  reviewScope as scope,
} from "./work-order-review-fixture";
const client = (data: unknown, error: unknown = null) => ({
  rpc: vi.fn().mockResolvedValue({ data, error }),
});
describe("task-scoped submission review", () => {
  it("uses the existing authenticated task scope", async () => {
    const c = client(reviewContext());
    expect((await getWorkOrderReviewContext(c, actor, scope)).packet?.id).toBe(id(8));
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith("get_work_order_review_context", {
      p_action_id: scope.actionId,
      p_organization_id: scope.organizationId,
      p_project_id: scope.projectId,
    });
  });
  it("rejects another actor or project in a context response", async () => {
    for (const delta of [{ user_id: id(90) }, { project_id: id(91) }])
      await expect(
        getWorkOrderReviewContext(client({ ...reviewContext(), ...delta }), actor, scope),
      ).rejects.toThrow();
  });
  it("rejects contradictory capability and packet assertions", async () => {
    for (const delta of [
      { self_review: true },
      { packet: { ...reviewContext().packet, id: id(99) } },
      { can_submit: true },
      { can_reopen: true, state: null },
    ])
      await expect(
        getWorkOrderReviewContext(client({ ...reviewContext(), ...delta }), actor, scope),
      ).rejects.toThrow();
  });
  it("quarantines wrong-scope history as well as the current status", async () => {
    const c = reviewContext();
    const state = { ...c.state!, organization_id: id(99) };
    await expect(
      getWorkOrderReviewContext(client({ ...c, state }), actor, scope),
    ).rejects.toThrow();
  });
  it("preserves legacy request normalization for existing retry identities", () => {
    const r = LifecycleRequestSchema.parse({
      operation: "transition",
      targetStatus: "performed",
      planVersionId: id(5),
      assignmentVersionId: id(6),
      executionRevisionId: id(7),
    });
    expect(r).not.toHaveProperty("submissionVersionId");
    expect(r).not.toHaveProperty("reviewScope");
    expect(LifecycleRequestSchema.safeParse({ ...r, targetStatus: "approved" }).success).toBe(
      false,
    );
  });
  it("requires exact review scope, findings and source identity", () => {
    const c = reviewContext();
    const r = {
      ...c.state!.request_values,
      operation: "review",
      targetStatus: "approved",
      reason: "Synthetic scope and findings",
      reviewScope: "execution_and_documentation",
    };
    expect(LifecycleRequestSchema.safeParse(r).success).toBe(true);
    for (const delta of [
      { reason: "short" },
      { submissionVersionId: null },
      { reviewScope: "nature_effect" },
    ])
      expect(LifecycleRequestSchema.safeParse({ ...r, ...delta }).success).toBe(false);
    expect(
      WorkOrderLifecycleSchema.safeParse({
        ...c.state,
        operation: "review",
        status: "approved",
        review_scope: "execution_and_documentation",
        reason: r.reason,
        request_values: r,
        submission_version_id: id(99),
      }).success,
    ).toBe(false);
  });
  it("surfaces server revocation instead of a successful empty state", async () => {
    await expect(
      getWorkOrderReviewContext(
        client(null, { code: "42501", message: "unavailable" }),
        actor,
        scope,
      ),
    ).rejects.toThrow();
  });
});
