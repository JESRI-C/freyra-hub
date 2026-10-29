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
  members: vi.fn(),
  sites: vi.fn(),
  centerlines: vi.fn(),
  blocker: vi.fn(),
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  scope = { projectId: id(2), organizationId: id(3) },
  actionId = id(4);
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
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
}));
vi.mock("@/services/field-job-cards-service", () => ({ listFieldJobActions: m.actions }));
vi.mock("../useWorkOrderPeople", () => ({
  useWorkOrderPeople: () => ({ data: [], isError: false }),
  MoreWorkOrderPeople: () => null,
}));
vi.mock("@/lib/supabase/queries", () => ({ fetchSitesByProject: m.sites }));
vi.mock("@/services/watercourse-service", () => ({ getWatercourseVersions: m.centerlines }));
vi.mock("../WorkOrderAccessPanel", () => ({ WorkOrderAccessPanel: () => null }));
vi.mock("../WorkOrderAssignmentPanel", () => ({ WorkOrderAssignmentPanel: () => null }));
vi.mock("../WorkOrderStatusPanel", () => ({ WorkOrderStatusPanel: () => null }));
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
async function open(edit = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderPlansPanel scope={scope} />
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
});
