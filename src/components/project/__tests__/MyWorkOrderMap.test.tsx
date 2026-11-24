// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
import type { MyWorkOrder } from "@/lib/work-order-assignments";
import type { ManagerMapFeature } from "../manager-work-order-map-data";
const m = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/services/my-work-order-map-service", () => ({ readMyWorkOrderMap: m.read }));
vi.mock("../ManagerWorkOrderMapCanvas", () => ({
  default: ({
    features,
    onSelect,
  }: {
    features: ManagerMapFeature[];
    onSelect: (id: string, project: string) => void;
  }) => (
    <div aria-label="Synthetic map canvas">
      {features.map((f) => (
        <button key={f.key} onClick={() => onSelect(f.actionId, f.projectId)}>
          Markør · {f.title}
        </button>
      ))}
    </div>
  ),
}));
import { MyWorkOrderMap } from "../MyWorkOrderMap";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const task: MyWorkOrder = {
  user_id: id(1),
  action_id: id(2),
  project_id: id(3),
  organization_id: id(4),
  plan_version_id: id(5),
  plan_version: 1,
  plan: { ...emptyWorkOrderPlan("Syntetisk kortjob"), siteId: id(7) },
  assignment_id: id(6),
  assignment_version: 1,
  assignment_mode: "person",
  claimed_by: null,
  can_claim: false,
  can_execute: true,
  can_review: false,
  can_plan: false,
  waiting_for_prerequisites: false,
  cancelled: false,
};
const missing = {
  ...task,
  action_id: id(20),
  plan: { ...task.plan, title: "Syntetisk job uden position", siteId: null },
};
const feature: ManagerMapFeature = {
  key: "synthetic",
  actionId: task.action_id,
  projectId: task.project_id,
  title: task.plan.title,
  projectName: "",
  contextLabel: "Syntetisk sted",
  color: "#475569",
  location: {
    id: "plan_site:0:" + id(7),
    source: "plan_site",
    source_id: id(7),
    source_version_id: null,
    name: "Syntetisk sted",
    archived: false,
    coordinate_source: "site_stored_centroid",
    sequence: 0,
    geometry: { type: "Point", coordinates: [9, 56] },
  },
};
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
const onOpen = vi.fn();
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <MyWorkOrderMap
          actorId={task.user_id}
          items={[task, missing]}
          hasMore
          onOpen={onOpen}
          viewport={null}
          onViewport={() => undefined}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  m.read.mockResolvedValue({ features: [feature], mappedJobs: 1, unmappedJobs: [missing] });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
describe("employee task map", () => {
  it("opens the same task from a marker and retains jobs without positions", async () => {
    await render();
    expect(host.textContent).toContain("1 af 2 indlæste opgaver har kortposition");
    expect(host.textContent).toContain("Kortet viser de indlæste opgaver");
    expect(host.textContent).toContain("gemt midtpunkt");
    const buttons = [...host.querySelectorAll("button")];
    await act(async () =>
      buttons.find((b) => b.textContent === `Markør · ${task.plan.title}`)!.click(),
    );
    expect(onOpen).toHaveBeenLastCalledWith(task.action_id);
    await act(async () =>
      buttons.find((b) => b.textContent === `Åbn opgave · ${missing.plan.title}`)!.click(),
    );
    expect(onOpen).toHaveBeenLastCalledWith(missing.action_id);
  });
  it("hides cached locations after a failed refresh and offers a retry", async () => {
    await render();
    expect(host.textContent).toContain(task.plan.title);
    m.read.mockRejectedValue(new Error("Synthetic access revoked"));
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ["my-work-order-map"] });
    });
    await flush();
    expect(host.textContent).not.toContain(task.plan.title);
    expect(host.querySelector('[aria-label="Synthetic map canvas"]')).toBeNull();
    expect(host.textContent).toContain("Prøv kortet igen");
  });
});
