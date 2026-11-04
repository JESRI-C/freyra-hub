import { describe, expect, it } from "vitest";
import {
  parseProjectWorkOrderAction,
  ProjectWorkOrderStatusSchema,
} from "../project-work-order-status";
import { workOrderStatusLabels } from "../work-order-lifecycle";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { organizationId: id(1), projectId: id(2) };
const identity = {
  action_id: id(3),
  organization_id: scope.organizationId,
  project_id: scope.projectId,
};
const life = { ...identity, id: id(4), version: 6, status: "approved", blocked: false };
const order = { ...identity, life: [life] };
const action = {
  id: identity.action_id,
  project_id: scope.projectId,
  title: "Besøg",
  status: "Åben",
  action_type: null,
  linked_indicator_id: id(5),
  work_orders: [order],
};

describe("project work-order status projection", () => {
  it.each(Object.keys(workOrderStatusLabels))(
    "preserves recorded %s despite conflicting legacy status",
    (status) => {
      const result = parseProjectWorkOrderAction(
        { ...action, work_orders: [{ ...order, life: [{ ...life, status }] }] },
        scope,
      );
      expect(result).toEqual({
        id: action.id,
        title: action.title,
        status: "Åben",
        linked_indicator_id: id(5),
        workOrderStatus: {
          state: "recorded",
          initialized: true,
          status,
          version: 6,
          blocked: false,
        },
      });
      expect(ProjectWorkOrderStatusSchema.parse(result.workOrderStatus)).toEqual(
        result.workOrderStatus,
      );
    },
  );

  it.each([false, true])(
    "distinguishes missing lifecycle with initialized=%s without inventing a legacy fallback",
    (initialized) => {
      const result = parseProjectWorkOrderAction(
        { ...action, status: "Godkendt", work_orders: initialized ? [{ ...order, life: [] }] : [] },
        scope,
      );
      expect(result.workOrderStatus).toEqual({
        state: "missing",
        initialized,
        status: null,
        version: null,
        blocked: false,
      });
    },
  );

  it("preserves unknown server status as unrecognized, including its version and independent block", () => {
    expect(
      parseProjectWorkOrderAction(
        {
          ...action,
          work_orders: [{ ...order, life: [{ ...life, status: "future_review", blocked: true }] }],
        },
        scope,
      ).workOrderStatus,
    ).toEqual({
      state: "unrecognized",
      initialized: true,
      status: null,
      version: 6,
      blocked: true,
    });
  });

  it("preserves legacy UUIDs and does not require a plan, assignment or execution", () => {
    const legacy = "11111111-1111-c111-5111-111111111111";
    const result = parseProjectWorkOrderAction(
      {
        ...action,
        id: legacy,
        work_orders: [{ ...order, action_id: legacy, life: [{ ...life, action_id: legacy }] }],
      },
      scope,
    );
    expect(result.id).toBe(legacy);
    expect(result.workOrderStatus.status).toBe("approved");
  });

  it.each([
    { ...action, project_id: id(90) },
    ...["action_id", "organization_id", "project_id"].map((key) => ({
      ...action,
      work_orders: [{ ...order, [key]: id(90) }],
    })),
    ...["action_id", "organization_id", "project_id"].map((key) => ({
      ...action,
      work_orders: [{ ...order, life: [{ ...life, [key]: id(90) }] }],
    })),
  ])("rejects a foreign parent or nested identity %#", (row) => {
    expect(() => parseProjectWorkOrderAction(row, scope)).toThrow("anden sag eller opgave");
  });

  it.each([
    { ...action, work_orders: undefined },
    { ...action, work_orders: null },
    { ...action, work_orders: order },
    { ...action, work_orders: [order, order] },
    { ...action, work_orders: [{ ...order, life: null }] },
    { ...action, work_orders: [{ ...order, life }] },
    { ...action, work_orders: [{ ...order, life: [life, life] }] },
    { ...action, work_orders: [{ ...order, life: [{ ...life, version: 0 }] }] },
    { ...action, work_orders: [{ ...order, life: [{ ...life, status: null }] }] },
    { ...action, work_orders: [{ ...order, life: [{ ...life, blocked: "false" }] }] },
  ])("rejects malformed relations instead of converting them to missing status %#", (row) => {
    expect(() => parseProjectWorkOrderAction(row, scope)).toThrow();
  });

  it.each([
    { state: "recorded", initialized: false, status: "draft", version: 1, blocked: false },
    { state: "recorded", initialized: true, status: "future", version: 1, blocked: false },
    { state: "missing", initialized: true, status: "draft", version: null, blocked: false },
    { state: "missing", initialized: true, status: null, version: null, blocked: true },
    { state: "unrecognized", initialized: true, status: "draft", version: 1, blocked: false },
  ])("rejects contradictory projected states %#", (value) => {
    expect(ProjectWorkOrderStatusSchema.safeParse(value).success).toBe(false);
  });
});
