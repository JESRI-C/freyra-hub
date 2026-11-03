// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWorkOrderPlan, emptyWorkOrderWatercourse } from "@/lib/work-order-plan";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  actions: vi.fn(),
  history: vi.fn(),
  save: vi.fn(),
  createSeries: vi.fn(),
  shiftSeries: vi.fn(),
  cancelSeries: vi.fn(),
  schedule: vi.fn(),
  followUps: vi.fn(),
  members: vi.fn(),
  sites: vi.fn(),
  centerlines: vi.fn(),
  blocker: vi.fn(),
  visitResults: vi.fn(),
  visitHistoryFilter: vi.fn(),
  visitHistory: vi.fn(),
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  scope = { projectId: id(2), organizationId: id(3) },
  actionId = id(4);
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
}));
vi.mock("@/lib/work-order-prerequisite.functions", () => ({
  getWorkOrderPrerequisite: vi
    .fn()
    .mockResolvedValue({ version: 0, ready: true, prerequisites: [] }),
  saveWorkOrderPrerequisites: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: m.blocker,
  Link: ({
    children,
    params: _params,
    search: _search,
    to,
    ...props
  }: {
    children: React.ReactNode;
    params?: unknown;
    search?: unknown;
    to: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/field-job-access.functions", () => ({ getFieldJobAccess: m.access }));
vi.mock("@/lib/work-order-plan.functions", () => ({
  getProjectWorkOrderPlanHistory: m.history,
  saveProjectWorkOrderPlan: m.save,
  createProjectWorkOrderSeries: m.createSeries,
  shiftProjectWorkOrderSeries: m.shiftSeries,
  cancelProjectWorkOrderSeries: m.cancelSeries,
}));
vi.mock("@/services/field-job-cards-service", () => ({
  listFieldJobActions: m.actions,
  listFieldJobSchedule: m.schedule,
}));
vi.mock("../useWorkOrderPeople", () => ({
  useWorkOrderPeople: () => ({ data: [], isError: false }),
  MoreWorkOrderPeople: () => null,
}));
vi.mock("@/lib/supabase/client", () => ({
  createActorBoundSupabaseClient: () => ({
    rpc: (_name: string, params: unknown) => ({
      abortSignal: () => m.visitResults(params),
    }),
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (name: string, value: string) => {
          m.visitHistoryFilter(name, value);
          return query;
        },
        lt: () => query,
        order: () => query,
        limit: () => query,
        abortSignal: () =>
          table === "work_order_plan_versions" ? m.followUps() : m.visitHistory(),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/supabase/queries", () => ({ fetchSitesByProject: m.sites }));
vi.mock("@/services/watercourse-service", () => ({ getWatercourseVersions: m.centerlines }));
vi.mock("../WorkOrderAccessPanel", () => ({ WorkOrderAccessPanel: () => null }));
vi.mock("../WorkOrderAssignmentPanel", () => ({ WorkOrderAssignmentPanel: () => null }));
vi.mock("../WorkOrderStatusPanel", () => ({ WorkOrderStatusPanel: () => null }));
vi.mock("@/components/maps/MapEditorMap", () => ({
  MapEditorMap: ({
    locationPoints,
  }: {
    locationPoints: Array<{ visitNumber: number; label: string }>;
  }) => (
    <div data-testid="visit-markers">
      {locationPoints.map((point) => point.visitNumber + ". " + point.label).join(", ")}
    </div>
  ),
}));
import { WorkOrderPlansPanel } from "../WorkOrderPlansPanel";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
const row = () => ({
  id: id(6),
  action_id: actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  version: 1,
  plan: {
    ...emptyWorkOrderPlan("Synthetic visit"),
    profile: "watercourse" as const,
    watercourse: {
      ...emptyWorkOrderWatercourse(),
      bottomWidthM: 0,
      measurementSource: "Synthetic measuring source",
    },
  },
  request_id: id(5),
  correction_reason: "",
  created_by: actor,
  created_at: "2026-10-29T18:00:00Z",
});
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
async function open(
  edit = true,
  openReschedule: React.ComponentProps<typeof WorkOrderPlansPanel>["openReschedule"] = false,
  planSource?: ReturnType<typeof row>,
) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderPlansPanel
          scope={scope}
          openReschedule={openReschedule}
          planSource={planSource}
        />
      </QueryClientProvider>,
    ),
  );
  await settle();
  await settle();
  const select = host.querySelector("select")!;
  await act(async () => {
    select.value = actionId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  await settle();
  if (edit)
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent?.includes("Rediger plan som ny version"))!
        .click(),
    );
}
async function fill(label: string, value: string) {
  const el = Array.from(host.querySelectorAll("label"))
    .find((l) => l.textContent?.startsWith(label))!
    .querySelector("input,textarea")! as HTMLInputElement | HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return el;
}
async function save() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  m.access.mockResolvedValue({
    userId: actor,
    projectId: scope.projectId,
    canConfigure: true,
    canContribute: true,
  });
  m.actions.mockResolvedValue([{ id: actionId, title: "Synthetic visit", status: "Åben" }]);
  m.history.mockResolvedValue({ items: [row()], nextBeforeVersion: null });
  m.members.mockResolvedValue([]);
  m.sites.mockResolvedValue([]);
  m.centerlines.mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("work-order plan editor", () => {
  it("previews monthly repeats from the original day after a short month", async () => {
    const source = row();
    source.plan = { ...source.plan, plannedStart: "2026-12-01" };
    m.history.mockResolvedValue({ items: [source], nextBeforeVersion: null });
    await open(false);
    const select = [...host.querySelectorAll("label")]
      .find((label) => label.textContent?.startsWith("Gentagelse"))!
      .querySelector("select")!;
    const count = [...host.querySelectorAll("label")]
      .find((label) => label.textContent?.startsWith("Antal opgaver"))!
      .querySelector("select")!;
    await act(async () => {
      select.value = "monthly";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      count.value = "3";
      count.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await fill("Første dato", "2027-01-31");
    const dates = host.querySelector('[aria-label="Datoer for nye opgaver"]');
    expect([...dates!.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "31. jan. 2027",
      "28. feb. 2027",
      "31. mar. 2027",
    ]);
  });

  it("distinguishes follow-ups with the same title using their current calendar dates", async () => {
    m.access.mockResolvedValue({
      userId: actor,
      projectId: scope.projectId,
      canConfigure: true,
      canManageAvailability: true,
    });
    m.followUps.mockResolvedValue({
      data: [42, 41, 43].map((n) => ({
        id: id(n + 10),
        action_id: id(n),
        title: "Gentaget tilsyn",
        series:
          n === 43
            ? null
            : { series_id: id(80), cadence: "weekly", position: n - 40, member_count: 2 },
        source_plan_version: 1,
      })),
    });
    m.schedule.mockResolvedValue({
      [id(41)]: { planVersionId: id(61), start: "2026-11-08", end: null },
      [id(42)]: { planVersionId: id(62), start: "2026-11-15", end: "2026-11-16" },
    });
    await open(false);
    const summary = [...host.querySelectorAll("summary")].find(
      (item) => item.textContent === "Opfølgende opgaver",
    )!;
    await act(async () => summary.click());
    await settle();
    await settle();
    const links = [...summary.parentElement!.querySelectorAll("a")];
    expect(links).toHaveLength(3);
    expect(summary.parentElement!.textContent).toContain("Hver uge · 2 opgaver");
    expect(links[0].textContent).toContain("1. Gentaget tilsyn");
    expect(links[2].textContent).toContain("Ingen planlagt dato");
    expect(links[0].textContent).toContain("8. nov. 2026");
    expect(links[1].textContent).toContain("15. nov. 2026 – 16. nov. 2026");
    expect(links[1].textContent).toContain("Bygger på planversion 1");
    const move = [...summary.parentElement!.querySelectorAll("button")].find(
      (button) => button.textContent === "Flyt hele serien",
    )!;
    await act(async () => move.click());
    await fill("Antal kalenderdage", "2");
    await fill("Årsag til flytningen", "Flyttes to dage");
    expect(host.querySelector('[aria-label="Nye datoer for serien"]')?.textContent).toContain(
      "17. nov. 2026 – 18. nov. 2026",
    );
    m.shiftSeries.mockResolvedValue(2);
    const save = [...summary.parentElement!.querySelectorAll("button")].find(
      (button) => button.textContent === "Gem nye datoer",
    )!;
    await act(async () => save.click());
    expect(m.shiftSeries.mock.calls[0][0].data).toMatchObject({
      seriesId: id(80),
      expectedPlans: { [id(41)]: id(61), [id(42)]: id(62) },
      days: 2,
      reason: "Flyttes to dage",
    });
    const cancel = [...summary.parentElement!.querySelectorAll("button")].find(
      (button) => button.textContent === "Aflys hele serien",
    )!;
    await act(async () => cancel.click());
    expect(m.cancelSeries).not.toHaveBeenCalled();
    await fill("Årsag til aflysningen", "Tilsyn aflyst");
    m.cancelSeries.mockResolvedValue(2);
    const confirm = [...summary.parentElement!.querySelectorAll("button")].find(
      (button) => button.textContent === "Bekræft aflysning",
    )!;
    await act(async () => confirm.click());
    expect(m.cancelSeries.mock.calls[0][0].data).toMatchObject({
      seriesId: id(80),
      expectedPlans: { [id(41)]: id(61), [id(42)]: id(62) },
      reason: "Tilsyn aflyst",
    });
  });

  it("previews weekly periods and retries a lost reply using the original request id", async () => {
    const source = row();
    source.plan = { ...source.plan, plannedStart: "2026-03-20", plannedEnd: "2026-03-22" };
    m.history.mockResolvedValue({ items: [source], nextBeforeVersion: null });
    m.createSeries
      .mockRejectedValueOnce(new Error("Lost reply"))
      .mockResolvedValueOnce([id(41), id(42)]);
    await open(false);
    await fill("Første dato", "2026-03-27");
    expect(host.querySelector('[aria-label="Datoer for nye opgaver"]')?.textContent).toContain(
      "3. apr. 2026 – 5. apr. 2026",
    );
    const button = Array.from(host.querySelectorAll("button")).find(
      (item) => item.textContent === "Opret 2 opgaver",
    )!;
    await act(async () => button.click());
    expect(host.textContent).toContain("Serien kunne ikke bekræftes");
    await act(async () => button.click());
    expect(m.createSeries).toHaveBeenCalledTimes(2);
    expect(m.createSeries.mock.calls[1]).toEqual(m.createSeries.mock.calls[0]);
    expect(m.createSeries.mock.calls[0][0].data.sourcePlanVersionId).toBe(source.id);
    expect(host.textContent).toContain("2 arbejdsopgaver er oprettet");
  });

  it("filters pending visits while preserving their saved stop number", async () => {
    const saved = row();
    m.history.mockResolvedValue({
      items: [
        {
          ...saved,
          plan: {
            ...saved.plan,
            visitStops: [
              { siteId: id(20), name: "Gennemført stop" },
              { siteId: id(21), name: "Åbent stop" },
              { siteId: id(22), name: "Sprunget stop" },
            ],
          },
        },
      ],
      nextBeforeVersion: null,
    });
    m.visitResults.mockResolvedValue({
      data: [
        {
          id: id(30),
          site_id: id(20),
          version: 1,
          outcome: "visited",
          note: "",
          created_by: actor,
        },
        {
          id: id(31),
          site_id: id(22),
          version: 1,
          outcome: "skipped",
          note: "Låst port",
          created_by: actor,
        },
      ],
    });
    await open(false);
    const panel = host.querySelector('[aria-label="Besøgsstatus"]')!;
    expect(panel.textContent).toContain("1 gennemført · 1 sprunget over · 1 uden udfald");
    const filter = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => filter.click());
    const stops = [...panel.querySelectorAll("li")];
    expect(stops).toHaveLength(1);
    expect(stops[0].textContent).toContain("Åbent stop");
    expect(stops[0].value).toBe(2);
    await act(async () => filter.click());
    expect(panel.querySelectorAll("li")).toHaveLength(3);
  });

  it("opens corrected visit history for the selected old plan only", async () => {
    const old = row();
    m.history.mockResolvedValue({
      items: [
        { ...old, id: id(9), version: 2 },
        { ...old, plan: { ...old.plan, visitStops: [{ siteId: id(21), name: "Tidligere stop" }] } },
      ],
      nextBeforeVersion: null,
    });
    m.visitResults.mockResolvedValue({
      data: [
        {
          id: id(22),
          site_id: id(21),
          version: 2,
          outcome: "skipped",
          note: "Låst port",
          created_by: actor,
        },
      ],
    });
    m.visitHistory.mockResolvedValue({
      data: [
        {
          id: id(23),
          site_id: id(21),
          version: 1,
          outcome: "visited",
          note: "",
          created_by: actor,
          created_at: "2026-11-03T09:00:00Z",
        },
      ],
    });
    await open(false);
    expect(m.visitResults).not.toHaveBeenCalled();
    const button = [...host.querySelectorAll("button")].find(
      (item) => item.textContent === "Se besøg fra denne plan",
    )!;
    await act(async () => button.click());
    await settle();
    expect(m.visitResults).toHaveBeenCalledWith(
      expect.objectContaining({ p_plan_version_id: old.id }),
    );
    expect(host.textContent).toContain("Tidligere planversion 1");
    expect(host.textContent).toContain("Sprunget over · Version 2");
    expect(m.visitHistory).not.toHaveBeenCalled();
    const details = [...host.querySelectorAll("summary")].find((summary) =>
      summary.textContent?.includes("Tidligere udfald (1)"),
    )!.parentElement as HTMLDetailsElement;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle", { bubbles: true }));
    });
    await settle();
    expect(m.visitHistoryFilter).toHaveBeenCalledWith("plan_version_id", old.id);
    expect(m.visitHistoryFilter).toHaveBeenCalledWith("site_id", id(21));
    expect(host.textContent).toContain("Gennemført · Version 1");
    expect(host.querySelector("time")?.dateTime).toBe("2026-11-03T09:00:00Z");
  });

  it("opens the saved visit map without shifting numbers when a position is missing", async () => {
    const saved = row();
    m.history.mockResolvedValue({
      items: [
        {
          ...saved,
          plan: {
            ...saved.plan,
            siteId: id(20),
            visitStops: [{ siteId: id(21), name: "Gemt stopnavn" }],
          },
        },
      ],
      nextBeforeVersion: null,
    });
    m.sites.mockResolvedValue([
      { id: id(20), name: "Hovedsted" },
      {
        id: id(21),
        name: "Nyt navn",
        geometry_geojson: { type: "Point", coordinates: [9.4, 55.2] },
      },
    ]);
    await open(false);
    expect(host.querySelector('[data-testid="visit-markers"]')).toBeNull();
    const details = [...host.querySelectorAll("summary")].find(
      (summary) => summary.textContent === "Vis besøg på kort",
    )!.parentElement as HTMLDetailsElement;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle", { bubbles: true }));
    });
    await settle();
    expect(host.textContent).toContain("Hovedsted · Ingen kortposition");
    expect(host.querySelector('[data-testid="visit-markers"]')?.textContent).toBe(
      "2. Gemt stopnavn",
    );
  });

  it("saves a Danish decimal time estimate on the exact plan version", async () => {
    await open();
    await fill("Estimeret arbejdstid", "2,75");
    await fill("Årsag til planændring", "Arbejdstid estimeret");
    m.save.mockResolvedValue({
      ...row(),
      plan: { ...row().plan, estimatedHours: 2.75 },
      version: 2,
    });
    await save();
    expect(m.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expectedVersion: 1,
        plan: { ...row().plan, estimatedHours: 2.75 },
      }),
    });
  });
  it("opens the exact saved source plan only on request", async () => {
    const source = {
      ...row(),
      id: id(80),
      action_id: id(81),
      plan: { ...row().plan, title: "Historisk kildeplan" },
    };
    const target = {
      ...row(),
      source_plan_version_id: source.id,
      source_action_id: source.action_id,
      source_plan_version: 1,
    };
    m.history.mockImplementation(async ({ data }) => ({
      items: [data.actionId === source.action_id ? source : target],
      nextBeforeVersion: null,
    }));
    await open(false);
    expect(m.history.mock.calls.every(([input]) => input.data.actionId === actionId)).toBe(true);
    const summary = [...host.querySelectorAll("summary")].find((node) =>
      node.textContent?.includes("Vis gemt kildeplan"),
    )!;
    await act(async () => summary.click());
    await settle();
    expect(m.history).toHaveBeenCalledWith({
      data: { ...scope, actionId: source.action_id, beforeVersion: 2, pageSize: 1 },
    });
    await vi.waitFor(async () => {
      await settle();
      expect(host.textContent).toContain("Historisk kildeplan · plan version 1");
    });
  });
  it("reuses the planning details for a follow-up without copying dates or responsibility", async () => {
    const source = row();
    Object.assign(source.plan, {
      instructions: "Synthetic mowing instructions",
      plannedStart: "2026-11-10",
      plannedEnd: "2026-11-12",
      responsibleId: actor,
    });
    m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
    await open(false, false, source);
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Opret arbejdsopgavens plan")!
        .click(),
    );
    m.save.mockResolvedValue(row());
    await save();
    expect(m.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expectedVersion: 0,
        sourcePlanVersionId: source.id,
        plan: expect.objectContaining({
          instructions: source.plan.instructions,
          profile: "watercourse",
          watercourse: source.plan.watercourse,
          plannedStart: null,
          plannedEnd: null,
          responsibleId: null,
        }),
      }),
    });
  });
  it("reschedules a saved plan without changing the work instructions or measurements", async () => {
    await open(false, true);
    expect(host.querySelector("form")?.textContent).toContain("Omplanlæg datoer");
    expect(host.querySelector("form")?.textContent).not.toContain("Arbejdsinstruktion");
    await fill("Planlagt fra", "2026-11-11");
    await fill("Planlagt til", "2026-11-13");
    await fill("Årsag til planændring", "Omplanlagt i kalenderen");
    const plan = { ...row().plan, plannedStart: "2026-11-11", plannedEnd: "2026-11-13" };
    m.save.mockResolvedValue({ ...row(), plan, version: 2 });
    await save();
    expect(m.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expectedVersion: 1,
        plan,
        correctionReason: "Omplanlagt i kalenderen",
      }),
    });
  });
  it.each([true, false])("prefills a suggestion only on its source plan (%s)", async (current) => {
    await open(false, {
      planVersionId: current ? row().id : "older-plan",
      start: "2026-11-11",
    });
    const start = host.querySelector<HTMLInputElement>('form input[type="date"]');
    expect(start?.value).toBe(current ? "2026-11-11" : "");
    expect(m.save).not.toHaveBeenCalled();
  });
  it("reopens unknown plan dates and measured zero without turning them into actual execution", async () => {
    await open();
    expect(
      [...host.querySelectorAll<HTMLInputElement>('input[type="date"]')].every(
        (i) => i.value === "",
      ),
    ).toBe(true);
    expect(
      Array.from(host.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')).some(
        (i) => i.value === "0",
      ),
    ).toBe(true);
    expect(host.textContent).toContain("Åbn faktisk udførelse og feltregistrering");
    expect(m.blocker.mock.calls.at(-1)?.[0].enableBeforeUnload).toBe(true);
  });
  it("preserves the opening revision and edits across a newer background result", async () => {
    await open();
    await fill("Arbejdsinstruktion", "My unfinished instruction");
    await fill("Årsag til planændring", "Clarified plan");
    await act(async () =>
      cache.setQueryData(["work-order-plan-history", actor, scope, actionId], {
        items: [
          { ...row(), version: 2, plan: { ...row().plan, instructions: "Other person's update" } },
        ],
        nextBeforeVersion: null,
      }),
    );
    expect(
      Array.from(host.querySelectorAll("textarea")).some(
        (i) => i.value === "My unfinished instruction",
      ),
    ).toBe(true);
    m.save.mockRejectedValue(new Error("Opgaven er ændret. Genindlæs før du gemmer."));
    await save();
    expect(m.save.mock.calls[0][0].data.expectedVersion).toBe(1);
    expect(host.textContent).toContain("Opgaven er ændret");
    expect(
      Array.from(host.querySelectorAll("textarea")).some(
        (i) => i.value === "My unfinished instruction",
      ),
    ).toBe(true);
  });
  it("reuses the exact mutation identity after a lost response", async () => {
    await open();
    await fill("Årsag til planændring", "Clarified plan");
    m.save.mockRejectedValue(new Error("Connection lost"));
    await save();
    await save();
    const first = m.save.mock.calls[0][0].data,
      second = m.save.mock.calls[1][0].data;
    expect(second).toEqual(first);
    expect(second.expectedActorId).toBe(actor);
    expect(first.plan.plannedStart).toBeNull();
  });
  it("keeps readers out of the edit flow", async () => {
    m.access.mockResolvedValue({
      userId: actor,
      projectId: scope.projectId,
      canConfigure: false,
      canContribute: false,
    });
    await open(false);
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Planen redigeres af projektets ansvarlige");
    expect(m.save).not.toHaveBeenCalled();
  });
  it("opens the shared task directly without showing a second task selector", async () => {
    const editing = vi.fn();
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <WorkOrderPlansPanel scope={scope} selectedActionId={actionId} onEditing={editing} />
        </QueryClientProvider>,
      ),
    );
    await settle();
    await settle();
    expect(host.querySelectorAll("select")).toHaveLength(0);
    expect(m.history).toHaveBeenCalledWith({
      data: { ...scope, actionId, beforeVersion: null, pageSize: 20 },
    });
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Rediger plan som ny version")!
        .click(),
    );
    expect(editing).toHaveBeenLastCalledWith(true);
  });
});
