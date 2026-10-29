// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { ProjectMember } from "@/services/project-members-service";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  history: vi.fn(),
  subjects: vi.fn(),
  save: vi.fn(),
  editing: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/work-order-access.functions", () => ({
  getProjectWorkOrderAccess: m.access,
  getProjectWorkOrderAccessHistory: m.history,
  getProjectWorkOrderAccessSubjects: m.subjects,
  saveProjectWorkOrderAccess: m.save,
}));
import { WorkOrderAccessPanel } from "../WorkOrderAccessPanel";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  person = id(2),
  removed = id(3),
  scope = { actionId: id(4), organizationId: id(5), projectId: id(6) };
const member = (user_id: string, role: ProjectMember["role"] = "field") => ({
  id: id(8),
  project_id: scope.projectId,
  user_id,
  role,
  invited_by: null,
  created_at: "2026-10-29T19:00:00Z",
  updated_at: "2026-10-29T19:00:00Z",
  display_name: "Synthetic field colleague",
});
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function render(members = [member(person)]) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderAccessPanel
          scope={scope}
          actorId={actor}
          members={members}
          onEditing={m.editing}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function click(text: string) {
  const el = [...host.querySelectorAll("button")].find((el) => el.textContent === text);
  expect(el).toBeTruthy();
  await act(async () => el!.click());
  await flush();
}
async function choose(value: string) {
  await act(async () => {
    const select = host.querySelector("select")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}
async function reason(value: string) {
  await act(async () => {
    const el = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  m.access.mockResolvedValue({
    ...scope,
    action_id: scope.actionId,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    user_id: actor,
    can_manage_access: true,
    can_execute: true,
    can_review: false,
  });
  m.subjects.mockResolvedValue({ items: [], nextAfterUserId: null });
  m.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
  m.save.mockRejectedValue(new Error("Connection interrupted"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
describe("mobile task assignment editor", () => {
  it("treats reviewer and executor as explicit separate choices and pins actor/scope", async () => {
    await render();
    await choose(person);
    await click("Tildel adgang");
    const boxes = host.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect(boxes[2].checked).toBe(false);
    await act(async () => boxes[2].click());
    await reason("Synthetic reviewer assignment");
    await submit();
    expect(m.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...scope,
        expectedActorId: actor,
        userId: person,
        expectedVersion: 0,
        active: true,
        canExecute: false,
        canReview: true,
        reason: "Synthetic reviewer assignment",
      }),
    });
    expect(host.querySelector("textarea")!.value).toBe("Synthetic reviewer assignment");
    expect(m.editing).toHaveBeenLastCalledWith(true);
  });
  it("reuses one mutation key after a lost response while preserving the draft", async () => {
    await render();
    await choose(person);
    await click("Tildel adgang");
    await reason("Synthetic access");
    await submit();
    await submit();
    expect(m.save).toHaveBeenCalledTimes(2);
    expect(m.save.mock.calls[1][0].data.requestId).toBe(m.save.mock.calls[0][0].data.requestId);
    expect(host.querySelector("textarea")!.value).toBe("Synthetic access");
    expect(host.textContent).toContain("Connection interrupted");
  });
  it("retains the opened version when another planner changes the cached assignment", async () => {
    const row = {
      id: id(9),
      action_id: scope.actionId,
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      user_id: person,
      version: 1,
      active: true,
      can_execute: true,
      can_review: false,
      reason: "Synthetic first assignment",
      created_at: "2026-10-29T19:00:00Z",
      created_by: actor,
      request_id: id(10),
    };
    m.history.mockResolvedValue({ items: [row], nextBeforeVersion: null });
    await render();
    await choose(person);
    await click("Rediger adgang som ny version");
    await reason("Synthetic correction");
    await act(async () =>
      cache.setQueryData(["work-order-access-history", actor, scope, person], {
        items: [{ ...row, id: id(11), version: 2, can_review: true }],
        nextBeforeVersion: null,
      }),
    );
    await submit();
    expect(m.save.mock.calls[0][0].data).toMatchObject({
      expectedVersion: 1,
      canExecute: true,
      canReview: false,
      reason: "Synthetic correction",
    });
    expect(host.querySelector("textarea")!.value).toBe("Synthetic correction");
  });
  it("keeps former members visible for revocation without reassigning their membership", async () => {
    m.subjects.mockResolvedValue({ items: [removed], nextAfterUserId: null });
    m.history.mockResolvedValue({
      items: [
        {
          id: id(9),
          version: 1,
          active: true,
          can_execute: true,
          can_review: false,
          created_at: "2026-10-29T19:00:00Z",
          created_by: actor,
          reason: "Synthetic original assignment",
        },
      ],
      nextBeforeVersion: null,
    });
    await render();
    await choose(removed);
    await click("Rediger adgang som ny version");
    const boxes = host.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    expect(boxes[1].disabled).toBe(true);
    expect(boxes[2].disabled).toBe(true);
    await act(async () => boxes[0].click());
    await reason("Synthetic member removed");
    await submit();
    expect(m.save.mock.calls[0][0].data).toMatchObject({
      userId: removed,
      active: false,
      canExecute: false,
      canReview: false,
      expectedVersion: 1,
    });
  });
  it("does not offer an access editor to a project reader", async () => {
    m.access.mockResolvedValue({
      user_id: actor,
      can_manage_access: false,
      can_execute: false,
      can_review: false,
    });
    await render();
    expect(host.querySelector("select")).toBeNull();
    expect(m.subjects).not.toHaveBeenCalled();
    expect(m.history).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("preserves typed changes and disables saving when a capability refresh fails", async () => {
    await render();
    await choose(person);
    await click("Tildel adgang");
    await reason("Synthetic retained text");
    m.access.mockRejectedValue(new Error("Authority refresh unavailable"));
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ["work-order-capabilities", actor, scope] });
    });
    await flush();
    expect(host.querySelector("textarea")!.value).toBe("Synthetic retained text");
    const save = [...host.querySelectorAll("button")].find(
      (el) => el.textContent === "Gem tildeling",
    );
    expect(save?.disabled).toBe(true);
    expect(m.save).not.toHaveBeenCalled();
  });
});
