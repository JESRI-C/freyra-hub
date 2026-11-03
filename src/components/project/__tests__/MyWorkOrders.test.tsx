// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
const m = vi.hoisted(() => ({
  load: vi.fn(),
  claim: vi.fn(),
  actor: "00000000-0000-4000-8000-000000000001" as string | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: m.actor ? { id: m.actor } : null, loading: false }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/work-order-assignments.functions", () => ({
  listCurrentUserWorkOrders: m.load,
  claimProjectWorkOrderPool: m.claim,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, search }: { to: string; children: React.ReactNode; search?: unknown }) => (
    <a href={to} data-search={JSON.stringify(search)}>
      {children}
    </a>
  ),
}));
import { MyWorkOrders } from "../MyWorkOrders";
vi.mock("../WorkOrderSubmissionPanel", () => ({
  WorkOrderSubmissionPanel: ({ actionId, readOnly }: { actionId: string; readOnly: boolean }) => (
    <div data-submission-task={actionId} data-read-only={readOnly}>
      Afleveringsgrundlag
    </div>
  ),
}));
vi.mock("../WorkOrderEvidencePanel", () => ({
  WorkOrderEvidencePanel: ({
    actionId,
    canContribute,
    onEditing,
  }: {
    actionId: string;
    canContribute: boolean;
    onEditing: (value: boolean) => void;
  }) => (
    <div data-evidence-task={actionId} data-can-contribute={canContribute}>
      <button onClick={() => onEditing(true)}>Synthetic open original</button>
      <button onClick={() => onEditing(false)}>Synthetic original complete</button>
    </div>
  ),
}));
vi.mock("../WorkOrderStatusPanel", () => ({
  WorkOrderStatusPanel: ({ onEditing }: { onEditing: (value: boolean) => void }) => (
    <>
      <button onClick={() => onEditing(true)}>Synthetic edit status</button>
      <button onClick={() => onEditing(false)}>Synthetic cancel status</button>
    </>
  ),
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const task = {
  user_id: id(1),
  action_id: id(2),
  organization_id: id(3),
  project_id: id(4),
  plan_version_id: id(5),
  plan_version: 1,
  plan: { ...emptyWorkOrderPlan("Synthetic mobile task"), instructions: "Synthetic instructions" },
  assignment_id: id(6),
  assignment_version: 3,
  assignment_mode: "pool",
  claimed_by: null,
  can_claim: true,
  can_execute: false,
  can_review: false,
  can_plan: false,
  waiting_for_prerequisites: false,
};
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 15));
  });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <MyWorkOrders />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function openTask() {
  await click("Åbn opgave");
}
async function click(text: string) {
  const b = [...host.querySelectorAll("button")].find((b) => b.textContent === text);
  expect(b).toBeTruthy();
  await act(async () => b!.click());
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  m.actor = id(1);
  m.load.mockResolvedValue({ items: [task], nextAfterActionId: null });
  m.claim.mockRejectedValue(new Error("Synthetic lost response"));
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
describe("mobile personal tasks", () => {
  it("shows waiting status before opening a task and keeps its instructions accessible", async () => {
    m.load.mockResolvedValue({
      items: [{ ...task, waiting_for_prerequisites: true }],
      nextAfterActionId: null,
    });
    await render();
    expect(host.textContent).toContain("Afventer forudsætninger");
    await openTask();
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.textContent).toContain(
      "Synthetic instructions",
    );
  });

  it("opens exact-task documentation as read-only and retains the status editor lock", async () => {
    await render();
    await openTask();
    const details = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Se dokumentation",
    )!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    await flush();
    expect(host.querySelector("[data-evidence-task]")?.getAttribute("data-evidence-task")).toBe(
      task.action_id,
    );
    expect(host.querySelector("[data-evidence-task]")?.getAttribute("data-can-contribute")).toBe(
      "false",
    );
    const status = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Status og logbog",
    )!;
    await act(async () => {
      status.open = true;
      status.dispatchEvent(new Event("toggle"));
    });
    await flush();
    await click("Synthetic edit status");
    await click("Synthetic original complete");
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Opdater opgaver")
        ?.disabled,
    ).toBe(true);
    await click("Synthetic cancel status");
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Opdater opgaver")
        ?.disabled,
    ).toBe(false);
  });
  it("locks list refresh and claim while a nested status or note draft is open", async () => {
    await render();
    await openTask();
    const detail = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Status og logbog",
    )!;
    await act(async () => {
      detail.open = true;
      detail.dispatchEvent(new Event("toggle"));
    });
    await flush();
    await click("Synthetic edit status");
    expect(
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent === "← Alle mine opgaver",
      )?.disabled,
    ).toBe(true);
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Opdater opgaver")
        ?.disabled,
    ).toBe(true);
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Overtag opgaven")
        ?.disabled,
    ).toBe(true);
    await click("Synthetic cancel status");
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Opdater opgaver")
        ?.disabled,
    ).toBe(false);
  });
  it("opens exact task instructions for external users without opening the project", async () => {
    await render();
    expect(host.textContent).toContain("Synthetic instructions");
    expect(host.querySelector('a[href="/app/projects/$slug"]')).toBeNull();
    expect(m.load).toHaveBeenCalledWith({
      data: { expectedActorId: id(1), afterActionId: null, pageSize: 20 },
    });
  });
  it("reuses the same claim request and frozen versions after a lost response", async () => {
    await render();
    await openTask();
    await click("Overtag opgaven");
    await click("← Alle mine opgaver");
    await openTask();
    await click("Overtag opgaven");
    const first = m.claim.mock.calls[0][0].data;
    expect(first).toMatchObject({
      actionId: id(2),
      expectedActorId: id(1),
      expectedVersion: 3,
      planVersionId: id(5),
    });
    expect(m.claim.mock.calls[1][0].data).toEqual(first);
    expect(host.textContent).toContain("Synthetic lost response");
  });
  it("refreshes the list after a claim and removes the takeover action", async () => {
    m.claim.mockImplementation(async () => {
      m.load.mockResolvedValue({
        items: [
          {
            ...task,
            assignment_version: 4,
            claimed_by: id(1),
            can_claim: false,
            can_execute: true,
          },
        ],
        nextAfterActionId: null,
      });
      return {};
    });
    await render();
    await openTask();
    await click("Overtag opgaven");
    expect(host.textContent).toContain("Overtaget af dig");
    expect(
      [...host.querySelectorAll("button")].some((b) => b.textContent === "Overtag opgaven"),
    ).toBe(false);
  });
  it("hides cached cards on failed refresh and distinguishes failure from an empty list", async () => {
    await render();
    m.load.mockRejectedValue(new Error("Synthetic access check failed"));
    await click("Opdater opgaver");
    expect(host.textContent).not.toContain("Synthetic mobile task");
    expect(host.textContent).not.toContain("Du har ingen tildelte");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Synthetic access check failed",
    );
  });
  it("hides the previous actor's cards on logout and pending account switch", async () => {
    await render();
    m.actor = null;
    await render();
    expect(host.textContent).not.toContain("Synthetic mobile task");
    expect(host.textContent).toContain("Log ind for at se dine opgaver");
    m.actor = id(9);
    m.load.mockReturnValue(new Promise(() => {}));
    await render();
    expect(host.textContent).not.toContain("Synthetic mobile task");
    expect(host.textContent).toContain("Henter dine opgaver");
  });
  it("loads a second page using the server cursor and the same actor", async () => {
    m.load
      .mockResolvedValueOnce({ items: [task], nextAfterActionId: id(2) })
      .mockResolvedValueOnce({
        items: [{ ...task, action_id: id(10), plan: emptyWorkOrderPlan("Synthetic next task") }],
        nextAfterActionId: null,
      });
    await render();
    await click("Hent flere opgaver");
    expect(m.load.mock.calls[1][0].data).toMatchObject({
      afterActionId: id(2),
      expectedActorId: id(1),
      pageSize: 20,
    });
    expect(host.textContent).toContain("Synthetic next task");
  });
  it("opens one task with immediate instructions and carries its exact identity to execution", async () => {
    m.load.mockResolvedValue({ items: [{ ...task, can_plan: true }], nextAfterActionId: null });
    await render();
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.parentElement?.hidden).toBe(
      true,
    );
    await openTask();
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.parentElement?.hidden).toBe(
      false,
    );
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.textContent).toContain(
      "Synthetic instructions",
    );
    expect(
      JSON.parse(host.querySelector('a[href="/app/projects/$slug"]')!.getAttribute("data-search")!),
    ).toEqual({ step: "udfoerelse", task: id(2), work: "execution" });
    expect(JSON.parse(host.querySelector('a[href="/felt"]')!.getAttribute("data-search")!)).toEqual(
      { project: id(4), task: id(2) },
    );
    await click("← Alle mine opgaver");
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.parentElement?.hidden).toBe(
      true,
    );
  });
});
