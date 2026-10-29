import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LifecycleRequestSchema,
  WorkOrderLifecycleSchema,
  workOrderInstantKey,
} from "@/lib/work-order-lifecycle";
import {
  getWorkOrderLifecycleContext,
  mutateWorkOrderLifecycle,
  saveWorkOrderNote,
  getWorkOrderNoteHistory,
  getWorkOrderLog,
} from "../work-order-lifecycle-service";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  scope = { actionId: id(2), organizationId: id(3), projectId: id(4), expectedActorId: actor },
  time = "2026-10-29T20:40:00.123456Z";
const values = LifecycleRequestSchema.parse({
  operation: "transition",
  targetStatus: "draft",
  planVersionId: id(5),
  assignmentVersionId: null,
  executionRevisionId: null,
});
const state = {
  id: id(6),
  action_id: scope.actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  version: 1,
  operation: "transition",
  status: "draft",
  plan_version_id: id(5),
  assignment_version_id: null,
  execution_revision_id: null,
  started_at: null,
  started_source: null,
  started_by_id: null,
  blocked: false,
  block_reason: null,
  block_owner_id: null,
  block_next_action: null,
  block_due_date: null,
  reason: "",
  request_values: values,
  request_id: id(7),
  created_by: actor,
  created_at: time,
};
const input = { ...scope, expectedVersion: 0, values, requestId: id(7) };
const basis = {
  planVersionId: id(5),
  planVersion: 1,
  assignmentVersionId: null,
  assignmentVersion: null,
  executionRevisionId: null,
  executionVersion: null,
  planGaps: [],
  assignmentValid: false,
  executionGaps: ["execution_missing"],
  documentationGaps: [],
  unknownPlannedDate: true,
  actualDate: null,
  actualMethod: null,
  actualCoverage: null,
};
const context = {
  action_id: scope.actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  user_id: actor,
  state,
  basis,
  context_changed: false,
  can_manage: true,
  can_start: false,
  can_perform: true,
  can_note: true,
};
const noteInput = {
  ...scope,
  noteId: id(10),
  expectedVersion: 0,
  kind: "comment",
  body: "Synthetic work note",
  correctionReason: "",
  planVersionId: id(5),
  assignmentVersionId: null,
  executionRevisionId: null,
  lifecycleVersionId: id(6),
  requestId: id(11),
};
const note = {
  id: id(12),
  note_id: id(10),
  action_id: scope.actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  version: 1,
  kind: "comment",
  body: noteInput.body,
  correction_reason: "",
  plan_version_id: id(5),
  assignment_version_id: null,
  execution_revision_id: null,
  lifecycle_version_id: id(6),
  request_id: id(11),
  created_by: actor,
  created_at: time,
};
const event = {
  key: "note:" + id(12),
  created_at: time,
  created_by: actor,
  kind: "note",
  event_type: "work_order.note_saved",
  source_id: id(12),
  source_version: 1,
  origin: "manual",
  audit_recorded: true,
  detail: {
    noteId: id(10),
    kind: "comment",
    body: noteInput.body,
    reason: "",
    planVersionId: id(5),
    assignmentVersionId: null,
    executionRevisionId: null,
    lifecycleVersionId: id(6),
  },
};
const page = {
  action_id: scope.actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  user_id: actor,
  as_of: "2026-10-29T20:41:00Z",
  items: [event],
  next: null,
};
describe("versioned lifecycle and logbook boundary", () => {
  const rpc = vi.fn(),
    client = { rpc };
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [state], error: null });
  });
  it("sends the operation and exact context through the existing authenticated client", async () => {
    expect(await mutateWorkOrderLifecycle(client, actor, input)).toEqual(state);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mutate_work_order_lifecycle", {
      p_action_id: scope.actionId,
      p_organization_id: scope.organizationId,
      p_project_id: scope.projectId,
      p_expected_version: 0,
      p_values: values,
      p_request_id: id(7),
    });
  });
  it.each([
    { created_by: id(99) },
    { request_id: id(99) },
    { version: 2 },
    { request_values: { ...values, reason: "Forged reason" }, reason: "Forged reason" },
  ])(
    "rejects a mutation receipt with different actor, nonce, version or payload %j",
    async (change) => {
      rpc.mockResolvedValue({ data: [{ ...state, ...change }], error: null });
      await expect(mutateWorkOrderLifecycle(client, actor, input)).rejects.toMatchObject({
        statusCode: 503,
      });
    },
  );
  it("keeps actual start precision and actor separate from server registration time", async () => {
    const r = {
      ...values,
      targetStatus: "started",
      assignmentVersionId: id(20),
      startedAt: "2026-10-08T08:00:00.123456+02:00",
      startedSource: "Synthetic original work log",
    };
    const started = {
      ...state,
      status: "started",
      assignment_version_id: id(20),
      started_at: "2026-10-08T06:00:00.123456Z",
      started_source: r.startedSource,
      started_by_id: actor,
      request_values: { ...r, startedAt: "2026-10-08T06:00:00.123456Z" },
    };
    rpc.mockResolvedValue({ data: [started], error: null });
    expect(await mutateWorkOrderLifecycle(client, actor, { ...input, values: r })).toMatchObject({
      started_at: started.started_at,
      created_at: time,
    });
  });
  it("distinguishes no lifecycle from a read failure and verifies basis changes", async () => {
    rpc.mockResolvedValue({ data: [{ ...context, state: null }], error: null });
    expect((await getWorkOrderLifecycleContext(client, actor, scope)).state).toBeNull();
    rpc.mockResolvedValue({
      data: [{ ...context, basis: { ...basis, planVersionId: id(55), planVersion: 2 } }],
      error: null,
    });
    await expect(getWorkOrderLifecycleContext(client, actor, scope)).rejects.toMatchObject({
      statusCode: 503,
    });
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(getWorkOrderLifecycleContext(client, actor, scope)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it.each([
    { user_id: id(99) },
    { organization_id: id(99) },
    { state: { ...state, project_id: id(99) } },
  ])("pins both lifecycle envelopes and nested scope %j", async (change) => {
    rpc.mockResolvedValue({ data: [{ ...context, ...change }], error: null });
    await expect(getWorkOrderLifecycleContext(client, actor, scope)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it("refuses a changed account before issuing a mutation", async () => {
    await expect(mutateWorkOrderLifecycle(client, id(99), input)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(saveWorkOrderNote(client, id(99), noteInput)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["submitted", "approved", "returned", "reopened"])(
    "does not expose %s as an ordinary lifecycle mutation",
    async (status) => {
      await expect(
        mutateWorkOrderLifecycle(client, actor, {
          ...input,
          values: { ...values, targetStatus: status },
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("requires explicit start source and time, a block owner/next action, and correction reasons", () => {
    for (const v of [
      { ...values, targetStatus: "started" },
      { ...values, operation: "block", targetStatus: null, blockReason: "Synthetic delay" },
      { ...values, operation: "unblock", targetStatus: null },
      { ...values, operation: "confirm" },
      { ...values, targetStatus: "cancelled" },
    ])
      expect(LifecycleRequestSchema.safeParse(v).success).toBe(false);
    expect(
      WorkOrderLifecycleSchema.safeParse({
        ...state,
        status: "started",
        request_values: {
          ...values,
          targetStatus: "started",
          startedAt: "bad date",
          startedSource: "Synthetic",
        },
        started_at: "bad date",
        started_source: "Synthetic",
        started_by_id: actor,
      }).success,
    ).toBe(false);
  });
  it("saves manual notes against their frozen context without inventing a new factual execution", async () => {
    rpc.mockResolvedValue({ data: [note], error: null });
    expect(await saveWorkOrderNote(client, actor, noteInput)).toEqual(note);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "save_work_order_note",
      expect.objectContaining({
        p_note_id: id(10),
        p_lifecycle_version_id: id(6),
        p_plan_version_id: id(5),
        p_body: noteInput.body,
        p_expected_version: 0,
      }),
    );
  });
  it.each([
    { note_id: id(99) },
    { body: "Different content" },
    { lifecycle_version_id: id(99) },
    { created_by: id(99) },
  ])("rejects a note receipt for another version or content %j", async (change) => {
    rpc.mockResolvedValue({ data: [{ ...note, ...change }], error: null });
    await expect(saveWorkOrderNote(client, actor, noteInput)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it("returns bounded descending note history and rejects duplicates", async () => {
    rpc.mockResolvedValue({ data: [{ ...note, version: 2 }, note], error: null });
    expect(
      await getWorkOrderNoteHistory(client, actor, {
        ...scope,
        noteId: id(10),
        beforeVersion: null,
        pageSize: 1,
      }),
    ).toMatchObject({ nextBeforeVersion: 2, items: [expect.objectContaining({ version: 2 })] });
    rpc.mockResolvedValue({ data: [note, note], error: null });
    await expect(
      getWorkOrderNoteHistory(client, actor, {
        ...scope,
        noteId: id(10),
        beforeVersion: null,
        pageSize: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("preserves missing audit evidence as an explicit value in a valid manual note", async () => {
    rpc.mockResolvedValue({
      data: [{ log: { ...page, items: [{ ...event, audit_recorded: false }] } }],
      error: null,
    });
    expect(
      (await getWorkOrderLog(client, actor, { ...scope, cursor: null, pageSize: 20 })).items[0]
        .audit_recorded,
    ).toBe(false);
  });
  it("rejects relabelled manual notes and forged actor/scope on logbook reads", async () => {
    for (const p of [
      { ...page, user_id: id(99) },
      { ...page, project_id: id(99) },
    ]) {
      rpc.mockResolvedValue({ data: [{ log: p }], error: null });
      await expect(
        getWorkOrderLog(client, actor, { ...scope, cursor: null, pageSize: 20 }),
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    rpc.mockResolvedValue({
      data: [{ log: { ...page, items: [{ ...event, origin: "system" }] } }],
      error: null,
    });
    await expect(
      getWorkOrderLog(client, actor, { ...scope, cursor: null, pageSize: 20 }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("keeps PostgreSQL microseconds and stable ordering across logbook pages", async () => {
    const newer = {
      ...event,
      key: "note:" + id(9),
      source_id: id(9),
      created_at: "2026-10-29T20:40:00.123457Z",
    };
    const next = { beforeAt: event.created_at, beforeKey: event.key, asOf: page.as_of };
    rpc.mockResolvedValue({
      data: [{ log: { ...page, items: [newer, event], next } }],
      error: null,
    });
    expect(
      (await getWorkOrderLog(client, actor, { ...scope, cursor: null, pageSize: 2 })).next,
    ).toEqual(next);
    expect(workOrderInstantKey(newer.created_at) - workOrderInstantKey(event.created_at)).toBe(1n);
    rpc.mockResolvedValue({ data: [{ log: { ...page, items: [event, newer] } }], error: null });
    await expect(
      getWorkOrderLog(client, actor, { ...scope, cursor: null, pageSize: 2 }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("pins the continuation cursor, frozen as-of time and strict page boundary", async () => {
    const cursor = { beforeAt: event.created_at, beforeKey: event.key, asOf: page.as_of };
    rpc.mockResolvedValue({ data: [{ log: { ...page, items: [] } }], error: null });
    expect((await getWorkOrderLog(client, actor, { ...scope, cursor, pageSize: 1 })).items).toEqual(
      [],
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "get_work_order_log",
      expect.objectContaining({
        p_as_of: page.as_of,
        p_before_at: event.created_at,
        p_before_key: event.key,
        p_page_size: 1,
      }),
    );
    rpc.mockResolvedValue({ data: [{ log: page }], error: null });
    await expect(
      getWorkOrderLog(client, actor, { ...scope, cursor, pageSize: 1 }),
    ).rejects.toMatchObject({ statusCode: 503 });
    rpc.mockResolvedValue({
      data: [{ log: { ...page, next: { ...cursor, beforeKey: "note:" + id(99) } } }],
      error: null,
    });
    await expect(
      getWorkOrderLog(client, actor, { ...scope, cursor: null, pageSize: 1 }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it.each([
    ["PT409", 409],
    ["42501", 403],
    ["22023", 422],
    ["23503", 422],
    ["23514", 422],
    ["08006", 503],
  ])(
    "maps SQL state %s to %s without treating failures as empty history",
    async (code, statusCode) => {
      rpc.mockResolvedValue({ data: null, error: { code } });
      await expect(mutateWorkOrderLifecycle(client, actor, input)).rejects.toMatchObject({
        statusCode,
      });
    },
  );
});
