// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  actions: vi.fn(),
  schedule: vi.fn(),
  indicators: vi.fn(),
  time: vi.fn(),
  availability: vi.fn(),
  equipment: vi.fn(),
  equipmentAvailability: vi.fn(),
  create: vi.fn(),
  blocker: vi.fn(),
  navigate: vi.fn(),
  actor: "actor" as string | null,
}));
vi.mock("@/lib/supabase/client", () => ({
  createActorBoundSupabaseClient: () => ({
    rpc: (name: string, args: unknown) => ({
      abortSignal:
        name === "is_work_order_equipment_available" ? () => m.equipmentAvailability(args) : m.time,
    }),
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        ilike: () => query,
        then: (resolve: (result: unknown) => void) => Promise.resolve(m.equipment()).then(resolve),
        order: () => query,
        limit: () => query,
        maybeSingle: m.availability,
      };
      return query;
    },
  }),
}));
vi.mock("../WorkOrderTimeSummary", () => ({
  WorkOrderTimeSummary: ({ reviewDate }: { reviewDate?: string }) => (
    <div data-review-date={reviewDate} />
  ),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: m.actor ? { id: m.actor } : null }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: m.blocker,
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => <a href={to + "?" + new URLSearchParams(search)}>{children}</a>,
}));
vi.mock("@/lib/field-job-access.functions", () => ({ getFieldJobAccess: m.access }));
vi.mock("@/services/field-job-cards-service", () => ({
  listFieldJobActions: m.actions,
  listFieldJobSchedule: m.schedule,
}));
vi.mock("@/services/indicators-service", () => ({ getIndicatorsByProject: m.indicators }));
vi.mock("../useWorkOrderPeople", () => ({
  useWorkOrderPeople: () => ({
    data: [{ user_id: "responsible-person", display_name: "Testansvarlig" }],
  }),
}));
vi.mock("@/services/project-workspace-service", () => ({ createProjectAction: m.create }));
function Editor({
  label,
  selectedActionId,
  onEditing,
}: {
  label: string;
  selectedActionId: string;
  onEditing: (value: boolean) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <section aria-label={label}>
      <p>
        {label} · {selectedActionId}
      </p>
      <label>
        {label} kladde
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onEditing(true);
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          setValue("");
          onEditing(false);
        }}
      >
        Fortryd {label}
      </button>
    </section>
  );
}
vi.mock("../ProjectEquipmentBookings", () => ({
  ProjectEquipmentBookings: ({ onOpen }: { onOpen: (id: string) => void }) => (
    <>
      <input aria-label="Søg efter udstyr" type="search" />
      <button type="button" onClick={() => onOpen("first")}>
        Åbn opgavens booking
      </button>
    </>
  ),
}));
vi.mock("../WorkOrderPlansPanel", () => ({
  WorkOrderPlansPanel: (
    props: Parameters<typeof Editor>[0] & {
      openBooking?: boolean;
      openReschedule?: boolean;
      suggestedStart?: string;
      onOpenExecution?: () => void;
      onOpenSubmission?: () => void;
    },
  ) => (
    <>
      <Editor {...props} label="Plan" />
      {props.suggestedStart && <p>Forslag: {props.suggestedStart}</p>}
      {props.openBooking && <p>Bookingpanelet er åbent</p>}
      {props.openReschedule && <p>Datoformularen er åben</p>}
      <button type="button" onClick={props.onOpenExecution}>
        Åbn udførelsesregistreringen
      </button>
      <button type="button" onClick={props.onOpenSubmission}>
        Kontrollér afleveringsgrundlaget
      </button>
    </>
  ),
}));
vi.mock("../FieldJobCardsPanel", () => ({
  FieldJobCardsPanel: (props: Parameters<typeof Editor>[0]) => <Editor {...props} label="Felt" />,
}));
vi.mock("../ActionExecutionPanel", () => ({
  ActionExecutionPanel: (props: Parameters<typeof Editor>[0]) => (
    <Editor {...props} label="Udførelse" />
  ),
}));
vi.mock("../WorkOrderEvidencePanel", () => ({
  WorkOrderEvidencePanel: ({
    actionId,
    ...props
  }: { actionId: string } & Omit<Parameters<typeof Editor>[0], "selectedActionId">) => (
    <Editor {...props} selectedActionId={actionId} label="Dokumentation" />
  ),
}));
import { ProjectWorkOrdersWorkspace, type WorkOrderView } from "../ProjectWorkOrdersWorkspace";
vi.mock("../WorkOrderSubmissionPanel", () => ({
  WorkOrderSubmissionPanel: ({
    actionId,
    onOpenPart,
    ...props
  }: {
    actionId: string;
    onOpenPart?: (part: WorkOrderView, note: { submissionVersion: number; reason: string }) => void;
  } & Omit<Parameters<typeof Editor>[0], "selectedActionId">) => (
    <>
      <Editor {...props} selectedActionId={actionId} label="Aflevering" />
      <button
        type="button"
        onClick={() =>
          onOpenPart?.("evidence", { submissionVersion: 2, reason: "Tilføj foto af afslutningen." })
        }
      >
        Ret dokumentationen
      </button>
    </>
  ),
}));
const scope = { organizationId: "org", projectId: "project" };
const tasks = [
  { id: "first", title: "Første opgave", status: "Åben" },
  { id: "second", title: "Anden opgave", status: "Åben" },
];
it("shows the same-project target and links to its measurement history", async () => {
  const indicatorId = "00000000-0000-4000-8000-000000000009";
  m.actions.mockResolvedValue([{ ...tasks[0], linked_indicator_id: indicatorId }]);
  m.indicators.mockResolvedValue([
    { id: indicatorId, project_id: "foreign-project", label: "Foreign indicator" },
    {
      id: indicatorId,
      project_id: scope.projectId,
      label: "Optalte planter",
      target_value: 0,
      target_direction: "at_most",
      target_unit: "stk.",
    },
  ]);
  await render("first");
  const panel = host.querySelector('[aria-label="Indikator for opgaven"]')!;
  expect(panel.textContent).toContain("Optalte planter");
  expect(panel.textContent).toContain("Højst 0 stk.");
  expect(panel.textContent).not.toContain("Foreign indicator");
  const url = new URL(panel.querySelector("a")!.href);
  expect(Object.fromEntries(url.searchParams)).toEqual({
    tab: "indikatorer",
    task: "first",
    round: "exact-round",
    indicator: indicatorId,
  });
});
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function render(
  task?: string,
  canEdit = true,
  controlled = false,
  initialView?: WorkOrderView,
  initialListView?: "calendar",
) {
  function RouteHarness() {
    const [selected, select] = useState(task);
    return (
      <ProjectWorkOrdersWorkspace
        scope={scope}
        round="exact-round"
        canEdit={canEdit}
        selectedActionId={controlled ? selected : task}
        initialView={initialView}
        initialListView={initialListView}
        onSelectAction={(id) => {
          m.navigate(id);
          if (controlled) select(id);
        }}
      />
    );
  }
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <RouteHarness />
      </QueryClientProvider>,
    ),
  );
  await settle();
  await settle();
}
async function click(text: string) {
  const node = [...host.querySelectorAll("button")].find((button) => button.textContent === text);
  expect(node, text).toBeTruthy();
  await act(async () => node!.click());
  await settle();
}
async function fill(label: string, value: string) {
  const input = [...host.querySelectorAll("label")]
    .find((node) => node.textContent?.startsWith(label))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  m.actor = "actor";
  m.access.mockResolvedValue({ userId: "actor", projectId: "project", canConfigure: true });
  m.actions.mockResolvedValue(tasks);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
it("shows dated work ahead of undated work and opens its existing plan", async () => {
  m.schedule.mockResolvedValue({ second: { start: "2026-11-03", end: "2026-11-05" } });
  await render();
  await click("Planoversigt");
  expect(m.schedule).toHaveBeenCalledWith(scope);
  expect(host.textContent).toContain("Ingen planlagt dato");
  const listed = [...host.querySelectorAll("button")].filter((button) =>
    button.textContent?.includes("Åbn →"),
  );
  expect(listed[0].textContent).toContain(tasks[1].title);
  expect(listed[0].textContent).toContain("3. nov. 2026");
  await act(async () => listed[0].click());
  expect(m.navigate).toHaveBeenCalledWith("second");
});

it("finds undated work from the planning prompt and excludes cancelled tasks", async () => {
  m.schedule.mockResolvedValue({
    first: { start: null, planVersionId: "existing-plan" },
    second: { start: null, cancelled: true },
  });
  await render();
  await click("Planoversigt");
  expect(host.textContent).toContain("1 opgave mangler en startdato");
  await click("Se opgaver uden startdato i hele projektet");
  const rows = [...host.querySelectorAll("button")].filter((button) =>
    button.textContent?.includes("Åbn →"),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain(tasks[0].title);
  await click("Angiv startdato");
  expect(m.navigate).toHaveBeenCalledWith(tasks[0].id);
  expect(host.textContent).toContain("Datoformularen er åben");
});

it("finds waiting tasks across the project from the calendar and clears the filter", async () => {
  m.schedule.mockResolvedValue({
    first: { start: null, end: null, waitingForActionIds: ["second"] },
    second: { start: "2099-01-01", end: null, waitingForActionIds: [] },
  });
  await render();
  await click("Kalender");
  await click("Se afventende opgaver i hele projektet (1)");
  const listedTasks = () =>
    [...host.querySelectorAll("button")].filter((button) => button.textContent?.includes("Åbn →"));
  expect(listedTasks()).toHaveLength(1);
  expect(listedTasks()[0].textContent).toContain(tasks[0].title);
  const filter = [...host.querySelectorAll("label")]
    .find((label) => label.textContent?.includes("Kun opgaver der afventer forudsætninger"))!
    .querySelector("input")!;
  expect(filter.checked).toBe(true);
  await act(async () => filter.click());
  expect(listedTasks()).toHaveLength(2);
});

it("guides project managers from a scheduled task without a responsible person to its plan", async () => {
  m.schedule.mockResolvedValue({
    first: { start: "2099-01-02", end: null },
    second: { start: "2099-01-03", end: null, responsibleId: "responsible-person" },
  });
  await render();
  await click("Planoversigt");
  expect(host.textContent).toContain("1 opgave har en startdato og mangler en ansvarlig i planen.");
  await click("Se opgaver uden ansvarlig");
  expect(host.querySelector("select")?.value).toBe("unassigned");
  expect(host.textContent).not.toContain(tasks[1].title);
  const task = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Mangler ansvarlig i planen"),
  )!;
  await act(async () => task.click());
  expect(m.navigate).toHaveBeenCalledWith("first");
});

it.each([
  ["returned", "Returneret · Afventer rettelse", "Se hvad der skal rettes"],
  ["reopened", "Genåbnet · Klar til rettelse", "Fortsæt rettelsen"],
] as const)(
  "shows %s in the review filter and opens the matching submission",
  async (reviewStatus, statusLabel, action) => {
    m.schedule.mockResolvedValue({
      first: { start: "2099-01-02", end: null, reviewStatus },
      second: { start: "2099-01-03", end: null },
    });
    await render();
    await click("Planoversigt");
    expect(host.textContent).toContain(statusLabel);
    const filter = [...host.querySelectorAll("label")]
      .find((label) =>
        label.textContent?.includes("Kun afleveringer til gennemgang eller rettelse"),
      )!
      .querySelector("input")!;
    await act(async () => filter.click());
    expect(host.textContent).not.toContain(tasks[1].title);
    expect(host.textContent).toContain(tasks[0].title);
    await click(action);
    expect(host.querySelector('[aria-label="Aflevering"]')?.textContent).toContain("first");
  },
);

it("opens the prerequisite plan directly from a waiting task", async () => {
  m.schedule.mockResolvedValue({
    first: { start: "2099-01-02", end: "2099-01-03" },
    second: { start: null, end: null, waitingForActionIds: ["first"] },
  });
  await render();
  await click("Planoversigt");
  expect(host.textContent).toContain("1 opgave afventer, at en forudsætning bliver udført.");
  await click("Se afventende opgaver i hele projektet (1)");
  expect(host.textContent).toContain("Forslag til startdato: 4. jan. 2099");
  const shortcut = host.querySelector<HTMLButtonElement>('button[aria-label^="Åbn forudsætning"]')!;
  expect(shortcut.getAttribute("aria-label")).toContain(tasks[0].title);
  await act(async () => shortcut.click());
  expect(m.navigate).toHaveBeenCalledWith("first");
});

it("shows a known responsible-person overlap before the date suggestion is accepted", async () => {
  m.actions.mockResolvedValue([
    ...tasks,
    { id: "conflict", title: "Tilsyn i mosen", status: "Åben" },
    { id: "cancelled", title: "Aflyst besøg", status: "Åben" },
  ]);
  m.schedule.mockResolvedValue({
    first: { start: "2099-01-02", end: "2099-01-03" },
    second: {
      start: null,
      end: "2099-01-05",
      responsibleId: "person",
      waitingForActionIds: ["first"],
    },
    conflict: { start: "2099-01-05", end: null, responsibleId: "person" },
    cancelled: { start: "2099-01-04", end: null, responsibleId: "person", cancelled: true },
  });
  await render();
  await click("Planoversigt");
  await click("Se afventende opgaver i hele projektet (1)");
  expect(host.textContent).toContain("Forslag til startdato: 4. jan. 2099");
  const overlap = [...host.querySelectorAll("details")].find(
    (node) =>
      node.querySelector("summary")?.textContent === "Den ansvarlige har én overlappende opgave",
  );
  expect(overlap?.textContent).toContain("Tilsyn i mosen");
  expect(overlap?.textContent).not.toContain("Aflyst besøg");
  await click("Åbn Tilsyn i mosen");
  expect(m.navigate).toHaveBeenCalledWith("conflict");
});

it("compares a suggested start day with recorded capacity only when opened", async () => {
  m.access.mockResolvedValue({
    userId: "actor",
    projectId: "project",
    canConfigure: true,
    canManageAvailability: true,
  });
  m.schedule.mockResolvedValue({
    first: { start: "2099-01-02", end: "2099-01-03" },
    second: {
      start: null,
      end: null,
      estimatedHours: 3,
      responsibleId: "responsible-person",
      waitingForActionIds: ["first"],
    },
  });
  m.availability.mockResolvedValue({
    error: null,
    data: { id: "00000000-0000-4000-8000-000000000012", version: 1, hours: 0 },
  });
  await render();
  await click("Planoversigt");
  expect(m.availability).not.toHaveBeenCalled();
  const details = [...host.querySelectorAll("details")].find(
    (node) =>
      node.querySelector("summary")?.textContent ===
      "Se tilgængelig tid på den foreslåede startdag",
  )!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
  await settle();
  expect(details.textContent).toContain("0 timer til rådighed");
  expect(details.textContent).toContain("3 timer over de tilgængelige timer");
  expect(details.textContent).not.toContain("Angiv tilgængelige timer");
});

it("checks selected equipment on the proposed date without a reservation form", async () => {
  const equipmentId = "00000000-0000-4000-8000-000000000012";
  m.access.mockResolvedValue({
    userId: "actor",
    projectId: "project",
    canConfigure: true,
    canManageAvailability: true,
  });
  m.schedule.mockResolvedValue({
    first: { start: "2099-01-02", end: "2099-01-03" },
    second: { start: null, end: null, waitingForActionIds: ["first"] },
  });
  m.equipment.mockReturnValue({
    error: null,
    data: [{ id: equipmentId, name: "Gravemaskine", kind: "machine" }],
  });
  m.equipmentAvailability.mockResolvedValue({ error: null, data: false });
  await render();
  await click("Planoversigt");
  expect(m.equipment).not.toHaveBeenCalled();
  const details = [...host.querySelectorAll("details")].find(
    (node) => node.querySelector("summary")?.textContent === "Kontrollér udstyr for datoforslaget",
  )!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
  await settle();
  const select = details.querySelector("select")!;
  await act(async () => {
    select.value = equipmentId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  expect(m.equipmentAvailability).toHaveBeenCalledWith({
    p_organization_id: scope.organizationId,
    p_project_id: scope.projectId,
    p_action_id: "second",
    p_equipment_id: equipmentId,
    p_starts_on: "2099-01-04",
    p_ends_on: "2099-01-04",
  });
  expect(details.textContent).toContain("Optaget i den valgte periode");
  expect(details.querySelector('button[type="submit"]')).toBeNull();
});

it("shows a task spanning the month boundary and filters it by a planned day", async () => {
  const now = new Date();
  const key = (date: Date) =>
    [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((value) => String(value).padStart(2, "0"))
      .join("-");
  m.schedule.mockResolvedValue({
    second: {
      start: key(new Date(now.getFullYear(), now.getMonth(), 0)),
      end: key(new Date(now.getFullYear(), now.getMonth(), 4)),
      estimatedHours: 10,
      waitingForActionIds: ["first"],
    },
  });
  await render();
  await click("Kalender");
  const plannedDays = [
    ...host.querySelectorAll<HTMLButtonElement>('button[aria-label*="planlagt arbejde"]'),
  ];
  expect(
    plannedDays.every((day) =>
      day.getAttribute("aria-label")?.includes("opgaver afventer forudsætning"),
    ),
  ).toBe(true);
  expect(plannedDays).toHaveLength(4);
  expect(host.textContent).toContain("Estimeret tid i udsnittet · 8 timer");
  await act(async () => plannedDays[2].click());
  expect(host.textContent).toContain("1 planlagt opgave på den valgte dato");
  expect(host.textContent).toContain("Estimeret tid i udsnittet · 2 timer");
  expect(host.textContent).toContain(tasks[1].title);
  expect(host.textContent).toContain("Afventer · " + tasks[0].title);
  const task = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(tasks[1].title),
  )!;
  await act(async () => task.click());
  await click("Tilbage til kalender");
  expect(host.textContent).toContain("1 planlagt opgave på den valgte dato");
  await click("Vis hele måneden");
  expect(host.textContent).toContain("1 planlagt opgave i måneden");
  await click("Se opgaver uden planlagt dato (1)");
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  const undated = [...host.querySelectorAll("button")].filter((button) =>
    button.textContent?.includes("Åbn →"),
  );
  expect(undated).toHaveLength(1);
  expect(undated[0].textContent).toContain(tasks[0].title);
  await act(async () => undated[0].click());
  await click("Tilbage til planoversigt");
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(host.textContent).not.toContain(tasks[1].title);
});

it("filters the calendar task list by title without hiding planned day markers", async () => {
  const today = new Date();
  const day = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  m.schedule.mockResolvedValue({
    first: { start: day, end: day, estimatedHours: 3 },
    second: { start: day, end: day, estimatedHours: 5 },
  });
  await render();
  await click("Kalender");
  await click("I dag");
  await fill("Find opgave", "anden");
  expect(host.textContent).toContain(tasks[1].title);
  expect(host.textContent).not.toContain(tasks[0].title);
  expect(host.textContent).toContain("Estimeret tid i udsnittet · 5 timer");
  await fill("Find opgave", "ukendt titel");
  expect(host.textContent).toContain("0 planlagte opgaver på den valgte dato");
  expect(host.querySelector('button[aria-label*="planlagt arbejde"]')).not.toBeNull();
});

it("returns to today's date and tasks after browsing another month", async () => {
  const today = new Date();
  const day = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  m.schedule.mockResolvedValue({ second: { start: day, end: day } });
  await render();
  await click("Kalender");
  const next = host.querySelector<HTMLButtonElement>('button[aria-label="Næste måned"]')!;
  await act(async () => next.click());
  expect(host.textContent).not.toContain(tasks[1].title);
  await click("I dag");
  expect(host.textContent).toContain("1 planlagt opgave på den valgte dato");
  expect(host.textContent).toContain(tasks[1].title);
  expect(host.textContent).toContain("Valgt dato:");
  expect(host.textContent).toContain("Opret arbejdsopgave på valgt dato");
});

it("filters the dated and undated tasks by plan responsibility", async () => {
  m.schedule.mockResolvedValue({
    second: { start: null, end: null, responsibleId: "responsible-person" },
  });
  await render();
  await click("Planoversigt");
  const filter = host.querySelector<HTMLSelectElement>("select");
  expect(filter).not.toBeNull();
  await act(async () => {
    filter!.value = "responsible-person";
    filter!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain(tasks[1].title);
  expect(host.textContent).not.toContain(tasks[0].title);
  expect(host.textContent).toContain("Ingen planlagt dato");
  await act(async () => {
    filter!.value = "unassigned";
    filter!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain(tasks[0].title);
  expect(host.textContent).not.toContain(tasks[1].title);
});

it("marks only overlapping days for the same responsible person", async () => {
  const now = new Date();
  const month = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0")].join("-");
  m.actions.mockResolvedValue([
    ...tasks,
    { id: "third", title: "Opgave uden overlap", status: "Åben" },
  ]);
  m.schedule.mockResolvedValue({
    first: { start: month + "-02", end: month + "-04", responsibleId: "responsible-person" },
    second: { start: month + "-04", end: null, responsibleId: "responsible-person" },
    third: { start: month + "-04", end: null, responsibleId: "other-person" },
  });
  await render();
  await click("Kalender");
  const overlaps = host.querySelectorAll<HTMLButtonElement>(
    'button[aria-label*="flere opgaver for samme ansvarlige"]',
  );
  expect(overlaps).toHaveLength(1);
  await act(async () => overlaps[0].click());
  expect(host.textContent).toContain("3 planlagte opgaver på den valgte dato");
  const flags = [...host.querySelectorAll("span")].filter(
    (node) => node.textContent === "Flere opgaver samme dag",
  );
  expect(flags).toHaveLength(2);
  const overlapFilter = [...host.querySelectorAll("label")]
    .find((label) => label.textContent?.includes("Vis kun overlappende opgaver på dagen"))!
    .querySelector<HTMLInputElement>("input")!;
  await act(async () => overlapFilter.click());
  expect(host.textContent).toContain("2 planlagte opgaver på den valgte dato");
  expect(host.textContent).not.toContain("Opgave uden overlap");
  expect(
    host.querySelectorAll('button[aria-label*="flere opgaver for samme ansvarlige"]'),
  ).toHaveLength(1);
  await act(async () => overlapFilter.click());
  expect(host.textContent).toContain("Opgave uden overlap");
  const filter = host.querySelector<HTMLSelectElement>("select")!;
  await act(async () => {
    filter.value = "unassigned";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain("0 planlagte opgaver på den valgte dato");
  expect(host.querySelector('button[aria-label*="flere opgaver for samme ansvarlige"]')).toBeNull();
});

it("searches the full project while limiting the rendered task list", async () => {
  m.actions.mockResolvedValue(
    Array.from({ length: 1001 }, (_, n) => ({
      id: "task-" + n,
      title: "Arbejdsopgave " + n,
      status: null,
    })),
  );
  await render();
  expect(host.textContent).toContain("40 af 1001");
  const field = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      field,
      "ARBEJDSOPGAVE 1000",
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const card = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Arbejdsopgave 1000"),
  );
  expect(card).toBeDefined();
  expect(host.textContent).not.toContain("Arbejdsopgave 999");
  await act(async () => card!.click());
  expect(m.navigate).toHaveBeenCalledWith("task-1000");
});

it("opens the calendar directly when the project link specifies it", async () => {
  m.schedule.mockResolvedValue({});
  await render(undefined, true, false, undefined, "calendar");
  expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Kalender");
  expect(m.schedule).toHaveBeenCalledWith(scope);
});
it("opens the selected booking and returns to the same equipment filter", async () => {
  m.access.mockResolvedValue({
    userId: "actor",
    projectId: "project",
    canConfigure: true,
    canManageAvailability: true,
  });
  await render();
  await click("Booking");
  const search = host.querySelector<HTMLInputElement>('input[aria-label="Søg efter udstyr"]')!;
  search.value = "Gravemaskine";
  await click("Åbn opgavens booking");
  expect(m.navigate).toHaveBeenCalledWith("first");
  expect(host.textContent).toContain("Bookingpanelet er åbent");
  await click("Tilbage til bookingoversigt");
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Søg efter udstyr"]')?.value).toBe(
    "Gravemaskine",
  );
});

it("keeps the time search and overrun filter when returning from an opened task", async () => {
  const id = "00000000-0000-4000-8000-000000000012";
  m.actions.mockResolvedValue([{ id, title: "Syntetisk tidsprøve", status: null }]);
  m.access.mockResolvedValue({
    userId: "actor",
    projectId: "project",
    canConfigure: true,
    canManageAvailability: true,
  });
  m.time.mockResolvedValue({
    error: null,
    data: [
      {
        action_id: id,
        title: "Syntetisk tidsprøve",
        minutes: 120,
        entries: 1,
        estimated_hours: 1,
        pending_entries: 1,
        pending_date: "2026-10-29",
      },
    ],
  });
  await render();
  await click("Timer");
  const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  const filter = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      search,
      "tidsprøve",
    );
    search.dispatchEvent(new Event("input", { bubbles: true }));
    filter.click();
  });
  const row = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Syntetisk tidsprøve"),
  )!;
  await act(async () => row.click());
  expect(host.querySelector('[data-review-date="2026-10-29"]')).not.toBeNull();
  await click("Tilbage til timer");
  expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("tidsprøve");
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
});
describe("one task across the project workspaces", () => {
  it("guides an unselected delivery link to the chosen task's submission", async () => {
    await render(undefined, true, true, "submission");
    expect(host.textContent).toContain("Vælg en arbejdsopgave for at åbne dens aflevering");
    const task = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Første opgave"),
    );
    expect(task).toBeTruthy();
    await act(async () => task!.click());
    await settle();
    expect(host.querySelector('section[aria-label="Aflevering"]')?.textContent).toContain("first");
  });
  it("moves to the next step without discarding the current plan draft", async () => {
    await render("first");
    await fill("Plan kladde", "Bevar formålet med indsatsen");
    await click("Videre til feltregistrering →");
    expect(host.querySelector('section[aria-label="Plan"]')?.closest("[hidden]")).not.toBeNull();
    await click("Arbejdsgrundlag");
    expect(host.querySelector<HTMLInputElement>('section[aria-label="Plan"] input')?.value).toBe(
      "Bevar formålet med indsatsen",
    );
    expect(host.querySelector("select")!.disabled).toBe(true);
  });
  it("retains documentation drafts while switching views and does not release another editor's lock", async () => {
    await render("first");
    await fill("Plan kladde", "Planen bevares");
    await click("Dokumentation");
    await fill("Dokumentation kladde", "Koblingen bevares");
    await click("Arbejdsgrundlag");
    await click("Fortryd Plan");
    expect(host.querySelector("select")!.disabled).toBe(true);
    await click("Dokumentation");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Dokumentation"] input')!.value).toBe(
      "Koblingen bevares",
    );
    await click("Fortryd Dokumentation");
    expect(host.querySelector("select")!.disabled).toBe(false);
  });
  it("follows a field return link on the mounted task without discarding an opened editor", async () => {
    const show = async (initialView: WorkOrderView) => {
      await act(async () =>
        root.render(
          <QueryClientProvider client={cache}>
            <ProjectWorkOrdersWorkspace
              scope={scope}
              selectedActionId="second"
              canEdit
              initialView={initialView}
            />
          </QueryClientProvider>,
        ),
      );
      await settle();
      await settle();
    };
    await show("plan");
    await fill("Plan kladde", "Bevar planen");
    await show("field");
    expect(
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Feltregistrering")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Plan"] input')!.value).toBe(
      "Bevar planen",
    );
  });
  it("opens an execution entry link directly in the execution view without mounting the planning editor", async () => {
    await render("second", true, false, "execution");
    expect(host.querySelector('[aria-label="Plan"]')).toBeNull();
    expect(host.querySelector('[aria-label="Udførelse"]')?.textContent).toContain("second");
    expect(
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Udført arbejde")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("keeps the return reason visible while correcting the same task", async () => {
    await render("second", true, false, "submission");
    await click("Ret dokumentationen");
    expect(document.activeElement?.textContent).toBe("Dokumentation");
    const note = () => host.querySelector('aside[aria-label="Mangler ved afleveringen"]');
    expect(note()?.textContent).toContain("Mangler i afleveringsversion 2");
    expect(note()?.textContent).toContain("Tilføj foto af afslutningen.");
    await click("Feltregistrering");
    expect(note()).not.toBeNull();
    await click("Tilbage til afleveringen");
    expect(document.activeElement?.textContent).toBe("Aflevering");
    expect(note()).toBeNull();
  });
  it("opens the exact deep-linked task in all views and retains the round in photo navigation", async () => {
    await render("second");
    expect(host.textContent).toContain("Plan · second");
    expect(host.querySelectorAll("select")).toHaveLength(1);
    expect(host.querySelector('[aria-label="Felt"]')).toBeNull();
    await click("Feltregistrering");
    await click("Arbejdsgrundlag");
    await click("Åbn udførelsesregistreringen");
    expect(document.activeElement?.textContent).toBe("Udført arbejde");
    expect(host.querySelector('[aria-label="Felt"]')?.textContent).toContain("second");
    expect(host.querySelector('[aria-label="Udførelse"]')?.textContent).toContain("second");
    expect(host.querySelector('a[href*="tab=medier"]')?.getAttribute("href")).toContain(
      "task=second",
    );
    expect(host.querySelector('a[href*="tab=medier"]')?.getAttribute("href")).toContain(
      "round=exact-round",
    );
    await click("Arbejdsgrundlag");
    await click("Kontrollér afleveringsgrundlaget");
    expect(document.activeElement?.textContent).toBe("Aflevering");
    expect(host.querySelector('[aria-label="Aflevering"]')?.textContent).toContain("second");
  });
  it("keeps drafts mounted across views, blocks changing task, then releases the lock on cancel", async () => {
    await render("first");
    await fill("Plan kladde", "Bevar den her plan");
    expect(host.querySelector("select")!.disabled).toBe(true);
    await click("Feltregistrering");
    await fill("Felt kladde", "Bevar feltregistrering");
    await click("Arbejdsgrundlag");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Plan"] input')!.value).toBe(
      "Bevar den her plan",
    );
    await click("Fortryd Plan");
    expect(host.querySelector("select")!.disabled).toBe(true);
    await click("Feltregistrering");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Felt"] input')!.value).toBe(
      "Bevar feltregistrering",
    );
    await click("Fortryd Felt");
    expect(host.querySelector("select")!.disabled).toBe(false);
    expect(m.blocker.mock.calls.at(-1)![0].shouldBlockFn()).toBe(false);
  });
  it("changes the shared task and URL without carrying old task drafts to the new task", async () => {
    await render("first", true, true);
    await act(async () => {
      const select = host.querySelector("select")!;
      select.value = "second";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(m.navigate).toHaveBeenCalledWith("second");
    expect(host.textContent).toContain("Plan · second");
    expect(host.textContent).not.toContain("Plan · first");
  });
  it("does not silently substitute another task for an unavailable deep link", async () => {
    await render("from-another-project");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("kunne ikke findes");
    expect(host.querySelector('[aria-label="Plan"]')).toBeNull();
  });
  it("hides project tools when the current access read fails, rather than using cached permissions", async () => {
    m.access.mockRejectedValue(new Error("Synthetic access unavailable"));
    await render("first");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Synthetic access unavailable",
    );
    expect(host.querySelector('[aria-label="Plan"]')).toBeNull();
    expect(m.actions).not.toHaveBeenCalled();
  });
  it("does not expose creation to a read-only project user", async () => {
    await render(undefined, false);
    expect(host.textContent).not.toContain("Opret arbejdsopgave");
    expect(host.textContent).toContain("Første opgave");
  });
  it("preserves an open draft while a failed permission refresh hides the workspace, then restores it on retry", async () => {
    await render("first");
    await fill("Plan kladde", "Må ikke forsvinde ved netfejl");
    m.access.mockRejectedValueOnce(new Error("Synthetic transient permission check"));
    await act(async () => cache.invalidateQueries({ queryKey: ["field-job-access"] }));
    await settle();
    const draft = host.querySelector<HTMLInputElement>('[aria-label="Plan"] input')!;
    expect(draft.value).toBe("Må ikke forsvinde ved netfejl");
    expect(draft.closest("[hidden]")).toBeTruthy();
    await click("Prøv igen");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Plan"] input')).toBe(draft);
    expect(draft.closest("[hidden]")).toBeNull();
    expect(host.querySelector("select")!.disabled).toBe(true);
    await click("Fortryd Plan");
    expect(host.querySelector("select")!.disabled).toBe(false);
  });
  it("passes the selected calendar day to the new task's plan", async () => {
    m.create.mockImplementationOnce(async (_scope, title, _description, id) => {
      m.actions.mockResolvedValue([...tasks, { id, title, status: "Åben" }]);
      return { id, title };
    });
    await render(undefined, true, true);
    await click("Kalender");
    const dateButton = host.querySelector<HTMLButtonElement>("[data-day] button")!;
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), "01"].join("-");
    await act(async () => dateButton.click());
    await click("Opret arbejdsopgave på valgt dato");
    await fill("Hvad skal der udføres?", "Kalenderopgave");
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await settle();
    expect(m.navigate).toHaveBeenLastCalledWith(m.create.mock.calls[0][3]);
    expect(host.textContent).toContain("Forslag: " + date);
  });
  it("reuses the task identity after a lost create reply and selects it after successful recovery", async () => {
    m.create
      .mockRejectedValueOnce(new Error("Synthetic lost reply"))
      .mockImplementationOnce(async (_scope, title, _description, id) => {
        m.actions.mockResolvedValue([...tasks, { id, title, status: "Åben" }]);
        return { id, title };
      });
    await render("first", true, true);
    await click("Opret arbejdsopgave");
    await fill("Hvad skal der udføres?", "Ny kontrolopgave");
    const submit = async () => {
      await act(async () =>
        host
          .querySelector("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
      await settle();
    };
    await submit();
    await submit();
    await settle();
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.create.mock.calls[1]).toEqual(m.create.mock.calls[0]);
    expect(m.navigate).toHaveBeenLastCalledWith(m.create.mock.calls[0][3]);
    expect(host.querySelector("select")!.value).toBe(m.create.mock.calls[0][3]);
    expect(host.textContent).toContain("Plan · " + m.create.mock.calls[0][3]);
  });
});
