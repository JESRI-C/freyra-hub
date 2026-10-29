import { beforeEach, describe, it, expect, vi } from "vitest";
import { emptyExecution } from "@/lib/action-execution";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
import { SaveWorkOrderExecutionSchema } from "@/lib/work-order-execution";
import {
  loadWorkOrderExecutionContext,
  saveWorkOrderExecution,
} from "../work-order-execution-service";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  scope = { actionId: id(2), organizationId: id(3), projectId: id(4) };
const execution = {
  ...emptyExecution(scope.actionId),
  dataBasis: "synthetic" as const,
  stage: "performed" as const,
  actualDate: "2026-10-08",
  method: "Synthetic actual method",
  reach: "Synthetic reach",
  performedBy: "Synthetic colleague",
  sourceReference: "Synthetic work log",
  coverage: "limited" as const,
  coverageDescription: "Synthetic partial execution",
};
const input = {
  ...scope,
  expectedActorId: actor,
  planVersionId: id(5),
  expectedPlanVersion: 1,
  expectedVersion: 0,
  requestId: id(6),
  execution,
  performedById: id(7),
  deviationReason: "",
};
const row = {
  workspace_entry_id: id(8),
  action_id: scope.actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  version: 1,
  plan_version_id: input.planVersionId,
  plan_version: 1,
  performed_by_id: input.performedById,
  membership_snapshot: {
    schema: "freyra.work-order-performer/v1",
    userId: input.performedById,
    organizationRole: "viewer",
    projectRole: "field",
    assessedAt: "2026-10-29T19:00:00Z",
    basis: "current",
    sourceExecutionRevisionId: null,
  },
  deviation_reason: "",
  documentation_gaps: [],
  actual_start: execution.actualDate,
  actual_end: null,
  actual_method: execution.method,
  coverage: "limited",
  request_id: input.requestId,
  created_by: actor,
  created_at: "2026-10-29T19:00:00Z",
};
const plan = {
  id: input.planVersionId,
  action_id: scope.actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  version: 1,
  plan: {
    ...emptyWorkOrderPlan("Synthetic plan"),
    plannedStart: "2026-09-21",
    plannedMethod: "Synthetic planned method",
  },
  correction_reason: "",
  request_id: id(9),
  created_by: actor,
  created_at: "2026-10-29T19:00:00Z",
};
describe("atomic execution/plan request boundary", () => {
  const rpc = vi.fn(),
    client = { rpc };
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [row], error: null });
  });
  it("sends the frozen plan and actual execution separately through the authenticated RPC", async () => {
    expect(await saveWorkOrderExecution(client, actor, input)).toEqual(row);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_work_order_execution", {
      p_action_id: scope.actionId,
      p_organization_id: scope.organizationId,
      p_project_id: scope.projectId,
      p_plan_version_id: input.planVersionId,
      p_expected_plan_version: 1,
      p_expected_version: 0,
      p_execution: execution,
      p_performed_by_id: input.performedById,
      p_deviation_reason: "",
      p_request_id: input.requestId,
    });
  });
  it("rejects changed accounts and undeclared fields before writing", async () => {
    await expect(saveWorkOrderExecution(client, id(99), input)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      saveWorkOrderExecution(client, actor, { ...input, approved: true }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects an account change before opening an execution context", async () => {
    await expect(
      loadWorkOrderExecutionContext(client, id(99), {
        ...scope,
        expectedActorId: actor,
        previousRevisionId: null,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { action_id: id(99) },
    { organization_id: id(99) },
    { project_id: id(99) },
    { plan_version_id: id(99) },
    { version: 2 },
    { plan_version: 2 },
    { created_by: id(99) },
    { request_id: id(99) },
    { actual_start: "2026-09-21" },
    { actual_method: "Synthetic planned method" },
  ])("rejects a substituted execution receipt %j", async (change) => {
    rpc.mockResolvedValue({ data: [{ ...row, ...change }], error: null });
    await expect(saveWorkOrderExecution(client, actor, input)).rejects.toBeInstanceOf(Error);
  });
  it("preserves unavailable/conflict/access as distinct failures", async () => {
    for (const [code, statusCode] of [
      ["40001", 409],
      ["42501", 403],
      ["23514", 422],
      ["XX000", 503],
    ] as const) {
      rpc.mockResolvedValue({ data: null, error: { code, message: "private internal detail" } });
      await expect(saveWorkOrderExecution(client, actor, input)).rejects.toMatchObject({
        statusCode,
      });
    }
  });
  it("allows an actual record with visible missing evidence but requires deviation reason and correction reason", () => {
    expect(
      SaveWorkOrderExecutionSchema.safeParse({
        ...input,
        execution: { ...execution, deviation: "Synthetic deviation" },
        deviationReason: "Synthetic cause",
      }).success,
    ).toBe(true);
    for (const change of [
      { execution: { ...execution, deviation: "Synthetic deviation" } },
      { expectedVersion: 1 },
      { execution: { ...execution, actionId: id(99) } },
    ])
      expect(SaveWorkOrderExecutionSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("loads exact prior binding while keeping the newer plan separate", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ ...plan, id: id(12), version: 2 }], error: null })
      .mockResolvedValueOnce({ data: [row], error: null });
    const result = await loadWorkOrderExecutionContext(client, actor, {
      ...scope,
      expectedActorId: actor,
      previousRevisionId: row.workspace_entry_id,
    });
    expect(result.plan?.version).toBe(2);
    expect(result.binding?.plan_version).toBe(1);
    expect(result.binding?.workspace_entry_id).toBe(row.workspace_entry_id);
  });
  it("treats legacy action with no saved plan as legacy, without inventing a plan", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(
      await loadWorkOrderExecutionContext(client, actor, {
        ...scope,
        expectedActorId: actor,
        previousRevisionId: null,
      }),
    ).toEqual({ plan: null, binding: null });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects foreign revision binding and malformed history", async () => {
    rpc
      .mockResolvedValueOnce({ data: [plan], error: null })
      .mockResolvedValueOnce({ data: [{ ...row, workspace_entry_id: id(99) }], error: null });
    await expect(
      loadWorkOrderExecutionContext(client, actor, {
        ...scope,
        expectedActorId: actor,
        previousRevisionId: row.workspace_entry_id,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(
      loadWorkOrderExecutionContext(client, actor, {
        ...scope,
        expectedActorId: actor,
        previousRevisionId: null,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
