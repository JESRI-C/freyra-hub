// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { emptyExecution } from "@/lib/action-execution";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
const m = vi.hoisted(() => ({
  workspace: vi.fn(),
  history: vi.fn(),
  legacySave: vi.fn(),
  create: vi.fn(),
  loadContext: vi.fn(),
  saveBound: vi.fn(),
  members: vi.fn(),
  blocker: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ useBlocker: m.blocker }));
vi.mock("@/services/project-workspace-service", () => ({
  loadProjectWorkspace: m.workspace,
  createProjectAction: m.create,
}));
vi.mock("@/services/action-execution-service", () => ({
  listActionExecutions: m.history,
  saveActionExecution: m.legacySave,
}));
vi.mock("@/lib/work-order-execution.functions", () => ({
  loadProjectWorkOrderExecutionContext: m.loadContext,
  saveProjectWorkOrderExecution: m.saveBound,
}));
vi.mock("@/services/project-members-service", () => ({ listProjectMembers: m.members }));
import { ActionExecutionPanel } from "../ActionExecutionPanel";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  scope = { organizationId: id(2), projectId: id(3) },
  actionId = id(4);
const execution = {
  ...emptyExecution(actionId),
  dataBasis: "synthetic" as const,
  stage: "performed" as const,
  actualDate: "2026-10-08",
  method: "Synthetic actual method",
  reach: "Synthetic reach",
  sourceReference: "Synthetic work log",
  coverage: "limited" as const,
  coverageDescription: "Synthetic partial execution",
};
const entry = {
  id: id(5),
  entry_id: actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  kind: "decision_note",
  version: 1,
  title: "Synthetic actual execution",
  payload: {
    basis: execution.sourceReference,
    source: "action-execution:" + actionId,
    decision: JSON.stringify(execution),
    alternatives: "",
    uncertainty: "",
    owner: "",
  },
  created_by: actor,
  created_at: "2026-10-29T19:00:00Z",
};
const plan = {
  id: id(6),
  action_id: actionId,
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  version: 2,
  plan: {
    ...emptyWorkOrderPlan("Synthetic plan"),
    plannedStart: "2026-09-21",
    plannedEnd: "2026-09-27",
    plannedMethod: "Synthetic planned method",
  },
  created_at: "2026-10-29T19:00:00Z",
  created_by: actor,
  request_id: id(7),
  correction_reason: "",
};
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function render(canEdit = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <ActionExecutionPanel scope={scope} canEdit={canEdit} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function open() {
  await act(async () => {
    const select = [...host.querySelectorAll("select")].find((el) =>
      el.querySelector(`option[value="${actionId}"]`),
    )!;
    select.value = actionId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}
async function correction(value: string) {
  const el = [...host.querySelectorAll("input")].find((el) =>
    el.parentElement?.textContent?.includes("Årsag til rettelse"),
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  const button = [...host.querySelectorAll("button")].find(
    (el) => el.textContent === "Gem udførelsesversion",
  )!;
  await act(async () =>
    button.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  m.workspace.mockResolvedValue({
    actions: [{ id: actionId, title: "Synthetic action", action_type: null }],
    evidence: [],
    errors: {},
  });
  m.history.mockResolvedValue([entry]);
  m.members.mockResolvedValue([]);
  m.loadContext.mockResolvedValue({ plan, binding: null });
  m.saveBound.mockRejectedValue(new Error("Plan changed; reopen before saving"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
describe("existing actual-execution editor bound to work-order plan", () => {
  it("shows planned week 39 beside actual week 41 and saves through the existing workspace binding", async () => {
    await render();
    await open();
    expect(host.textContent).toContain("2026-09-21");
    expect(host.textContent).toContain("Synthetic planned method");
    const actualDate = host.querySelector<HTMLInputElement>("input[type=date]");
    expect(actualDate?.value).toBe("2026-10-08");
    await correction("Synthetic factual correction");
    await save();
    expect(m.saveBound).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...scope,
        actionId,
        expectedActorId: actor,
        expectedVersion: 1,
        planVersionId: plan.id,
        expectedPlanVersion: 2,
        execution: expect.objectContaining({
          actualDate: "2026-10-08",
          method: "Synthetic actual method",
        }),
      }),
    });
    expect(m.legacySave).not.toHaveBeenCalled();
  });
  it("retains the frozen plan, draft and mutation ID after conflict or lost response", async () => {
    await render();
    await open();
    await correction("Synthetic retained correction");
    await save();
    await save();
    expect(m.saveBound.mock.calls[0][0].data.requestId).toBe(
      m.saveBound.mock.calls[1][0].data.requestId,
    );
    expect(m.saveBound.mock.calls[1][0].data.expectedPlanVersion).toBe(2);
    expect(
      [...host.querySelectorAll("input")].some(
        (el) => el.value === "Synthetic retained correction",
      ),
    ).toBe(true);
    expect(m.blocker.mock.calls.at(-1)?.[0].enableBeforeUnload).toBe(true);
  });
  it("keeps legacy actions on their existing service without creating an invented work-order plan", async () => {
    m.loadContext.mockResolvedValue({ plan: null, binding: null });
    m.legacySave.mockRejectedValue(new Error("Synthetic legacy error"));
    await render();
    await open();
    await correction("Synthetic legacy correction");
    await save();
    expect(m.legacySave).toHaveBeenCalledTimes(1);
    expect(m.saveBound).not.toHaveBeenCalled();
  });
  it("preserves read-only execution inspection for project readers", async () => {
    await render(false);
    await open();
    expect(host.querySelector<HTMLInputElement>("input[type=date]")?.value).toBe("2026-10-08");
    expect(
      [...host.querySelectorAll("button")].some((el) => el.textContent === "Gem udførelsesversion"),
    ).toBe(false);
    expect(m.saveBound).not.toHaveBeenCalled();
  });
});
