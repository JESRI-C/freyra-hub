import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeWorkOrder,
  saveWorkOrderAccess,
  getWorkOrderAccess,
  getWorkOrderAccessHistory,
  getWorkOrderAccessSubjects,
} from "../work-order-access-service";
import { SaveWorkOrderAccessSchema } from "@/lib/work-order-access";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { actionId: id(1), projectId: id(2), organizationId: id(3) },
  actor = id(4),
  recipient = id(5);
const input = {
  ...scope,
  expectedActorId: actor,
  userId: recipient,
  expectedVersion: 0,
  active: true,
  canExecute: true,
  canReview: false,
  reason: "Tildelt udførelse",
  requestId: id(6),
};
const row = {
  id: id(7),
  action_id: scope.actionId,
  project_id: scope.projectId,
  organization_id: scope.organizationId,
  user_id: recipient,
  version: 1,
  active: true,
  can_execute: true,
  can_review: false,
  reason: input.reason,
  request_id: input.requestId,
  created_by: actor,
  created_at: "2026-10-29T18:00:00Z",
};
describe("request-bound work-order authority", () => {
  const rpc = vi.fn(),
    client = { rpc };
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [row], error: null });
  });
  it("binds exact scope, recipient, version and request without an email or privilege client", async () => {
    expect(await saveWorkOrderAccess(client, actor, input)).toEqual(row);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_work_order_access", {
      p_action_id: scope.actionId,
      p_project_id: scope.projectId,
      p_organization_id: scope.organizationId,
      p_user_id: recipient,
      p_expected_version: 0,
      p_active: true,
      p_can_execute: true,
      p_can_review: false,
      p_reason: input.reason,
      p_request_id: input.requestId,
    });
  });
  it("rejects account changes and caller-supplied authority before any RPC", async () => {
    await expect(saveWorkOrderAccess(client, recipient, input)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      saveWorkOrderAccess(client, actor, { ...input, created_by: recipient }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ project_id: id(90) }, { organization_id: id(90) }, { action_id: id(90) }])(
    "rejects a cross-scope response %j",
    async (change) => {
      rpc.mockResolvedValue({ data: [{ ...row, ...change }], error: null });
      await expect(saveWorkOrderAccess(client, actor, input)).rejects.toMatchObject({
        statusCode: 403,
      });
    },
  );
  it.each([
    { request_id: id(90) },
    { created_by: recipient },
    { user_id: actor },
    { version: 2 },
    { can_review: true },
    { reason: "changed" },
  ])("rejects a mismatched mutation receipt %j", async (change) => {
    rpc.mockResolvedValue({ data: [{ ...row, ...change }], error: null });
    await expect(saveWorkOrderAccess(client, actor, input)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it.each([
    ["40001", 409],
    ["23505", 409],
    ["42501", 403],
    ["23503", 422],
    ["22023", 422],
    ["42P01", 503],
  ])("maps %s without exposing database text", async (code, statusCode) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "private backend details" } });
    await expect(saveWorkOrderAccess(client, actor, input)).rejects.toMatchObject({ statusCode });
    await expect(saveWorkOrderAccess(client, actor, input)).rejects.not.toThrow(
      "private backend details",
    );
  });
  it("rejects a read response for another authenticated caller", async () => {
    rpc.mockResolvedValue({
      data: [{ ...row, can_plan: false, can_manage_access: false, user_id: recipient }],
      error: null,
    });
    await expect(getWorkOrderAccess(client, actor, scope)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it("initializes an existing action identity with a fixed request", async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    const result = await initializeWorkOrder(client, actor, {
      ...scope,
      expectedActorId: actor,
      expectedVersion: 0,
      requestId: input.requestId,
    });
    expect(result.action_id).toBe(scope.actionId);
    expect(rpc.mock.calls[0][0]).toBe("initialize_work_order");
  });
  it("requires a reason, real booleans and a consistent revocation", () => {
    for (const change of [
      { reason: " " },
      { canExecute: "true" },
      { expectedVersion: -1 },
      { expectedVersion: 2147483647 },
      { active: false, canExecute: true },
      { active: false, canReview: true },
    ])
      expect(SaveWorkOrderAccessSchema.safeParse({ ...input, ...change }).success).toBe(false);
    expect(
      SaveWorkOrderAccessSchema.parse({
        ...input,
        active: false,
        canExecute: false,
        canReview: false,
        reason: " Adgang afsluttet ",
      }).reason,
    ).toBe("Adgang afsluttet");
  });
});
describe("bounded task assignment history", () => {
  const rpc = vi.fn(),
    client = { rpc };
  const historyInput = { ...scope, userId: recipient, beforeVersion: null, pageSize: 1 };
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [], error: null });
  });
  it("distinguishes an empty subject/history list from an unavailable service", async () => {
    expect(await getWorkOrderAccessHistory(client, actor, historyInput)).toEqual({
      items: [],
      nextBeforeVersion: null,
    });
    expect(
      await getWorkOrderAccessSubjects(client, actor, { ...scope, afterUserId: null, pageSize: 1 }),
    ).toEqual({ items: [], nextAfterUserId: null });
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "private scope details" },
    });
    await expect(getWorkOrderAccessHistory(client, actor, historyInput)).rejects.toMatchObject({
      statusCode: 403,
      message: "Arbejdsopgaven er ikke tilgængelig.",
    });
  });
  it("passes bounded scope and returns a lookahead cursor without dropping the last shown revision", async () => {
    rpc.mockResolvedValue({ data: [{ ...row, version: 2 }, row], error: null });
    expect(await getWorkOrderAccessHistory(client, actor, historyInput)).toEqual({
      items: [{ ...row, version: 2 }],
      nextBeforeVersion: 2,
    });
    expect(rpc).toHaveBeenCalledWith("get_work_order_access_history", {
      p_action_id: scope.actionId,
      p_project_id: scope.projectId,
      p_organization_id: scope.organizationId,
      p_user_id: recipient,
      p_before_version: null,
      p_page_size: 1,
    });
  });
  it.each([
    { ...row, user_id: actor },
    { ...row, project_id: id(90) },
    { ...row, organization_id: id(90) },
    { ...row, action_id: id(90) },
  ])("rejects substituted target or scope %j", async (value) => {
    rpc.mockResolvedValue({ data: [value], error: null });
    await expect(getWorkOrderAccessHistory(client, actor, historyInput)).rejects.toBeInstanceOf(
      Error,
    );
  });
  it("rejects repeated, unordered and out-of-cursor revisions", async () => {
    for (const rows of [
      [row, row],
      [row, { ...row, version: 2 }],
    ]) {
      rpc.mockResolvedValue({ data: rows, error: null });
      await expect(getWorkOrderAccessHistory(client, actor, historyInput)).rejects.toMatchObject({
        statusCode: 503,
      });
    }
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect(
      getWorkOrderAccessHistory(client, actor, { ...historyInput, beforeVersion: 1 }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("paginates subject IDs with a strict unique cursor", async () => {
    rpc.mockResolvedValue({ data: [{ user_id: id(5) }, { user_id: id(6) }], error: null });
    expect(
      await getWorkOrderAccessSubjects(client, actor, {
        ...scope,
        afterUserId: id(4),
        pageSize: 1,
      }),
    ).toEqual({ items: [id(5)], nextAfterUserId: id(5) });
    for (const rows of [
      [{ user_id: id(4) }],
      [{ user_id: id(6) }, { user_id: id(5) }],
      [{ user_id: "not-an-id" }],
    ]) {
      rpc.mockResolvedValue({ data: rows, error: null });
      await expect(
        getWorkOrderAccessSubjects(client, actor, { ...scope, afterUserId: id(4), pageSize: 1 }),
      ).rejects.toMatchObject({ statusCode: 503 });
    }
  });
  it("rejects unbounded and unauthenticated history before the RPC", async () => {
    await expect(
      getWorkOrderAccessHistory(client, actor, { ...historyInput, pageSize: 10000 }),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      getWorkOrderAccessSubjects(client, "", { ...scope, afterUserId: null, pageSize: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
