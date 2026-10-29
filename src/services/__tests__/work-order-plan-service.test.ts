import { describe, expect, it, vi } from "vitest";
import { saveWorkOrderPlan, getWorkOrderPlanHistory } from "../work-order-plan-service";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { actionId: id(1), projectId: id(2), organizationId: id(3) },
  actor = id(4);
const input = {
  ...scope,
  expectedActorId: actor,
  expectedVersion: 0,
  requestId: id(5),
  correctionReason: "",
  plan: emptyWorkOrderPlan("Synthetic plan"),
};
const row = {
  id: id(6),
  action_id: scope.actionId,
  project_id: scope.projectId,
  organization_id: scope.organizationId,
  version: 1,
  request_id: input.requestId,
  correction_reason: "",
  plan: input.plan,
  created_by: actor,
  created_at: "2026-10-29T18:00:00Z",
};
describe("work-order plan request boundary", () => {
  it("does not mix actual execution into its plan mutation", async () => {
    const rpc = vi.fn(async () => ({ data: [row], error: null }));
    expect(await saveWorkOrderPlan({ rpc }, actor, input)).toEqual(row);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_work_order_plan", {
      p_action_id: scope.actionId,
      p_project_id: scope.projectId,
      p_organization_id: scope.organizationId,
      p_expected_version: 0,
      p_plan: input.plan,
      p_correction_reason: "",
      p_request_id: input.requestId,
    });
  });
  it("pins the submitting account before sending", async () => {
    const rpc = vi.fn();
    await expect(saveWorkOrderPlan({ rpc }, id(90), input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { version: 2 },
    { created_by: id(90) },
    { request_id: id(90) },
    { plan: { ...input.plan, plannedMethod: "Invented method" } },
  ])("rejects a mismatched plan receipt %j", async (change) => {
    await expect(
      saveWorkOrderPlan(
        { rpc: async () => ({ data: [{ ...row, ...change }], error: null }) },
        actor,
        input,
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("exposes a stable older-version cursor instead of hiding history", async () => {
    const rows = [3, 2, 1].map((version) => ({ ...row, version }));
    const rpc = vi.fn(async () => ({ data: rows, error: null }));
    const result = await getWorkOrderPlanHistory({ rpc }, actor, {
      ...scope,
      beforeVersion: null,
      pageSize: 2,
    });
    expect(result.items.map((r) => r.version)).toEqual([3, 2]);
    expect(result.nextBeforeVersion).toBe(2);
  });
  it("distinguishes a real empty history from backend failure", async () => {
    const page = { ...scope, beforeVersion: null, pageSize: 20 };
    expect(
      await getWorkOrderPlanHistory({ rpc: async () => ({ data: [], error: null }) }, actor, page),
    ).toEqual({ items: [], nextBeforeVersion: null });
    await expect(
      getWorkOrderPlanHistory(
        {
          rpc: async () => ({
            data: [],
            error: { code: "42P01", message: "private database text" },
          }),
        },
        actor,
        page,
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("rejects out-of-scope or out-of-order pages", async () => {
    for (const data of [
      [{ ...row, project_id: id(90) }],
      [row, row],
      [
        { ...row, version: 2 },
        { ...row, version: 3 },
      ],
    ])
      await expect(
        getWorkOrderPlanHistory({ rpc: async () => ({ data, error: null }) }, actor, {
          ...scope,
          beforeVersion: null,
          pageSize: 20,
        }),
      ).rejects.toThrow();
  });
});
