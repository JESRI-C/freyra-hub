// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ManagerWorkOrder } from "@/lib/manager-work-orders";

vi.mock("../WorkOrderPlansPanel", () => ({
  WorkOrderPlansPanel: ({
    scope,
    selectedActionId,
    onEditing,
  }: {
    scope: { organizationId: string; projectId: string };
    selectedActionId: string;
    onEditing: (editing: boolean) => void;
  }) => (
    <section
      aria-label="Test planeditor"
      data-scope={JSON.stringify(scope)}
      data-task={selectedActionId}
    >
      <button onClick={() => onEditing(true)}>Ret testplan</button>
      <button onClick={() => onEditing(false)}>Fortryd testplan</button>
    </section>
  ),
}));
import { ManagerWorkOrderPlanning } from "../ManagerWorkOrderPlanning";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const task: ManagerWorkOrder = {
  action_id: id(1),
  organization_id: id(2),
  project_id: id(3),
  project_name: "Syntetisk sag",
  title: "Syntetisk planopgave",
  legacy_status: null,
  task_status: "assigned",
  blocked: false,
  waiting_for_prerequisites: false,
  initialized: true,
  plan_version_id: id(4),
  planned_start: "2026-11-23",
  planned_end: "2026-11-23",
  due_date: null,
  site_id: null,
  site_name: null,
  location_note: null,
  plan_responsible_id: null,
  plan_responsible_name: null,
  assignment_id: null,
  assignment_mode: "unassigned",
  candidate_user_ids: [],
  candidate_names: [],
  claimed_by: null,
  claimed_by_name: null,
  assignment_is_current: false,
  map_locations: [],
  map_unavailable_reason: "no_location",
  map_unavailable_locations: 0,
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === text,
  );
  expect(button, text).toBeTruthy();
  await act(async () => {
    button!.click();
    await vi.dynamicImportSettled();
  });
}
it("opens the exact project's plan and preserves an unsaved draft when closing the real sheet", async () => {
  const refresh = vi.fn();
  await act(async () =>
    root.render(
      <ManagerWorkOrderPlanning
        items={[task]}
        day="2026-11-23"
        onDayChange={vi.fn()}
        hasMore
        onRefresh={refresh}
        renderOrder={(item) => <article>{item.title}</article>}
      />,
    ),
  );
  expect(host.textContent).toContain("Hent flere arbejdsordrer");
  await click("Planlæg");
  const editor = document.querySelector('[aria-label="Test planeditor"]')!;
  expect(JSON.parse(editor.getAttribute("data-scope")!)).toEqual({
    organizationId: id(2),
    projectId: id(3),
  });
  expect(editor.getAttribute("data-task")).toBe(id(1));
  await click("Ret testplan");
  await click("Close");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.textContent).toContain("Gem eller fortryd din kladde");
  expect(refresh).not.toHaveBeenCalled();
  await click("Fortryd testplan");
  await click("Close");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(1);
});
