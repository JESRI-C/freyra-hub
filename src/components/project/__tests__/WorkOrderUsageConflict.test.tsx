// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkOrderTimePanel } from "../WorkOrderTimePanel";
import { WorkOrderMaterials } from "../WorkOrderMaterials";
const mock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  error: { code: "PT409", details: "freyra.version_conflict" } as {
    code: string;
    details?: string;
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createActorBoundSupabaseClient: () => ({ from: mock.from, rpc: mock.rpc }),
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actorId = id(1),
  actionId = id(2),
  scope = { organizationId: id(3), projectId: id(4) };
const onEditing = vi.fn();
let host: HTMLDivElement, root: Root, cache: QueryClient;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => {
  onEditing.mockClear();
  mock.from.mockReset();
  mock.rpc.mockReset();
  mock.rpc.mockResolvedValue({
    data: [
      {
        id: id(6),
        entry_id: id(6),
        actor_id: actorId,
        material: "DEMO · Planter",
        unit: "stk",
        quantity_milli: 1000,
        version: 1,
        reason: "",
      },
    ],
    error: null,
  });
  mock.from.mockImplementation((table: string) => {
    const response = Promise.resolve({
      data:
        table === "work_order_time_versions"
          ? [{ id: id(5), minutes: 60, version: 1, reason: "" }]
          : [],
      error: null,
    });
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit", "insert", "match", "ilike"])
      chain[method] = () => chain;
    chain.single = async () => ({ data: null, error: mock.error });
    chain.maybeSingle = async () => ({ data: null, error: null });
    chain.then = response.then.bind(response);
    return chain;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  cache.clear();
});
async function tick() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}
async function fill(label: string, value: string) {
  const field = [...host.querySelectorAll("label")]
    .find((node) => node.textContent?.trim().startsWith(label))
    ?.querySelector("input,textarea") as HTMLInputElement | HTMLTextAreaElement;
  expect(field).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
for (const kind of ["time", "material"] as const) {
  it.each([
    [{ code: "PT409", details: "freyra.version_conflict" }, false],
    [{ code: "PT409" }, true],
    [{ code: "40001" }, false],
  ] as const)(
    `keeps the ${kind} draft and distinguishes cancellation for %j`,
    async (error, cancelled) => {
      mock.error = error;
      await act(async () =>
        root.render(
          <QueryClientProvider client={cache}>
            {kind === "time" ? (
              <WorkOrderTimePanel {...{ scope, actorId, actionId, onEditing }} canWrite />
            ) : (
              <WorkOrderMaterials {...{ scope, actorId, actionId, onEditing }} canWrite />
            )}
          </QueryClientProvider>,
        ),
      );
      await tick();
      const edit = [...host.querySelectorAll("button")].find(
        (node) => node.textContent === (kind === "time" ? "Ret registreret tid" : "Ret mængde"),
      );
      expect(edit).toBeTruthy();
      await act(async () => edit!.click());
      await fill(
        kind === "time" ? "Arbejdstid i minutter" : "Mængde",
        kind === "time" ? "90" : "2",
      );
      await fill("Årsag til rettelse", "DEMO · Bevar kladden");
      await act(async () => {
        host
          .querySelector("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await tick();
      const alert = host.querySelector('[role="alert"]')?.textContent ?? "";
      expect(alert.includes("Opgaven er aflyst")).toBe(cancelled);
      expect(alert.length).toBeGreaterThan(10);
      expect(host.querySelector("form")).not.toBeNull();
      expect(onEditing).toHaveBeenLastCalledWith(true);
    },
  );
}
