// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyManagerWorkOrderFilters, type ManagerWorkOrder } from "@/lib/manager-work-orders";

const m = vi.hoisted(() => ({
  load: vi.fn(),
  actor: "00000000-0000-4000-8000-000000000001" as string | null,
  org: "00000000-0000-4000-8000-000000000002" as string | null,
  loading: false,
  authError: null as string | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: m.actor ? { id: m.actor } : null,
    orgId: m.org,
    loading: m.loading,
    authError: m.authError,
  }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/manager-work-orders.functions", () => ({ listManagerWorkOrders: m.load }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params?: unknown;
    search?: unknown;
    children: React.ReactNode;
  }) => (
    <a
      href={to}
      data-params={JSON.stringify(params)}
      data-search={JSON.stringify(search)}
      {...props}
    >
      {children}
    </a>
  ),
}));
import { ManagerWorkOrders } from "../ManagerWorkOrders";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const task: ManagerWorkOrder = {
  action_id: id(10),
  organization_id: id(2),
  project_id: id(3),
  project_name: "Bykær",
  title: "Pleje langs åen",
  legacy_status: null,
  task_status: "assigned",
  initialized: true,
  blocked: false,
  waiting_for_prerequisites: false,
  plan_version_id: id(11),
  planned_start: "2026-11-04",
  planned_end: "2026-11-06",
  due_date: "2026-11-07",
  site_id: id(12),
  site_name: "Engen",
  location_note: "Ved broen",
  plan_responsible_id: id(13),
  plan_responsible_name: "Pia Projektleder",
  assignment_id: id(14),
  assignment_mode: "person",
  candidate_user_ids: [id(15)],
  candidate_names: ["Frederik Felt"],
  claimed_by: null,
  claimed_by_name: null,
  assignment_is_current: true,
};
const projects = [
  { id: id(3), name: "Bykær" },
  { id: id(4), name: "Mosen uden opgaver" },
];
const assignees = [
  { id: id(15), name: "Frederik Felt" },
  { id: id(16), name: "Frida Felt" },
];
const page = (items: ManagerWorkOrder[], nextCursor: string | null = null) => ({
  items,
  projects,
  assignees,
  nextCursor,
});
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <ManagerWorkOrders />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === text,
  );
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
  await flush();
}
function field(label: string) {
  const element = [...host.querySelectorAll("label")]
    .find((node) => node.firstChild?.textContent?.trim() === label)
    ?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  expect(element, label).toBeTruthy();
  return element!;
}
async function change(label: string, value: string) {
  const element = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  sessionStorage.clear();
  m.actor = id(1);
  m.org = id(2);
  m.loading = false;
  m.authError = null;
  m.load.mockResolvedValue(page([task]));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});

describe("manager work orders across projects", () => {
  it("starts with a bounded Kanban and keeps lifecycle, assignment and plan responsibility distinct", async () => {
    m.load.mockResolvedValue(
      page(
        [
          task,
          { ...task, action_id: id(20), task_status: "started", title: "I felten" },
          { ...task, action_id: id(21), task_status: "performed", title: "Udført pleje" },
          { ...task, action_id: id(22), task_status: "submitted", title: "Til faglig gennemgang" },
          { ...task, action_id: id(23), task_status: "approved", title: "Accepteret arbejde" },
          { ...task, action_id: id(24), task_status: "returned", title: "Mangler foto" },
          { ...task, action_id: id(25), task_status: "reopened", title: "Rettelse er åbnet" },
          {
            ...task,
            action_id: id(26),
            task_status: null,
            initialized: false,
            legacy_status: "Afsluttet i tidligere system",
            title: "Ældre opgave",
            plan_version_id: null,
            assignment_id: null,
            assignment_mode: "unassigned",
            candidate_user_ids: [],
            candidate_names: [],
            assignment_is_current: false,
          },
          { ...task, action_id: id(27), title: "Venter på adgang", blocked: true },
        ],
        id(27),
      ),
    );
    await render();
    expect(host.querySelector('[aria-label="Arbejdsordretavle"]')).not.toBeNull();
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toContain("Kanban");
    expect(host.querySelector('section[aria-label="Afleveret"]')?.textContent).toContain(
      "Til faglig gennemgang",
    );
    expect(host.querySelector('section[aria-label="Godkendt"]')?.textContent).toContain(
      "Accepteret arbejde",
    );
    const correction = host.querySelector('section[aria-label="Til rettelse"]')!;
    expect(correction.textContent).toContain("Returneret");
    expect(correction.textContent).toContain("Genåbnet");
    expect(host.querySelector('section[aria-label="Uden jobstatus"]')?.textContent).toContain(
      "Tidligere status: Afsluttet i tidligere system",
    );
    expect(host.querySelector('section[aria-label="Afventer"]')?.textContent).toContain("Blokeret");
    expect(host.textContent).toContain("9 arbejdsordrer vist");
    expect(host.textContent).toContain("Der er flere resultater");
    const card = host.querySelector('article[aria-label="Pleje langs åen"]')!;
    expect(card.textContent).toContain("Tildelt: Frederik Felt");
    expect(card.textContent).toContain("Ansvarlig i planen: Pia Projektleder");
    expect(card.textContent).toContain("4. nov. 2026");
    expect(card.textContent).toContain("Frist: 7. nov. 2026");
    expect(card.textContent).toContain("Engen");
    expect(host.querySelector('section[aria-label="Aflyste"]')).toBeNull();
    expect(host.querySelector('a[href="/app/projects"]')?.textContent).toContain(
      "Opret i et projekt",
    );
  });

  it("opens the same project task in its plan or submission and keeps list and board in parity", async () => {
    m.load.mockResolvedValue(page([{ ...task, task_status: "submitted" }]));
    await render();
    const plan = host.querySelector('a[aria-label="Åbn arbejdsgrundlag for Pleje langs åen"]')!;
    const review = host.querySelector('a[aria-label="Åbn aflevering for Pleje langs åen"]')!;
    expect(JSON.parse(plan.getAttribute("data-params")!)).toEqual({ slug: task.project_id });
    expect(JSON.parse(plan.getAttribute("data-search")!)).toEqual({
      tab: "handlinger",
      task: task.action_id,
      work: "plan",
    });
    expect(JSON.parse(review.getAttribute("data-search")!)).toEqual({
      tab: "handlinger",
      task: task.action_id,
      work: "submission",
    });
    await click("Liste");
    expect(host.querySelector('[aria-label="Arbejdsordretavle"]')).toBeNull();
    expect(host.querySelectorAll('[aria-label="Arbejdsordreliste"] article')).toHaveLength(1);
    expect(host.textContent).toContain("Gennemgå aflevering");
    expect(m.load).toHaveBeenCalledTimes(1);
  });

  it("applies all server filters together, retains full catalogs, and resets pagination", async () => {
    m.load.mockResolvedValue(page([task], task.action_id));
    await render();
    expect(field("Projekt").querySelector(`option[value="${id(4)}"]`)?.textContent).toBe(
      "Mosen uden opgaver",
    );
    await change("Find arbejdsordre", "  slåning  ");
    await change("Projekt", id(4));
    await change("Jobstatus", "waiting");
    await change("Tildeling", "unassigned");
    await change("Udfører", id(16));
    await change("Frist fra", "2026-11-01");
    await change("Frist til", "2026-11-30");
    expect(m.load).toHaveBeenCalledTimes(1);
    m.load.mockResolvedValue(page([]));
    await submit();
    expect(m.load).toHaveBeenLastCalledWith({
      data: {
        expectedActorId: id(1),
        organizationId: id(2),
        cursor: null,
        pageSize: 30,
        filters: {
          projectId: id(4),
          status: "waiting",
          assignment: "unassigned",
          assigneeId: id(16),
          search: "slåning",
          dueFrom: "2026-11-01",
          dueThrough: "2026-11-30",
        },
      },
    });
    expect(host.textContent).toContain("Ingen arbejdsordrer i dette udvalg");
    expect(field("Projekt").querySelectorAll("option")).toHaveLength(3);
    await click("Nulstil filtre");
    expect(field("Find arbejdsordre").value).toBe("");
    expect(field("Projekt").value).toBe("");
  });

  it("rejects a reversed date interval before making a request", async () => {
    await render();
    await change("Frist fra", "2026-11-30");
    await change("Frist til", "2026-11-01");
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Frist til må ikke ligge før frist fra",
    );
    expect(m.load).toHaveBeenCalledTimes(1);
  });

  it("appends cursor pages without implying that loaded counts are totals", async () => {
    m.load.mockResolvedValueOnce(page([task], task.action_id)).mockResolvedValueOnce(
      page([
        {
          ...task,
          action_id: id(20),
          title: "Andet projekt",
          project_id: id(4),
          project_name: "Mosen",
        },
      ]),
    );
    await render();
    await click("Hent flere arbejdsordrer");
    expect(m.load.mock.calls[1][0].data.cursor).toBe(task.action_id);
    expect(host.querySelectorAll("article")).toHaveLength(2);
    expect(host.textContent).toContain("2 arbejdsordrer vist");
    expect(host.textContent).not.toContain("Der er flere resultater");
    expect(host.querySelector('section[aria-label="Åbne"] h2')?.textContent).toContain("2 vist");
    await click("Liste");
    expect(host.querySelectorAll("article")).toHaveLength(2);
  });

  it("keeps loaded cards available if a later page fails and retries that page", async () => {
    m.load
      .mockResolvedValueOnce(page([task], task.action_id))
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(page([{ ...task, action_id: id(20), title: "Ny opgave" }]));
    await render();
    await click("Hent flere arbejdsordrer");
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await click("Prøv igen");
    expect(m.load.mock.calls[2][0].data.cursor).toBe(task.action_id);
    expect(host.querySelectorAll("article")).toHaveLength(2);
  });

  it("does not present stale assignments as current and identifies claimed pools", async () => {
    m.load.mockResolvedValue(
      page([
        { ...task, assignment_is_current: false },
        {
          ...task,
          action_id: id(20),
          title: "Overtaget pulje",
          assignment_mode: "pool",
          claimed_by: id(15),
          claimed_by_name: "Frederik Felt",
        },
      ]),
    );
    await render();
    expect(host.querySelector('article[aria-label="Pleje langs åen"]')?.textContent).toContain(
      "Tildeling skal fornyes",
    );
    expect(host.querySelector('article[aria-label="Pleje langs åen"]')?.textContent).not.toContain(
      "Tildelt: Frederik Felt",
    );
    expect(host.querySelector('article[aria-label="Overtaget pulje"]')?.textContent).toContain(
      "Overtaget af Frederik Felt",
    );
  });

  it("uses human name fallbacks for unreadable candidate, responsible and claimant profiles without changing assignment meaning", async () => {
    m.load.mockResolvedValue({
      ...page([
        {
          ...task,
          assignment_mode: "group",
          candidate_user_ids: [id(15), id(16), id(17)],
          candidate_names: [id(15), " ", "Frida Felt"],
          plan_responsible_name: id(13),
        },
        {
          ...task,
          action_id: id(20),
          title: "Overtaget uden profilnavn",
          assignment_mode: "pool",
          claimed_by: id(15),
          claimed_by_name: null,
          plan_responsible_name: id(99),
        },
      ]),
      assignees: [{ id: id(15), name: id(15) }],
    });
    await render();
    const assigned = host.querySelector('article[aria-label="Pleje langs åen"]')!;
    expect(assigned.textContent).toContain(
      "Gruppe: Navn ikke tilgængeligt, Navn ikke tilgængeligt, Frida Felt",
    );
    expect(assigned.textContent).toContain("Ansvarlig i planen: Navn ikke tilgængeligt");
    const claimed = host.querySelector('article[aria-label="Overtaget uden profilnavn"]')!;
    expect(claimed.textContent).toContain("Overtaget af Navn ikke tilgængeligt");
    expect(claimed.textContent).not.toContain("afventer overtagelse");
    expect(host.textContent).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(field("Udfører").querySelector(`option[value="${id(15)}"]`)?.textContent).toBe(
      "Navn ikke tilgængeligt",
    );
    expect(m.load).toHaveBeenCalledTimes(1);
  });

  it("clears previously loaded organization data when the selected organization changes", async () => {
    await render();
    expect(host.textContent).toContain("Pleje langs åen");
    m.org = id(30);
    m.load.mockResolvedValue(page([]));
    await render();
    expect(m.load).toHaveBeenLastCalledWith({
      data: {
        expectedActorId: id(1),
        organizationId: id(30),
        filters: emptyManagerWorkOrderFilters(),
        cursor: null,
        pageSize: 30,
      },
    });
    expect(host.textContent).not.toContain("Pleje langs åen");
  });

  it("restores validated filters and presentation after returning from a task without storing task data", async () => {
    await render();
    await change("Projekt", id(3));
    await change("Jobstatus", "submitted");
    await submit();
    await click("Liste");
    await act(async () => root.render(<div />));
    await render();
    expect(field("Projekt").value).toBe(id(3));
    expect(field("Jobstatus").value).toBe("submitted");
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toContain("Liste");
    const stored = JSON.parse(
      sessionStorage.getItem(`freyra-manager-work-orders/v1:${id(1)}:${id(2)}`)!,
    );
    expect(stored).toEqual({
      filters: { ...emptyManagerWorkOrderFilters(), projectId: id(3), status: "submitted" },
      view: "list",
    });
    expect(JSON.stringify(stored)).not.toContain("Frederik");
    m.org = id(30);
    await render();
    expect(field("Projekt").value).toBe("");
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toContain("Kanban");
  });

  it("ignores invalid stored filters instead of forwarding them to the service", async () => {
    sessionStorage.setItem(
      `freyra-manager-work-orders/v1:${id(1)}:${id(2)}`,
      JSON.stringify({
        filters: { ...emptyManagerWorkOrderFilters(), status: "invented" },
        view: "list",
      }),
    );
    await render();
    expect(m.load.mock.calls[0][0].data.filters).toEqual(emptyManagerWorkOrderFilters());
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toContain("Kanban");
  });

  it("does not load work orders until authentication and organization selection are available", async () => {
    m.loading = true;
    await render();
    expect(host.textContent).toContain("Kontrollerer din adgang");
    expect(m.load).not.toHaveBeenCalled();
    m.loading = false;
    m.actor = null;
    await render();
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(m.load).not.toHaveBeenCalled();
    m.actor = id(1);
    m.org = null;
    await render();
    expect(host.querySelector('a[href="/select"]')).not.toBeNull();
    expect(m.load).not.toHaveBeenCalled();
  });
});
