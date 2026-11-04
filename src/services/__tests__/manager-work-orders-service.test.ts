import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyManagerWorkOrderFilters,
  ManagerWorkOrderInputSchema,
  type ManagerWorkOrder,
} from "@/lib/manager-work-orders";
import { listManagedWorkOrders } from "../manager-work-orders-service";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  organization = id(2),
  project = id(3),
  performer = id(4);
const input = {
  organizationId: organization,
  expectedActorId: actor,
  filters: emptyManagerWorkOrderFilters(),
  cursor: null,
  pageSize: 2,
};
const row = (n = 10): ManagerWorkOrder => ({
  action_id: id(n),
  organization_id: organization,
  project_id: project,
  project_name: "Synthetic Bykær",
  title: "Synthetic bank clearance",
  legacy_status: "Åben",
  task_status: null,
  blocked: false,
  waiting_for_prerequisites: false,
  initialized: false,
  plan_version_id: null,
  planned_start: null,
  planned_end: null,
  due_date: null,
  site_id: null,
  site_name: null,
  location_note: null,
  plan_responsible_id: null,
  plan_responsible_name: null,
  assignment_id: null,
  assignment_mode: "unassigned",
  candidate_user_ids: [],
  candidate_names: [],
  claimed_by: null,
  claimed_by_name: null,
  assignment_is_current: false,
});
const receipt = (items: ManagerWorkOrder[] = [row()]) => ({
  user_id: actor,
  organization_id: organization,
  items,
  projects: [
    { id: project, name: "Synthetic Bykær" },
    { id: id(5), name: "Synthetic zero-task project" },
  ],
  assignees: [{ id: performer, name: "Synthetic field worker" }],
});

describe("manager work-order read boundary", () => {
  const rpc = vi.fn(),
    client = { rpc };
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [receipt()], error: null });
  });

  it("preserves uninitialized and no-plan actions without inventing a canonical status or assignment", async () => {
    const result = await listManagedWorkOrders(client, actor, input);
    expect(result.items).toEqual([row()]);
    expect(result.projects).toHaveLength(2);
    expect(result.assignees).toEqual(receipt().assignees);
    expect(result.nextCursor).toBeNull();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("list_manager_work_orders", {
      p_organization_id: organization,
      p_project_id: null,
      p_status: "all",
      p_assignment: "all",
      p_assignee_id: null,
      p_search: "",
      p_due_from: null,
      p_due_through: null,
      p_after_action_id: null,
      p_page_size: 2,
    });
  });

  it("passes every filter and cursor to one authenticated RPC before pagination", async () => {
    const filters = {
      projectId: project,
      status: "waiting",
      assignment: "pool",
      assigneeId: performer,
      search: "  50%_Bykær  ",
      dueFrom: "2026-11-01",
      dueThrough: "2026-11-30",
    };
    rpc.mockResolvedValue({ data: [receipt([])], error: null });
    await listManagedWorkOrders(client, actor, { ...input, filters, cursor: id(8) });
    expect(rpc).toHaveBeenCalledWith("list_manager_work_orders", {
      p_organization_id: organization,
      p_project_id: project,
      p_status: "waiting",
      p_assignment: "pool",
      p_assignee_id: performer,
      p_search: "50%_Bykær",
      p_due_from: "2026-11-01",
      p_due_through: "2026-11-30",
      p_after_action_id: id(8),
      p_page_size: 2,
    });
  });

  it("takes the cursor from the last displayed row and never consumes the sentinel", async () => {
    rpc.mockResolvedValue({ data: [receipt([row(10), row(11), row(12)])], error: null });
    expect(await listManagedWorkOrders(client, actor, input)).toMatchObject({
      items: [row(10), row(11)],
      nextCursor: id(11),
    });
    rpc.mockResolvedValue({ data: [receipt([row(12)])], error: null });
    expect(await listManagedWorkOrders(client, actor, { ...input, cursor: id(11) })).toMatchObject({
      items: [row(12)],
      nextCursor: null,
    });
  });

  it("keeps actual assignment distinct from plan responsibility and marks old-plan assignment explicitly", async () => {
    const assigned: ManagerWorkOrder = {
      ...row(),
      initialized: true,
      task_status: "assigned",
      plan_version_id: id(30),
      plan_responsible_id: actor,
      plan_responsible_name: "Synthetic manager",
      assignment_id: id(31),
      assignment_mode: "pool",
      candidate_user_ids: [performer],
      candidate_names: ["Synthetic field worker"],
      claimed_by: performer,
      claimed_by_name: "Synthetic field worker",
      assignment_is_current: false,
    };
    rpc.mockResolvedValue({ data: [receipt([assigned])], error: null });
    expect((await listManagedWorkOrders(client, actor, input)).items[0]).toEqual(assigned);
  });

  it("does not reinterpret the legacy action state as the canonical lifecycle", async () => {
    const item = {
      ...row(),
      initialized: true,
      legacy_status: "Lukket",
      task_status: "returned" as const,
      blocked: true,
    };
    rpc.mockResolvedValue({ data: [receipt([item])], error: null });
    expect((await listManagedWorkOrders(client, actor, input)).items[0]).toMatchObject({
      legacy_status: "Lukket",
      task_status: "returned",
      blocked: true,
    });
  });

  it("accepts historical recurrence UUIDs instead of losing valid legacy actions", async () => {
    const legacyId = "01234567-89ab-0123-0123-0123456789ab";
    rpc.mockResolvedValue({ data: [receipt([{ ...row(), action_id: legacyId }])], error: null });
    expect((await listManagedWorkOrders(client, actor, input)).items[0].action_id).toBe(legacyId);
  });

  it("forbids actor substitution before the database read", async () => {
    await expect(listManagedWorkOrders(client, performer, input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([{ user_id: performer }, { organization_id: id(99) }])(
    "rejects a substituted authenticated receipt %j",
    async (change) => {
      rpc.mockResolvedValue({ data: [{ ...receipt(), ...change }], error: null });
      await expect(listManagedWorkOrders(client, actor, input)).rejects.toMatchObject({
        statusCode: 403,
      });
    },
  );

  it.each([{ organization_id: id(99) }, { project_id: id(99) }])(
    "rejects a foreign item instead of silently dropping it %j",
    async (change) => {
      rpc.mockResolvedValue({ data: [receipt([{ ...row(), ...change }])], error: null });
      await expect(listManagedWorkOrders(client, actor, input)).rejects.toMatchObject({
        statusCode: 403,
      });
    },
  );

  it("rejects a different project despite its presence in the authorized catalog when a project filter was requested", async () => {
    rpc.mockResolvedValue({ data: [receipt([{ ...row(), project_id: id(5) }])], error: null });
    await expect(
      listManagedWorkOrders(client, actor, {
        ...input,
        filters: { ...input.filters, projectId: project },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each([
    [row(10), row(10)],
    [row(11), row(10)],
    [row(10), row(11), row(12), row(13)],
  ])("rejects duplicate, unordered or oversized pages", async (...items) => {
    rpc.mockResolvedValue({ data: [receipt(items)], error: null });
    await expect(listManagedWorkOrders(client, actor, input)).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("rejects a row at or before the supplied cursor", async () => {
    await expect(
      listManagedWorkOrders(client, actor, { ...input, cursor: id(10) }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it.each([
    { assignment_mode: "person" },
    { candidate_user_ids: [performer] },
    { task_status: "planned" },
    { assignment_is_current: true },
    { task_status: "invented-status" },
  ])("rejects contradictory or unknown row contracts %j", async (change) => {
    rpc.mockResolvedValue({
      data: [{ ...receipt(), items: [{ ...row(), ...change }] }],
      error: null,
    });
    await expect(listManagedWorkOrders(client, actor, input)).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("keeps an empty authorized result and its independent catalogs", async () => {
    rpc.mockResolvedValue({ data: [receipt([])], error: null });
    expect(await listManagedWorkOrders(client, actor, input)).toEqual({
      items: [],
      projects: receipt().projects,
      assignees: receipt().assignees,
      nextCursor: null,
    });
  });

  it.each([
    ["42501", 403],
    ["22023", 422],
    ["P0001", 503],
  ])("maps database failure %s without leaking details", async (code, statusCode) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code, message: "Synthetic private database detail" },
    });
    await expect(listManagedWorkOrders(client, actor, input)).rejects.toMatchObject({ statusCode });
  });

  it.each([
    { pageSize: 0 },
    { pageSize: 51 },
    { unexpected: true },
    { filters: { ...input.filters, dueFrom: "2026-11-04", dueThrough: "2026-11-03" } },
    { filters: { ...input.filters, dueFrom: "2026-02-30" } },
    { filters: { ...input.filters, search: "x".repeat(201) } },
  ])("validates bounded input before contacting the database %j", async (change) => {
    expect(ManagerWorkOrderInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
    await expect(
      listManagedWorkOrders(client, actor, { ...input, ...change }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
