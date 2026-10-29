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
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
import { MyWorkOrders } from "../MyWorkOrders";
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
    await click("Overtag opgaven");
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
});
