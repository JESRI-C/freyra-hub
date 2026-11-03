// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkOrderRequestError } from "@/lib/work-order-access";
import {
  actor,
  context,
  id,
  input,
  scope,
  submission,
} from "@/services/__tests__/work-order-submission-fixture";
const m = vi.hoisted(() => ({
  context: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  original: vi.fn(),
  editing: vi.fn(),
  openPart: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));
vi.mock("@/lib/work-order-submission.functions", () => ({
  getProjectWorkOrderSubmissionContext: m.context,
  listProjectWorkOrderSubmissions: m.list,
  saveProjectWorkOrderSubmission: m.save,
}));
vi.mock("@/lib/work-order-evidence.functions", () => ({
  getProjectWorkOrderEvidenceOriginal: m.original,
}));
vi.mock("../WorkOrderExecutionReference", () => ({
  WorkOrderExecutionReference: () => <p>Valgt historisk udførelse</p>,
}));
import { WorkOrderSubmissionPanel } from "../WorkOrderSubmissionPanel";
vi.mock("../WorkOrderReviewControls", () => ({ WorkOrderReviewControls: () => null }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function render(readOnly = false, active = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderSubmissionPanel
          scope={scope}
          actorId={actor}
          actionId={scope.actionId}
          readOnly={readOnly}
          active={active}
          onEditing={m.editing}
          onOpenPart={m.openPart}
        />
      </QueryClientProvider>,
    ),
  );
  await settle();
  await settle();
}
async function fill(value = input.note) {
  const textarea = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      textarea,
      value,
    );
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === text,
  );
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
  await settle();
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  m.context.mockResolvedValue(context());
  m.list.mockResolvedValue({ items: [], nextBeforeVersion: null });
  m.save.mockResolvedValue(submission());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("submission preparation on the existing task", () => {
  it("shows concrete gaps and cannot save an incomplete task", async () => {
    m.context.mockResolvedValue({ ...context(), gaps: ["task_blocked", "evidence_missing"] });
    await render();
    await click("Åbn Arbejdsgrundlag");
    await click("Åbn Dokumentation");
    expect(m.openPart.mock.calls).toEqual([["plan"], ["evidence"]]);
    await fill();
    await click("Åbn Dokumentation");
    expect(m.openPart).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Opgavens blokering skal afklares");
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Gem afleveringsversion")
        ?.disabled,
    ).toBe(true);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("retries an uncertain save with the same identity and keeps the note until confirmed", async () => {
    m.save
      .mockRejectedValueOnce(new WorkOrderRequestError("unavailable"))
      .mockResolvedValueOnce(submission());
    await render();
    await fill();
    await click("Gem afleveringsversion");
    expect(host.querySelector("textarea")?.value).toBe(input.note);
    expect(host.querySelector("textarea")?.disabled).toBe(true);
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Hent aktuelt grundlag")
        ?.disabled,
    ).toBe(true);
    const first = m.save.mock.calls[0][0];
    await click("Prøv samme gemning igen");
    expect(m.save.mock.calls[1][0]).toEqual(first);
    expect(host.querySelector("textarea")?.value).toBe("");
    expect(host.textContent).toContain("Afleveringsversion 1 er gemt");
  });
  it("keeps the draft across permission-check failure without exposing cached history", async () => {
    m.list.mockResolvedValue({ items: [submission()], nextBeforeVersion: null });
    await render();
    await fill();
    m.context.mockRejectedValue(new WorkOrderRequestError("access"));
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ["work-order-submission", actor] });
    });
    await settle();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).not.toContain("Afleveringsversion 1");
    m.context.mockResolvedValue(context());
    await click("Hent aktuelt grundlag");
    expect(host.querySelector("textarea")?.value).toBe(input.note);
  });
  it("does not offer mutation controls in the read-only task entry", async () => {
    m.list.mockResolvedValue({ items: [submission()], nextBeforeVersion: null });
    await render(true);
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("Afleveringsversion 1");
    expect(host.textContent).toContain("Fastholdt grundlag");
  });
  it("preserves zero, false and unknown dates in the frozen version", async () => {
    m.list.mockResolvedValue({ items: [submission()], nextBeforeVersion: null });
    await render(true);
    expect([...host.querySelectorAll("dd")].map((el) => el.textContent)).toEqual([
      "0",
      "Nej",
      "Ukendt",
    ]);
    expect(host.textContent).toContain("Planlagt fra: Ukendt");
  });
  it("rejects a response belonging to a different actor at the UI boundary", async () => {
    m.context.mockResolvedValue({ ...context(), user_id: id(9) });
    m.list.mockResolvedValue({ items: [submission()], nextBeforeVersion: null });
    await render();
    expect(m.list).not.toHaveBeenCalled();
    expect(host.querySelector("textarea")).toBeNull();
  });
  it("refreshes a revisited clean panel, while a draft keeps its original preflight", async () => {
    await render(false, true);
    const calls = m.context.mock.calls.length;
    await render(false, false);
    await render(false, true);
    expect(m.context.mock.calls.length).toBeGreaterThan(calls);
    await fill();
    const dirtyCalls = m.context.mock.calls.length;
    await render(false, false);
    await render(false, true);
    expect(m.context.mock.calls.length).toBe(dirtyCalls);
  });
});
