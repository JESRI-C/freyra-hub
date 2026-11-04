// @vitest-environment jsdom
import { rememberFollowUpSource, readFollowUpSource } from "@/lib/work-order-follow-up-draft";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWorkOrderPlan, emptyWorkOrderWatercourse } from "@/lib/work-order-plan";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  actions: vi.fn(),
  templates: vi.fn(),
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
  origin: vi.fn(),
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
vi.mock("@/lib/work-order-observation-drafts.functions", () => ({
  getWorkOrderObservationDraft: m.origin,
}));
vi.mock("@/services/field-job-cards-service", () => ({
  listFieldJobActions: m.actions,
  listFieldJobTemplates: m.templates,
  listFieldJobSchedule: m.schedule,
}));
vi.mock("../useWorkOrderPeople", () => ({
  useWorkOrderPeople: () => ({ data: [], isError: false }),
  MoreWorkOrderPeople: () => null,
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
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
    visitSegments,
  }: {
    locationPoints: Array<{ visitNumber: number; label: string }>;
    visitSegments: Array<[[number, number], [number, number]]>;
  }) => (
    <div data-testid="visit-markers" data-segments={JSON.stringify(visitSegments)}>
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
const observationOrigin = (description = "Følg den registrerede engplante før pleje.") => ({
  action_id: actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  user_id: actor,
  created_by: actor,
  created_at: "2026-11-04T12:00:00Z",
  request_id: id(80),
  status: "draft" as const,
  title: "Synthetic visit",
  description,
  sources: [
    {
      observation_id: id(81),
      source_hash: "a".repeat(64),
      media_refs: [],
      snapshot: {
        id: id(81),
        project_id: scope.projectId,
        zone_id: null,
        observation_type: "inspection",
        observed_at: null,
        observer_id: actor,
        species_name: null,
        species_confidence: null,
        count_value: null,
        latitude: null,
        longitude: null,
        accuracy_m: null,
        notes: "Registreret besigtigelse",
        visibility: "hidden",
        status: "draft",
        metadata: null,
        created_at: null,
        updated_at: null,
      },
    },
  ],
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
  suggestedStart?: string,
) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderPlansPanel
          scope={scope}
          openReschedule={openReschedule}
          planSource={planSource}
          suggestedStart={suggestedStart}
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
  sessionStorage.clear();
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
  m.schedule.mockResolvedValue({});
  m.templates.mockResolvedValue([]);
  m.origin.mockReset().mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("work-order plan editor", () => {
  it("carries the checked observation draft description into the first manager plan and save", async () => {
    m.access.mockResolvedValue({
      userId: actor,
      projectId: scope.projectId,
      canConfigure: true,
      canContribute: true,
      canManageAvailability: true,
    });
    m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
    m.origin.mockResolvedValue(observationOrigin());
    m.save.mockImplementation(async ({ data }) => {
      const saved = { ...row(), plan: data.plan };
      m.history.mockResolvedValue({ items: [saved], nextBeforeVersion: null });
      return saved;
    });
    await open(false);
    expect(m.origin).toHaveBeenCalledTimes(1);
    expect(m.origin).toHaveBeenCalledWith({ data: { ...scope, actionId, expectedActorId: actor } });
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Opret arbejdsopgavens plan")!
        .click(),
    );
    const description = [...host.querySelectorAll("label")]
      .find((label) => label.textContent?.startsWith("Beskrivelse"))!
      .querySelector("textarea")!;
    expect(description.value).toBe(observationOrigin().description);
    await save();
    expect(m.save.mock.calls[0][0].data.plan.description).toBe(observationOrigin().description);
  });

  it("waits through pending and failed origin reads before auto-opening the first suggested plan", async () => {
    m.access.mockResolvedValue({
      userId: actor,
      projectId: scope.projectId,
      canConfigure: true,
      canContribute: true,
      canManageAvailability: true,
    });
    m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
    let reject!: (failure: Error) => void;
    m.origin.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    await open(false, false, undefined, "2026-12-01");
    expect(host.querySelector("form")).toBeNull();
    expect(
      [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Opret arbejdsopgavens plan",
      )!.disabled,
    ).toBe(true);
    await act(async () => reject(new Error("Origin read unavailable")));
    await settle();
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Opgavens kildegrundlag kunne ikke kontrolleres");
    m.origin.mockResolvedValue(observationOrigin("Beskrivelse efter kontrolleret genforsøg"));
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Hent kildegrundlag igen")!
        .click(),
    );
    await settle();
    await settle();
    expect(host.querySelector("form")).not.toBeNull();
    expect(
      [...host.querySelectorAll("label")]
        .find((label) => label.textContent?.startsWith("Beskrivelse"))!
        .querySelector("textarea")!.value,
    ).toBe("Beskrivelse efter kontrolleret genforsøg");
    expect(host.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-12-01");
    expect(m.origin).toHaveBeenCalledTimes(2);
  });

  it("allows existing plan edits during origin failure and never overwrites that draft on origin refresh", async () => {
    m.access.mockResolvedValue({
      userId: actor,
      projectId: scope.projectId,
      canConfigure: true,
      canContribute: true,
      canManageAvailability: true,
    });
    const existing = row();
    existing.plan.description = "Den gemte plans beskrivelse";
    m.history.mockResolvedValue({ items: [existing], nextBeforeVersion: null });
    m.origin.mockRejectedValue(new Error("Unavailable"));
    await open();
    const description = await fill("Beskrivelse", "Min ugemte planrettelse");
    m.origin.mockResolvedValue(observationOrigin("Oprindelig kladdebeskrivelse"));
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ["work-order-observation-origin"] });
    });
    await settle();
    expect(description.value).toBe("Min ugemte planrettelse");
  });

  it("leaves editor-only first plan behavior unchanged without requesting the manager origin", async () => {
    m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
    m.origin.mockRejectedValue(new Error("Manager-only origin must not be read by editor"));
    await open(false, false, undefined, "2026-12-01");
    expect(m.origin).not.toHaveBeenCalled();
    expect(
      [...host.querySelectorAll("label")]
        .find((label) => label.textContent?.startsWith("Beskrivelse"))!
        .querySelector("textarea")!.value,
    ).toBe("");
  });

  it("opens an ordinary manager job with an empty description after its authorized null origin", async () => {
    m.access.mockResolvedValue({
      userId: actor,
      projectId: scope.projectId,
      canConfigure: true,
      canContribute: true,
      canManageAvailability: true,
    });
    m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
    await open(false);
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Opret arbejdsopgavens plan")!
        .click(),
    );
    expect(m.origin).toHaveBeenCalledTimes(1);
    expect(
      [...host.querySelectorAll("label")]
        .find((label) => label.textContent?.startsWith("Beskrivelse"))!
        .querySelector("textarea")!.value,
    ).toBe("");
  });
  it("saves the chosen existing template version and preserves it if template loading fails later", async () => {
    const definition = {
      schema: "freyra.field-job-template/v1",
      title: "Habitatbesøg",
      domain: "nature",
      fields: [{ key: "count", label: "Antal", type: "number", required: true, unit: "stk." }],
    };
    m.templates.mockResolvedValue([{ id: id(90), template_id: id(91), version: 2, definition }]);
    m.save.mockImplementation(async ({ data }) => {
      const saved = { ...row(), version: 2, plan: data.plan };
      m.history.mockResolvedValue({ items: [saved], nextBeforeVersion: null });
      return saved;
    });
    await open();
    await settle();
    const select = [...host.querySelectorAll("label")]
      .find((label) => label.textContent?.startsWith("Tilføj påkrævet jobkort"))!
      .querySelector("select")!;
    await act(async () => {
      select.value = id(90);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain("Habitatbesøg · version 2");
    await fill("Årsag til planændring", "Krav valgt til besøget");
    await save();
    expect(m.save.mock.calls[0][0].data.plan.requiredJobCards).toEqual([
      { templateVersionId: id(90), templateId: id(91), version: 2, definition },
    ]);
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent?.includes("Rediger plan som ny version"))!
        .click(),
    );
    m.templates.mockRejectedValue(new Error("Unavailable"));
    await act(async () => cache.invalidateQueries({ queryKey: ["field-job-templates"] }));
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "Jobkort kunne ikke hentes: Unavailable.",
      );
    });
    expect(host.textContent).toContain("Planens gemte krav bevares");
    await fill("Årsag til planændring", "Bevar krav trods netfejl");
    await save();
    expect(m.save.mock.calls.at(-1)![0].data.plan.requiredJobCards).toHaveLength(1);
    expect(host.textContent).toContain("Jobkort der kræves ved aflevering");
  });
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
    const next = [...panel.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Næste stop uden udfald · 2. Åbent stop"),
    );
    expect(next).toBeTruthy();
    await act(async () => next!.click());
    expect(document.activeElement?.textContent).toContain("Åbent stop");
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
            visitStops: [
              { siteId: id(22), name: "Uden position" },
              { siteId: id(21), name: "Gemt stopnavn" },
              { siteId: id(23), name: "Sidste stop" },
            ],
          },
        },
      ],
      nextBeforeVersion: null,
    });
    m.sites.mockResolvedValue([
      { id: id(20), name: "Hovedsted", centroid_lat: 55.1, centroid_lng: 9.3 },
      { id: id(22), name: "Uden position" },
      { id: id(23), name: "Sidste stop", centroid_lat: 55.3, centroid_lng: 9.5 },
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
    expect(host.textContent).toContain("Uden position · Ingen kortposition");
    const markers = host.querySelector('[data-testid="visit-markers"]');
    expect(markers?.textContent).toBe("1. Hovedsted, 3. Gemt stopnavn, 4. Sidste stop");
    expect(markers?.getAttribute("data-segments")).toBe("[[[55.2,9.4],[55.3,9.5]]]");
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const copy = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Kopiér koordinater for Gemt stopnavn"]',
    )!;
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledWith("55.2, 9.4");
    expect(host.textContent).toContain("Koordinater kopieret for Gemt stopnavn.");
    await act(async () => copy.click());
    expect(host.textContent).toContain("Kopiér koordinaterne manuelt fra stoplisten.");
    expect(host.textContent).toContain("55.2, 9.4");
    expect(
      host.querySelector('button[aria-label="Kopiér koordinater for Uden position"]'),
    ).toBeNull();
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
    expect(host.textContent).toContain("Planversion 2 er gemt.");
    const next = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Gå til arbejdsfordeling",
    );
    expect(next).toBeDefined();
    await act(async () => next!.click());
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Tildeling på opgaven"]'));
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
    m.access.mockResolvedValue({
      userId: actor,
      projectId: scope.projectId,
      canConfigure: true,
      canContribute: true,
      canManageAvailability: true,
    });
    m.origin.mockResolvedValue(observationOrigin("Skal ikke erstatte opfølgningsplanen"));
    const source = row();
    Object.assign(source.plan, {
      description: "Beskrivelse fra opfølgningsplanen",
      instructions: "Synthetic mowing instructions",
      plannedStart: "2026-11-10",
      plannedEnd: "2026-11-12",
      responsibleId: actor,
    });
    m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
    await open(false, false, source);
    expect(host.querySelector("form")?.textContent).toContain("Vælg datoer og ansvarlig");
    expect(m.save).not.toHaveBeenCalled();
    m.save.mockResolvedValue(row());
    await save();
    expect(m.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expectedVersion: 0,
        sourcePlanVersionId: source.id,
        plan: expect.objectContaining({
          instructions: source.plan.instructions,
          description: source.plan.description,
          profile: "watercourse",
          watercourse: source.plan.watercourse,
          plannedStart: null,
          plannedEnd: null,
          responsibleId: null,
        }),
      }),
    });
  });
  it("recovers the pinned follow-up plan after reload and clears its pointer after saving", async () => {
    const source = { ...row(), action_id: id(91), version: 3 };
    rememberFollowUpSource(actor, { ...scope, actionId }, source);
    expect(readFollowUpSource(id(92), { ...scope, actionId })).toBeUndefined();
    m.history.mockImplementation(({ data }) =>
      Promise.resolve({
        items: data.actionId === source.action_id ? [source] : [],
        nextBeforeVersion: null,
      }),
    );
    await open(false);
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Fortsæt med opfølgningsplanen")!
        .click(),
    );
    m.save.mockResolvedValue(row());
    await save();
    expect(m.history).toHaveBeenCalledWith({
      data: { ...scope, actionId: source.action_id, beforeVersion: 4, pageSize: 1 },
    });
    expect(m.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourcePlanVersionId: source.id,
        plan: expect.objectContaining({ instructions: source.plan.instructions }),
      }),
    });
    expect(readFollowUpSource(actor, { ...scope, actionId })).toBeUndefined();
  });
  it("opens the first calendar plan as an unsaved draft with the suggested date", async () => {
    m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
    await open(false, false, undefined, "2026-11-12");
    expect(host.querySelector("form")?.textContent).toContain("Ny plan");
    expect(host.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-11-12");
    expect(m.save).not.toHaveBeenCalled();
    const cancel = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Fortryd ændringer",
    );
    await act(async () => cancel!.click());
    expect(host.querySelector("form")).toBeNull();
  });
  it("keeps a saved plan closed when the original calendar suggestion is still present", async () => {
    await open(false, false, undefined, "2026-11-12");
    expect(host.querySelector("form")).toBeNull();
  });
  it("warns about other scheduled work for the responsible person before rescheduling", async () => {
    const plan = {
      ...row().plan,
      responsibleId: actor,
      plannedStart: "2026-11-10",
      plannedEnd: null,
    };
    m.history.mockResolvedValue({ items: [{ ...row(), plan }], nextBeforeVersion: null });
    m.actions.mockResolvedValue([
      { id: actionId, title: "Opgaven der redigeres", status: "Åben" },
      { id: id(90), title: "Tilsyn i mosen", status: "Åben" },
      { id: id(91), title: "Aflyst besøg", status: "Åben" },
      { id: id(92), title: "Tilsyn med anden ansvarlig", status: "Åben" },
    ]);
    const scheduled = {
      start: "2026-11-09",
      end: "2026-11-10",
      responsibleId: actor,
      cancelled: false,
    };
    m.schedule.mockResolvedValue({
      [actionId]: scheduled,
      [id(90)]: scheduled,
      [id(91)]: { ...scheduled, cancelled: true },
      [id(92)]: { ...scheduled, responsibleId: id(99) },
    });
    await open(false, true);
    expect(host.textContent).toContain("Den ansvarlige har én anden opgave i perioden.");
    const details = [...host.querySelectorAll("details")].find(
      (entry) => entry.querySelector("summary")?.textContent === "Se overlappende opgaver",
    );
    expect(details?.querySelectorAll("li")).toHaveLength(1);
    expect(details?.textContent).toContain("Tilsyn i mosen");
    expect(details?.textContent).toContain("9. nov. 2026 – 10. nov. 2026");
    await fill("Planlagt fra", "2026-11-11");
    expect(host.textContent).not.toContain("Den ansvarlige har én anden opgave i perioden.");
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
