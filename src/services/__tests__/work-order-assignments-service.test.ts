import { beforeEach, describe, it, expect, vi } from "vitest";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
import {
  SaveWorkOrderGroupSchema,
  ConfigureWorkOrderAssignmentSchema,
  ClaimWorkOrderPoolSchema,
  WorkOrderAssignmentSchema,
} from "@/lib/work-order-assignments";
import {
  saveWorkOrderGroup,
  listWorkOrderGroups,
  getWorkOrderGroupHistory,
  listWorkOrderPeople,
  configureWorkOrderAssignment,
  claimWorkOrderPool,
  getWorkOrderAssignmentHistory,
  listMyWorkOrders,
  getWorkOrderAssignmentState,
} from "../work-order-assignments-service";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  scope = { organizationId: id(2), projectId: id(3) },
  task = { ...scope, actionId: id(4) },
  groupId = id(5),
  member = id(6);
const time = "2026-10-29T20:00:00Z";
const assessment = (userId: string) => ({
  schema: "freyra.work-order-membership/v1",
  userId,
  organizationRole: "viewer",
  projectRole: "field",
  assessedAt: time,
});
const groupInput = {
  ...scope,
  expectedActorId: actor,
  groupId,
  expectedVersion: 0,
  name: "Synthetic crew",
  active: true,
  memberIds: [member],
  correctionReason: "",
  requestId: id(7),
};
const groupRow = {
  id: id(8),
  group_id: groupId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  version: 1,
  name: groupInput.name,
  active: true,
  member_ids: [member],
  member_assessments: [assessment(member)],
  correction_reason: "",
  request_id: groupInput.requestId,
  created_by: actor,
  created_at: time,
};
const assignmentInput = {
  ...task,
  expectedActorId: actor,
  expectedVersion: 0,
  planVersionId: id(9),
  mode: "pool",
  candidateUserIds: [actor, member],
  sourceGroupVersionId: null,
  reason: "Synthetic pool assignment",
  requestId: id(10),
};
const assignmentRow = {
  id: id(11),
  action_id: task.actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  version: 1,
  change_kind: "configured",
  mode: "pool",
  plan_version_id: assignmentInput.planVersionId,
  source_group_version_id: null,
  source_group_id: null,
  candidate_user_ids: [actor, member],
  candidate_memberships: [assessment(actor), assessment(member)],
  claimed_by: null,
  claimed_at: null,
  claim_member_snapshot: null,
  reason: assignmentInput.reason,
  request_id: assignmentInput.requestId,
  created_by: actor,
  created_at: time,
};
const claimInput = {
  ...task,
  expectedActorId: actor,
  expectedVersion: 1,
  planVersionId: id(9),
  requestId: id(12),
};
const claimedRow = {
  ...assignmentRow,
  id: id(13),
  version: 2,
  change_kind: "claimed",
  claimed_by: actor,
  claimed_at: time,
  claim_member_snapshot: { ...assessment(actor), groupVersionId: null },
  reason: "Opgaven er overtaget fra puljen.",
  request_id: claimInput.requestId,
};
describe("groups and pool request boundary", () => {
  const rpc = vi.fn(),
    client = { rpc };
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [], error: null });
  });
  it("pins the actor, envelope and nested task on assignment state reads", async () => {
    const input = { ...task, expectedActorId: actor };
    const state = {
      action_id: task.actionId,
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      user_id: actor,
      assignment: assignmentRow,
      can_claim: true,
      can_execute: false,
    };
    rpc.mockResolvedValue({ data: [state], error: null });
    expect(await getWorkOrderAssignmentState(client, actor, input)).toEqual(state);
    for (const change of [
      { user_id: member },
      { project_id: id(88) },
      { assignment: { ...assignmentRow, action_id: id(89) } },
    ]) {
      rpc.mockResolvedValue({ data: [{ ...state, ...change }], error: null });
      await expect(getWorkOrderAssignmentState(client, actor, input)).rejects.toMatchObject({
        statusCode: 403,
      });
    }
    rpc.mockResolvedValue({ data: [{ ...state, can_execute: true }], error: null });
    await expect(getWorkOrderAssignmentState(client, actor, input)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it("pins group identity, scope, actor and canonical member IDs without inviting users", async () => {
    rpc.mockResolvedValue({ data: [groupRow], error: null });
    expect(await saveWorkOrderGroup(client, actor, groupInput)).toEqual(groupRow);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_work_order_group", {
      p_group_id: groupId,
      p_organization_id: scope.organizationId,
      p_project_id: scope.projectId,
      p_expected_version: 0,
      p_name: groupInput.name,
      p_active: true,
      p_member_ids: [member],
      p_correction_reason: "",
      p_request_id: groupInput.requestId,
    });
  });
  it.each([
    { organization_id: id(99) },
    { project_id: id(99) },
    { group_id: id(99) },
    { version: 2 },
    { created_by: member },
    { request_id: id(99) },
    { member_assessments: [] },
  ])("rejects substituted group receipt %j", async (change) => {
    rpc.mockResolvedValue({ data: [{ ...groupRow, ...change }], error: null });
    await expect(saveWorkOrderGroup(client, actor, groupInput)).rejects.toBeInstanceOf(Error);
  });
  it("configures pool scope and exact frozen plan with a reason", async () => {
    rpc.mockResolvedValue({ data: [assignmentRow], error: null });
    expect(await configureWorkOrderAssignment(client, actor, assignmentInput)).toEqual(
      assignmentRow,
    );
    expect(rpc.mock.calls[0]).toEqual([
      "configure_work_order_assignment",
      {
        p_action_id: task.actionId,
        p_organization_id: scope.organizationId,
        p_project_id: scope.projectId,
        p_expected_version: 0,
        p_plan_version_id: assignmentInput.planVersionId,
        p_mode: "pool",
        p_candidate_user_ids: [actor, member],
        p_source_group_version_id: null,
        p_reason: assignmentInput.reason,
        p_request_id: assignmentInput.requestId,
      },
    ]);
  });
  it.each([
    { action_id: id(99) },
    { plan_version_id: id(99) },
    { source_group_version_id: id(99) },
    { change_kind: "claimed" },
    { reason: "Different reason" },
    { version: 2 },
    { candidate_user_ids: [member] },
  ])("rejects substituted assignment %j", async (change) => {
    rpc.mockResolvedValue({ data: [{ ...assignmentRow, ...change }], error: null });
    await expect(
      configureWorkOrderAssignment(client, actor, assignmentInput),
    ).rejects.toBeInstanceOf(Error);
  });
  it("claims for the authenticated caller with the opened assignment and plan", async () => {
    rpc.mockResolvedValue({ data: [claimedRow], error: null });
    expect(await claimWorkOrderPool(client, actor, claimInput)).toEqual(claimedRow);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("claim_work_order_pool", {
      p_action_id: task.actionId,
      p_organization_id: scope.organizationId,
      p_project_id: scope.projectId,
      p_expected_version: 1,
      p_plan_version_id: claimInput.planVersionId,
      p_request_id: claimInput.requestId,
    });
  });
  it.each([
    { claimed_by: member },
    { created_by: member },
    { version: 3 },
    { request_id: id(99) },
    { plan_version_id: id(99) },
    { claim_member_snapshot: { ...assessment(member), groupVersionId: null } },
  ])("rejects forged pool claim %j", async (change) => {
    rpc.mockResolvedValue({ data: [{ ...claimedRow, ...change }], error: null });
    await expect(claimWorkOrderPool(client, actor, claimInput)).rejects.toBeInstanceOf(Error);
  });
  it("rejects account changes and claim impersonation before the RPC", async () => {
    await expect(claimWorkOrderPool(client, member, claimInput)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      claimWorkOrderPool(client, actor, { ...claimInput, claimedBy: member }),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(saveWorkOrderGroup(client, member, groupInput)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["PT409", 409],
    ["40001", 409],
    ["42501", 403],
    ["22023", 422],
    ["XX000", 503],
  ])("maps %s without internal error text", async (code, statusCode) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "private internal data" } });
    await expect(claimWorkOrderPool(client, actor, claimInput)).rejects.toMatchObject({
      statusCode,
    });
    await expect(claimWorkOrderPool(client, actor, claimInput)).rejects.not.toThrow(
      "private internal data",
    );
  });
  it("uses stable bounded cursors for group heads and prior versions", async () => {
    rpc.mockResolvedValue({
      data: [groupRow, { ...groupRow, id: id(15), group_id: id(16) }],
      error: null,
    });
    expect(
      await listWorkOrderGroups(client, actor, {
        ...scope,
        expectedActorId: actor,
        afterGroupId: null,
        pageSize: 1,
      }),
    ).toEqual({ items: [groupRow], nextAfterGroupId: groupId });
    rpc.mockResolvedValue({ data: [{ ...groupRow, version: 2 }, groupRow], error: null });
    expect(
      await getWorkOrderGroupHistory(client, actor, {
        ...scope,
        expectedActorId: actor,
        groupId,
        beforeVersion: null,
        pageSize: 1,
      }),
    ).toEqual({ items: [{ ...groupRow, version: 2 }], nextBeforeVersion: 2 });
  });
  it("distinguishes empty lists from failed or substituted reads", async () => {
    expect(
      await getWorkOrderAssignmentHistory(client, actor, {
        ...task,
        expectedActorId: actor,
        beforeVersion: null,
        pageSize: 1,
      }),
    ).toEqual({ items: [], nextBeforeVersion: null });
    rpc.mockResolvedValue({ data: [{ ...assignmentRow, organization_id: id(99) }], error: null });
    await expect(
      getWorkOrderAssignmentHistory(client, actor, {
        ...task,
        expectedActorId: actor,
        beforeVersion: null,
        pageSize: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(
      listWorkOrderGroups(client, actor, {
        ...scope,
        expectedActorId: actor,
        afterGroupId: null,
        pageSize: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("rejects duplicate/unordered history and pages crossing the cursor", async () => {
    for (const data of [
      [assignmentRow, assignmentRow],
      [assignmentRow, { ...assignmentRow, version: 2 }],
    ]) {
      rpc.mockResolvedValue({ data, error: null });
      await expect(
        getWorkOrderAssignmentHistory(client, actor, {
          ...task,
          expectedActorId: actor,
          beforeVersion: null,
          pageSize: 1,
        }),
      ).rejects.toMatchObject({ statusCode: 503 });
    }
    rpc.mockResolvedValue({ data: [groupRow], error: null });
    await expect(
      listWorkOrderGroups(client, actor, {
        ...scope,
        expectedActorId: actor,
        afterGroupId: groupId,
        pageSize: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("returns actual project people, including explicit execution eligibility", async () => {
    const person = {
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      user_id: actor,
      project_role: null,
      organization_role: "owner",
      can_execute: true,
      display_name: "Synthetic owner",
      email: null,
    };
    rpc.mockResolvedValue({ data: [person], error: null });
    expect(
      await listWorkOrderPeople(client, actor, {
        ...scope,
        expectedActorId: actor,
        afterUserId: null,
        pageSize: 1,
      }),
    ).toEqual({ items: [person], nextAfterUserId: null });
    rpc.mockResolvedValue({ data: [{ ...person, project_id: id(99) }], error: null });
    await expect(
      listWorkOrderPeople(client, actor, {
        ...scope,
        expectedActorId: actor,
        afterUserId: null,
        pageSize: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("pins the returned owner of the My tasks cache", async () => {
    const taskRow = {
      user_id: actor,
      action_id: task.actionId,
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      plan_version_id: id(9),
      plan_version: 1,
      plan: emptyWorkOrderPlan("Synthetic task"),
      assignment_id: id(11),
      assignment_version: 1,
      assignment_mode: "pool",
      claimed_by: null,
      can_claim: true,
      can_execute: false,
      can_review: false,
      can_plan: false,
    };
    rpc.mockResolvedValue({ data: [taskRow], error: null });
    expect(
      await listMyWorkOrders(client, actor, {
        expectedActorId: actor,
        afterActionId: null,
        pageSize: 1,
      }),
    ).toEqual({ items: [taskRow], nextAfterActionId: null });
    rpc.mockResolvedValue({ data: [{ ...taskRow, user_id: member }], error: null });
    await expect(
      listMyWorkOrders(client, actor, { expectedActorId: actor, afterActionId: null, pageSize: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rejects duplicate members, impossible assignment modes, empty reasons and a forged claim snapshot", () => {
    expect(
      SaveWorkOrderGroupSchema.safeParse({ ...groupInput, memberIds: [member, member] }).success,
    ).toBe(false);
    expect(SaveWorkOrderGroupSchema.safeParse({ ...groupInput, expectedVersion: 1 }).success).toBe(
      false,
    );
    for (const change of [
      { mode: "unassigned" },
      { mode: "person" },
      { mode: "group" },
      { reason: " " },
    ])
      expect(
        ConfigureWorkOrderAssignmentSchema.safeParse({ ...assignmentInput, ...change }).success,
      ).toBe(false);
    expect(ClaimWorkOrderPoolSchema.safeParse({ ...claimInput, expectedVersion: 0 }).success).toBe(
      false,
    );
    expect(
      WorkOrderAssignmentSchema.safeParse({
        ...claimedRow,
        claim_member_snapshot: { ...assessment(member), groupVersionId: null },
      }).success,
    ).toBe(false);
  });
});
