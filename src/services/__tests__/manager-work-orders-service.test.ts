import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyManagerWorkOrderFilters,
  ManagerWorkOrderInputSchema,
  MANAGER_SELECTION_CHANGED_MESSAGE,
  type ManagerWorkOrder,
  type ManagerWorkOrderMapLocation,
} from "@/lib/manager-work-orders";
import { listManagedWorkOrders } from "../manager-work-orders-service";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  organization = id(2),
  project = id(3),
  performer = id(4);
const token = "a".repeat(64);
const input = {
  organizationId: organization,
  expectedActorId: actor,
  filters: emptyManagerWorkOrderFilters(),
  cursor: null,
  pageSize: 2,
  selectionToken: null,
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
  map_locations: [],
  map_unavailable_reason: "no_location",
  map_unavailable_locations: 0,
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
  totals: {
    matchingJobs: items.length,
    mappedJobs: items.filter((row) => row.map_locations.length).length,
    unmappedJobs: items.filter((row) => !row.map_locations.length).length,
    positions: items.reduce((sum, row) => sum + row.map_locations.length, 0),
  },
  statusTotals: [...new Set(items.map((row) => row.task_status ?? "untracked"))].map((status) => ({
    status,
    count: items.filter((row) => (row.task_status ?? "untracked") === status).length,
  })),
  waitingJobs: items.filter((row) => row.blocked || row.waiting_for_prerequisites).length,
  laneTotals: Object.fromEntries(
    [
      "open",
      "started",
      "performed",
      "submitted",
      "approved",
      "waiting",
      "correction",
      "cancelled",
      "untracked",
    ].map((lane) => [
      lane,
      items.filter(
        (row) =>
          (row.task_status === "cancelled"
            ? "cancelled"
            : row.blocked || row.waiting_for_prerequisites
              ? "waiting"
              : !row.task_status
                ? "untracked"
                : row.task_status === "returned" || row.task_status === "reopened"
                  ? "correction"
                  : ["started", "performed", "submitted", "approved"].includes(row.task_status)
                    ? row.task_status
                    : "open") === lane,
      ).length,
    ]),
  ),
  selectionToken: token,
});
const point = (n = 50): ManagerWorkOrderMapLocation => ({
  id: `action_site:0:${id(n)}`,
  source: "action_site",
  source_id: id(n),
  source_version_id: null,
  name: "Synthetic stored place",
  archived: false,
  coordinate_source: "site_point",
  sequence: 0,
  geometry: { type: "Point", coordinates: [9.5, 55.3] },
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
      p_selection_token: null,
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
    await listManagedWorkOrders(client, actor, {
      ...input,
      filters,
      cursor: id(8),
      selectionToken: token,
    });
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
      p_selection_token: token,
    });
  });

  it("takes the cursor from the last displayed row and never consumes the sentinel", async () => {
    rpc.mockResolvedValue({ data: [receipt([row(10), row(11), row(12)])], error: null });
    expect(await listManagedWorkOrders(client, actor, input)).toMatchObject({
      items: [row(10), row(11)],
      nextCursor: id(11),
    });
    rpc.mockResolvedValue({ data: [receipt([row(12)])], error: null });
    expect(
      await listManagedWorkOrders(client, actor, {
        ...input,
        cursor: id(11),
        selectionToken: token,
      }),
    ).toMatchObject({
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
      listManagedWorkOrders(client, actor, { ...input, cursor: id(10), selectionToken: token }),
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
    expect(await listManagedWorkOrders(client, actor, input)).toMatchObject({
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

  it("preserves a full filter total instead of deriving it from one loaded page", async () => {
    const page = receipt([row()]);
    rpc.mockResolvedValue({
      data: [
        {
          ...page,
          totals: { matchingJobs: 120, mappedJobs: 70, unmappedJobs: 50, positions: 95 },
          statusTotals: [{ status: "untracked", count: 120 }],
          laneTotals: { ...page.laneTotals, untracked: 120 },
        },
      ],
      error: null,
    });
    expect(await listManagedWorkOrders(client, actor, input)).toMatchObject({
      items: [row()],
      totals: { matchingJobs: 120, mappedJobs: 70, unmappedJobs: 50, positions: 95 },
    });
  });

  it("keeps unique mapped jobs distinct from multiple exact locations", async () => {
    const mapped = {
      ...row(),
      initialized: true,
      plan_version_id: id(70),
      site_id: id(50),
      map_unavailable_reason: null,
      map_locations: [
        { ...point(), source: "plan_site" as const },
        { ...point(51), source: "plan_visit_stop" as const, sequence: 1 },
      ],
    };
    rpc.mockResolvedValue({ data: [receipt([mapped])], error: null });
    const page = await listManagedWorkOrders(client, actor, input);
    expect(page.totals).toEqual({ matchingJobs: 1, mappedJobs: 1, unmappedJobs: 0, positions: 2 });
    expect(page.items[0].map_locations).toHaveLength(2);
  });

  it.each([
    { type: "Point", coordinates: [Infinity, 55] },
    { type: "Point", coordinates: [9.5, 91] },
    { type: "Point", coordinates: ["9.5", 55] },
    { type: "Point", coordinates: [] },
    {
      type: "LineString",
      coordinates: [
        [9.5, 55],
        [9.5, 55],
      ],
    },
  ])("retains a legitimate job while making malformed geometry explicit %j", async (geometry) => {
    rpc.mockResolvedValue({
      data: [
        {
          ...receipt(),
          items: [{ ...row(), site_id: id(50), map_locations: [{ ...point(), geometry }] }],
        },
      ],
      error: null,
    });
    const page = await listManagedWorkOrders(client, actor, input);
    expect(page.items[0]).toMatchObject({
      action_id: row().action_id,
      map_locations: [],
      map_unavailable_reason: "coordinates_missing_or_invalid",
      map_unavailable_locations: 1,
    });
  });

  it("does not restore a cleared plan site through a legacy action-site location", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          ...receipt(),
          items: [
            { ...row(), initialized: true, plan_version_id: id(71), map_locations: [point()] },
          ],
        },
      ],
      error: null,
    });
    expect((await listManagedWorkOrders(client, actor, input)).items[0]).toMatchObject({
      map_locations: [],
      map_unavailable_locations: 1,
    });
  });

  it("requires a continuation token before the RPC", async () => {
    await expect(
      listManagedWorkOrders(client, actor, { ...input, cursor: id(8) }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a changed receipt token instead of appending mixed rows", async () => {
    await expect(
      listManagedWorkOrders(client, actor, {
        ...input,
        cursor: id(8),
        selectionToken: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: MANAGER_SELECTION_CHANGED_MESSAGE });
  });

  it("preserves a stable selection-change message through the transport error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "Private database detail" },
    });
    await expect(listManagedWorkOrders(client, actor, input)).rejects.toMatchObject({
      code: "conflict",
      statusCode: 409,
      message: MANAGER_SELECTION_CHANGED_MESSAGE,
    });
  });

  it.each([
    { totals: { matchingJobs: 2, mappedJobs: 1, unmappedJobs: 0, positions: 1 } },
    { waitingJobs: 2 },
    {
      statusTotals: [
        { status: "untracked", count: 1 },
        { status: "untracked", count: 0 },
      ],
    },
    { laneTotals: { ...receipt().laneTotals, waiting: 1 } },
  ])("rejects contradictory full-selection summaries %j", async (change) => {
    rpc.mockResolvedValue({ data: [{ ...receipt(), ...change }], error: null });
    await expect(listManagedWorkOrders(client, actor, input)).rejects.toMatchObject({
      statusCode: 503,
    });
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
