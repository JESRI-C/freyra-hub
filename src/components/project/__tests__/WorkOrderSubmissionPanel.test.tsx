// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkOrderRequestError } from "@/lib/work-order-access";
import type { WorkOrderReviewContext } from "@/lib/work-order-review";
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
  followUp: vi.fn(),
  approvedPacket: undefined as WorkOrderReviewContext["packet"] | undefined,
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
vi.mock("../WorkOrderReviewControls", () => ({
  WorkOrderReviewControls: ({
    onCreateApprovedFollowUp,
  }: {
    onCreateApprovedFollowUp?: (packet: NonNullable<WorkOrderReviewContext["packet"]>) => void;
  }) =>
    m.approvedPacket && onCreateApprovedFollowUp ? (
      <button onClick={() => onCreateApprovedFollowUp(m.approvedPacket!)}>
        Forbered opfølgning
      </button>
    ) : null,
}));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function render(readOnly = false, active = true, requestedVersion?: number) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderSubmissionPanel
          scope={scope}
          actorId={actor}
          actionId={scope.actionId}
          readOnly={readOnly}
          active={active}
          canCreateReport={!!m.approvedPacket}
          requestedVersion={requestedVersion}
          onEditing={m.editing}
          onOpenPart={m.openPart}
          onFollowUp={m.followUp}
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
  m.approvedPacket = undefined;
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
  it("prepares the follow-up from the approved packet's pinned plan", async () => {
    const approved = submission(2);
    m.approvedPacket = {
      id: approved.id,
      version: approved.version,
      plan_version_id: approved.snapshot.plan.id,
      assignment_version_id: approved.snapshot.assignment.id,
      execution_revision_id: approved.execution_revision_id,
    };
    m.list.mockImplementation(({ data }) =>
      Promise.resolve({
        items: [data.beforeVersion === 3 ? approved : submission(4)],
        nextBeforeVersion: null,
      }),
    );
    await render();
    await click("Forbered opfølgning");
    expect(m.followUp).toHaveBeenCalledWith({
      ...approved.snapshot.plan,
      action_id: scope.actionId,
    });
  });
  it("loads the report's exact submission directly and lets users return to full history", async () => {
    m.approvedPacket = {
      id: id(88),
      version: 8,
      plan_version_id: id(3),
      assignment_version_id: id(4),
      execution_revision_id: id(5),
    };
    m.list.mockImplementation(({ data }) =>
      Promise.resolve({
        items: data.beforeVersion === 2 ? [submission(1)] : [submission(8)],
        nextBeforeVersion: null,
      }),
    );
    await render(false, true, 1);
    expect(m.list).toHaveBeenCalledWith({
      data: expect.objectContaining({ actionId: scope.actionId, beforeVersion: 2, pageSize: 1 }),
    });
    expect(host.querySelector("article h4")?.textContent).toBe("Afleveringsversion 1");
    expect(host.textContent).not.toContain("Forbered opfølgning");
    expect(host.querySelector("textarea")).toBeNull();
    await click("Vis alle afleveringsversioner");
    expect(host.querySelector("article h4")?.textContent).toBe("Afleveringsversion 8");
    expect(host.textContent).toContain("Forbered opfølgning");
  });

  it("shows required fields and units from each saved submission's own job card", async () => {
    const previous = submission();
    const current = submission(2);
    const fields = current.snapshot.evidence[0].observation_snapshot.template.fields;
    fields[0] = { ...fields[0], label: "Optalte planter", unit: "stk.", required: false };
    m.list.mockResolvedValue({ items: [current, previous], nextBeforeVersion: null });
    await render();
    const labels = [...host.querySelectorAll("dt")].map((label) => label.textContent);
    expect(labels).toContain("Optalte planter (stk.)");
    expect(labels).toContain("Antal · Nødvendigt felt");
    expect(labels).not.toContain("Optalte planter (stk.) · Nødvendigt felt");
    const values = [...host.querySelectorAll("dd")].map((value) => value.textContent);
    expect(values).toContain("0");
    expect(values).toContain("Nej");
  });

  it("rechecks after opening a correction and preserves the written note", async () => {
    m.context.mockResolvedValueOnce({ ...context(), gaps: ["evidence_missing"] });
    await render();
    expect(host.textContent).toContain("Dette mangler");
    await fill();
    await click("Åbn Dokumentation");
    expect(m.openPart).toHaveBeenCalledWith("evidence");
    await render(false, false);
    m.context.mockResolvedValue(context());
    await render();
    expect(host.textContent).not.toContain("Dette mangler");
    expect(host.textContent).toContain("Grundlaget er klar til at blive gemt");
    expect(host.querySelector("textarea")?.value).toBe(input.note);
  });
  it("shows concrete gaps and cannot save an incomplete task", async () => {
    m.context.mockResolvedValue({
      ...context(),
      gaps: ["evidence_missing", "task_blocked", "plan_incomplete"],
    });
    await render();
    const shortcuts = [...host.querySelectorAll("button")]
      .map((button) => button.textContent)
      .filter((label) => label === "Åbn Arbejdsgrundlag" || label === "Åbn Dokumentation");
    expect(shortcuts).toEqual(["Åbn Arbejdsgrundlag", "Åbn Dokumentation"]);
    await click("Åbn Arbejdsgrundlag");
    await click("Åbn Dokumentation");
    expect(m.openPart.mock.calls).toEqual([["plan"], ["evidence"]]);
    await fill();
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
    expect(host.textContent).not.toContain("Mål ved aflevering");
  });
  it("shows the frozen target, including a maximum of zero", async () => {
    const row = submission();
    row.snapshot.indicatorTarget = {
      indicatorId: id(96),
      label: "Fund af invasiv art",
      value: 0,
      direction: "at_most",
      unit: "stk.",
    };
    m.list.mockResolvedValue({ items: [row], nextBeforeVersion: null });
    await render(true);
    expect(host.textContent).toContain("Mål ved aflevering");
    expect(host.textContent).toContain("Fund af invasiv art");
    expect(host.textContent).toContain("Højst 0 stk.");
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
