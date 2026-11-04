// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProjectWorkOrderStatus as Projection } from "@/lib/project-work-order-status";
import { ProjectWorkOrderStatus } from "../ProjectWorkOrderStatus";

const m = vi.hoisted(() => ({ cancel: vi.fn(), shift: vi.fn(), list: vi.fn(), saving: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/work-order-plan.functions", () => ({
  cancelProjectWorkOrderSeries: m.cancel,
  shiftProjectWorkOrderSeries: m.shift,
}));
import { WorkOrderSeriesActions } from "../WorkOrderSeriesActions";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actorId = id(1),
  scope = { organizationId: id(2), projectId: id(3) },
  seriesId = id(4);
const plans = [5, 6].map((n) => ({
  actionId: id(n),
  planVersionId: id(n + 10),
  start: "2026-11-04",
  end: null,
  cancelled: false,
}));
const projection = (status: "assigned" | "cancelled"): Projection => ({
  state: "recorded",
  initialized: true,
  status,
  version: status === "assigned" ? 1 : 2,
  blocked: false,
});
const key = ["field-job-actions", actorId, scope],
  otherKey = ["field-job-actions", id(90), scope];
function VisibleTaskStatuses() {
  const query = useQuery({ queryKey: key, queryFn: () => m.list() as Promise<Projection[]> });
  return (
    <section aria-label="Opgaveoversigt">
      {query.data?.map((status, index) => (
        <ProjectWorkOrderStatus key={index} projection={status} legacyStatus={null} />
      ))}
    </section>
  );
}
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function open() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <VisibleTaskStatuses />
        <WorkOrderSeriesActions
          actorId={actorId}
          scope={scope}
          seriesId={seriesId}
          plans={plans}
          disabled={false}
          onSaving={m.saving}
        />
      </QueryClientProvider>,
    ),
  );
  await settle();
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  )!;
  expect(button).toBeDefined();
  await act(async () => button.click());
  await settle();
}
async function requestCancellation() {
  await click("Aflys hele serien");
  const reason = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      reason,
      "Seriens besøg bortfalder",
    );
    reason.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  m.list.mockResolvedValue(plans.map(() => projection("assigned")));
  m.cancel.mockImplementation(async () => {
    m.list.mockResolvedValue(plans.map(() => projection("cancelled")));
    return 2;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  cache.setQueryData(otherKey, [projection("assigned")]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
it("refreshes both visible recorded statuses after series cancellation while preserving another actor's cache", async () => {
  await open();
  expect(
    host.querySelector('[aria-label="Opgaveoversigt"]')?.textContent?.match(/Tildelt/g),
  ).toHaveLength(2);
  await requestCancellation();
  await click("Bekræft aflysning");
  await settle();
  expect(m.cancel).toHaveBeenCalledWith({
    data: expect.objectContaining({
      ...scope,
      seriesId,
      expectedActorId: actorId,
      expectedPlans: { [id(5)]: id(15), [id(6)]: id(16) },
      reason: "Seriens besøg bortfalder",
    }),
  });
  expect(m.list).toHaveBeenCalledTimes(2);
  expect(
    host.querySelector('[aria-label="Opgaveoversigt"]')?.textContent?.match(/Annulleret/g),
  ).toHaveLength(2);
  expect(host.querySelector('[aria-label="Opgaveoversigt"]')?.textContent).not.toContain("Tildelt");
  expect(cache.getQueryData(otherKey)).toEqual([projection("assigned")]);
  expect(cache.getQueryState(otherKey)?.isInvalidated).toBe(false);
  expect(host.textContent).toContain("2 opgaver er aflyst");
  expect(m.saving).toHaveBeenLastCalledWith(false);
});
it("retains the recorded statuses and request identity when cancellation cannot be confirmed", async () => {
  m.cancel.mockRejectedValueOnce(new Error("Lost cancellation reply"));
  await open();
  await requestCancellation();
  await click("Bekræft aflysning");
  const first = m.cancel.mock.calls[0][0];
  expect(
    host.querySelector('[aria-label="Opgaveoversigt"]')?.textContent?.match(/Tildelt/g),
  ).toHaveLength(2);
  expect(m.list).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Aflysningen kunne ikke bekræftes",
  );
  await click("Bekræft aflysning");
  await settle();
  expect(m.cancel.mock.calls[1][0]).toEqual(first);
  expect(
    host.querySelector('[aria-label="Opgaveoversigt"]')?.textContent?.match(/Annulleret/g),
  ).toHaveLength(2);
});
