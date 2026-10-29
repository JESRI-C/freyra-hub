// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  history: vi.fn(),
  groups: vi.fn(),
  groupHistory: vi.fn(),
  saveGroup: vi.fn(),
  configure: vi.fn(),
  editing: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/work-order-assignments.functions", () => ({
  getProjectWorkOrderAssignmentHistory: m.history,
  listProjectWorkOrderGroups: m.groups,
  getProjectWorkOrderGroupHistory: m.groupHistory,
  saveProjectWorkOrderGroup: m.saveGroup,
  configureProjectWorkOrderAssignment: m.configure,
}));
import { WorkOrderAssignmentPanel } from "../WorkOrderAssignmentPanel";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { organizationId: id(2), projectId: id(3), actionId: id(4) },
  actor = id(1);
const owner = {
  organization_id: id(2),
  project_id: id(3),
  user_id: actor,
  organization_role: "owner",
  project_role: null,
  can_execute: true,
  display_name: "Synthetic owner",
  email: null,
};
const group = {
  id: id(7),
  group_id: id(8),
  organization_id: id(2),
  project_id: id(3),
  version: 3,
  name: "Synthetic crew",
  active: true,
  member_ids: [actor],
  member_assessments: [],
  correction_reason: "",
  created_by: actor,
  request_id: id(9),
  created_at: "2026-10-29T20:00:00Z",
};
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 15));
  });
}
async function render(canManage = true, planId = id(5)) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderAssignmentPanel
          scope={scope}
          actorId={actor}
          planId={planId}
          canManage={canManage}
          people={[owner]}
          onEditing={m.editing}
        />
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
async function fill(label: string, value: string) {
  const el = [...host.querySelectorAll("label")]
    .find((l) => l.firstChild?.textContent === label)
    ?.querySelector("input,select,textarea") as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement;
  expect(el).toBeTruthy();
  await act(async () => {
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
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
  m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
  m.groups.mockResolvedValue({ items: [group], nextAfterGroupId: null });
  m.groupHistory.mockResolvedValue({ items: [group], nextBeforeVersion: null });
  m.configure.mockRejectedValue(new Error("Synthetic version conflict"));
  m.saveGroup.mockRejectedValue(new Error("Synthetic lost response"));
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
describe("group and assignment editor", () => {
  it("selects an organization owner with no invented project role and retains the opened plan on conflict", async () => {
    await render();
    await click("Rediger arbejdsfordeling");
    await fill("Udfører", actor);
    await fill("Begrundelse", "Synthetic assignment reason");
    await render(true, id(55));
    await submit();
    await submit();
    const first = m.configure.mock.calls[0][0].data;
    expect(first).toMatchObject({
      ...scope,
      expectedActorId: actor,
      expectedVersion: 0,
      planVersionId: id(5),
      mode: "person",
      candidateUserIds: [actor],
    });
    expect(m.configure.mock.calls[1][0].data).toEqual(first);
    expect(host.querySelector("textarea")?.value).toBe("Synthetic assignment reason");
    expect(m.editing).toHaveBeenLastCalledWith(true);
  });
  it("pins a concrete group version and roster instead of silently following refreshed membership", async () => {
    await render();
    await click("Rediger arbejdsfordeling");
    await fill("Tildelingstype", "group");
    await fill("Arbejdsgruppe", group.id);
    await fill("Begrundelse", "Synthetic frozen group");
    await act(async () => {
      cache.setQueryData(["work-order-groups", actor, scope.organizationId, scope.projectId], {
        pages: [
          {
            items: [{ ...group, id: id(70), version: 4, member_ids: [id(10)] }],
            nextAfterGroupId: null,
          },
        ],
        pageParams: [null],
      });
    });
    await submit();
    expect(m.configure.mock.calls[0][0].data).toMatchObject({
      sourceGroupVersionId: group.id,
      candidateUserIds: [actor],
    });
  });
  it("allocates a new request identity only after the attempted payload changes", async () => {
    await render();
    await click("Rediger arbejdsfordeling");
    await fill("Udfører", actor);
    await fill("Begrundelse", "Synthetic reason A");
    await submit();
    await fill("Begrundelse", "Synthetic reason B");
    await submit();
    expect(m.configure.mock.calls[0][0].data.requestId).not.toBe(
      m.configure.mock.calls[1][0].data.requestId,
    );
  });
  it("creates a group with a stable ID and repeatable request after a lost response", async () => {
    await render();
    await click("Opret arbejdsgruppe");
    await fill("Gruppenavn", "Synthetic new group");
    const checkbox = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (el) => el.parentElement?.textContent?.includes("Synthetic owner"),
    )!;
    await act(async () => checkbox.click());
    await submit();
    await submit();
    expect(m.saveGroup).toHaveBeenCalledTimes(2);
    expect(m.saveGroup.mock.calls[1][0]).toEqual(m.saveGroup.mock.calls[0][0]);
    expect(m.saveGroup.mock.calls[0][0].data).toMatchObject({
      expectedVersion: 0,
      memberIds: [actor],
      name: "Synthetic new group",
    });
  });
  it("archives the frozen roster and requires a reason without rewriting previous members", async () => {
    await render();
    await fill("Gruppe", group.group_id);
    await click("Rediger gruppe");
    const active = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (el) => el.parentElement?.textContent?.includes("Aktiv gruppe"),
    )!;
    await act(async () => active.click());
    await fill("Årsag til gruppeændring", "Synthetic archive reason");
    await submit();
    expect(m.saveGroup.mock.calls[0][0].data).toMatchObject({
      active: false,
      expectedVersion: 3,
      groupId: group.group_id,
      memberIds: [actor],
      correctionReason: "Synthetic archive reason",
    });
  });
  it("leaves assignment and group mutations unavailable to read-only users", async () => {
    await render(false);
    expect(host.textContent).not.toContain("Rediger arbejdsfordeling");
    expect(host.textContent).not.toContain("Opret arbejdsgruppe");
    expect(m.groups).not.toHaveBeenCalled();
    expect(m.configure).not.toHaveBeenCalled();
  });
});
