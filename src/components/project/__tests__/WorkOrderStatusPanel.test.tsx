// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  context: vi.fn(),
  log: vi.fn(),
  change: vi.fn(),
  note: vi.fn(),
  history: vi.fn(),
  editing: vi.fn(),
  blocker: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@tanstack/react-router", () => ({ useBlocker: m.blocker }));
vi.mock("@/lib/work-order-lifecycle.functions", () => ({
  getProjectWorkOrderLifecycleContext: m.context,
  getProjectWorkOrderLog: m.log,
  mutateProjectWorkOrderLifecycle: m.change,
  saveProjectWorkOrderNote: m.note,
  getProjectWorkOrderNoteHistory: m.history,
}));
vi.mock("../useWorkOrderPeople", () => ({
  useWorkOrderPeople: () => ({ data: [], isError: false }),
}));
import { WorkOrderStatusPanel } from "../WorkOrderStatusPanel";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  scope = { actionId: id(2), organizationId: id(3), projectId: id(4) };
const state = {
  id: id(6),
  action_id: id(2),
  organization_id: id(3),
  project_id: id(4),
  version: 3,
  status: "assigned",
  started_at: null,
  started_source: null,
  started_by_id: null,
  blocked: false,
  block_reason: null,
  block_owner_id: null,
  block_next_action: null,
  block_due_date: null,
};
const basis = {
  planVersionId: id(5),
  planVersion: 2,
  assignmentVersionId: id(10),
  assignmentVersion: 1,
  executionRevisionId: null,
  executionVersion: null,
  planGaps: [],
  assignmentValid: true,
  executionGaps: ["execution_missing"],
  documentationGaps: [],
  unknownPlannedDate: true,
  actualDate: null,
  actualMethod: null,
  actualCoverage: null,
};
const context = {
  action_id: id(2),
  organization_id: id(3),
  project_id: id(4),
  user_id: actor,
  state,
  basis,
  context_changed: false,
  can_manage: true,
  can_start: true,
  can_perform: true,
  can_note: true,
};
const page = {
  action_id: id(2),
  organization_id: id(3),
  project_id: id(4),
  user_id: actor,
  as_of: "2026-10-29T20:50:00Z",
  items: [],
  next: null,
};
const entry = {
  key: "note:" + id(12),
  created_at: "2026-10-29T20:40:00Z",
  created_by: actor,
  kind: "note",
  event_type: "work_order.note_saved",
  source_id: id(12),
  source_version: 1,
  origin: "manual",
  audit_recorded: true,
  detail: {
    noteId: id(13),
    authorId: actor,
    kind: "comment",
    body: "Synthetic original note",
    reason: "",
    planVersionId: id(7),
    assignmentVersionId: null,
    executionRevisionId: null,
    lifecycleVersionId: null,
  },
};
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 15));
  });
}
async function render(actorId = actor) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderStatusPanel scope={scope} actorId={actorId} onEditing={m.editing} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function click(label: string) {
  const b = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  expect(b).toBeTruthy();
  await act(async () => b!.click());
  await flush();
}
async function fill(label: string, value: string) {
  const labels = [...host.querySelectorAll("label")];
  const el = (
    labels.find((l) => l.firstChild?.textContent === label) ??
    labels.find((l) => l.firstChild?.textContent?.startsWith(label))
  )?.querySelector("input,textarea,select") as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;
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
async function save() {
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
  m.context.mockResolvedValue(context);
  m.log.mockResolvedValue(page);
  m.change.mockRejectedValue(new Error("Synthetic stale basis"));
  m.note.mockRejectedValue(new Error("Synthetic lost note reply"));
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
describe("mobile operation status and canonical logbook", () => {
  it("starts with an unknown actual time and requires an explicit source", async () => {
    await render();
    await click("Registrer start");
    expect(host.querySelector<HTMLInputElement>('input[type="datetime-local"]')?.value).toBe("");
    await save();
    expect(m.change).not.toHaveBeenCalled();
    await fill("Faktisk start", "2026-10-08T08:00:00");
    await fill("Kilde til starttidspunkt", "Synthetic actual paper log");
    await save();
    expect(m.change.mock.calls[0][0].data).toMatchObject({
      ...scope,
      expectedActorId: actor,
      expectedVersion: 3,
      values: {
        targetStatus: "started",
        operation: "transition",
        startedAt: new Date("2026-10-08T08:00:00").toISOString(),
        startedSource: "Synthetic actual paper log",
        planVersionId: id(5),
        assignmentVersionId: id(10),
      },
    });
  });
  it("preserves the opened version and retry identity after lost start reply or a background basis change", async () => {
    await render();
    await click("Registrer start");
    await fill("Faktisk start", "2026-10-08T08:00:00");
    await fill("Kilde til starttidspunkt", "Synthetic retained source");
    await save();
    await act(async () => {
      cache.setQueryData(["work-order-lifecycle", actor, scope], {
        ...context,
        basis: { ...basis, planVersionId: id(55), planVersion: 3 },
        context_changed: true,
      });
    });
    await save();
    expect(m.change.mock.calls[1][0].data).toEqual(m.change.mock.calls[0][0].data);
    expect(host.querySelector<HTMLInputElement>('input[type="datetime-local"]')?.value).toBe(
      "2026-10-08T08:00",
    );
    expect(m.blocker.mock.calls.at(-1)?.[0].enableBeforeUnload).toBe(true);
  });
  it("preserves a manual draft and reuses both note ID and request ID after a lost reply", async () => {
    await render();
    await click("Tilføj note");
    await fill("Note", "Synthetic retained field note");
    await save();
    await save();
    expect(m.note.mock.calls[1][0].data).toEqual(m.note.mock.calls[0][0].data);
    expect(m.note.mock.calls[0][0].data).toMatchObject({
      authorId: actor,
      planVersionId: id(5),
      assignmentVersionId: id(10),
      lifecycleVersionId: id(6),
      expectedVersion: 0,
      body: "Synthetic retained field note",
    });
    expect(host.querySelector("textarea")?.value).toBe("Synthetic retained field note");
    await fill("Note", "Synthetic changed field note");
    await save();
    expect(m.note.mock.calls[2][0].data.requestId).not.toBe(m.note.mock.calls[0][0].data.requestId);
  });
  it("opens the latest correction and keeps the note's original historical context and author", async () => {
    m.log.mockResolvedValue({ ...page, items: [entry] });
    m.history.mockResolvedValue({
      items: [
        {
          id: id(14),
          note_id: id(13),
          author_id: actor,
          created_by: id(9),
          version: 2,
          kind: "comment",
          body: "Synthetic latest correction",
          plan_version_id: id(7),
          assignment_version_id: null,
          execution_revision_id: null,
          lifecycle_version_id: null,
        },
      ],
      nextBeforeVersion: null,
    });
    await render();
    await click("Ret note");
    expect(host.querySelector("textarea")?.value).toBe("Synthetic latest correction");
    await fill("Årsag til noterettelse", "Synthetic source clarification");
    await save();
    expect(m.note.mock.calls[0][0].data).toMatchObject({
      noteId: id(13),
      authorId: actor,
      expectedVersion: 2,
      planVersionId: id(7),
      assignmentVersionId: null,
      lifecycleVersionId: null,
      correctionReason: "Synthetic source clarification",
    });
    expect(m.change).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Synthetic original note");
  });
  it("shows missing audit evidence explicitly and hides stale log contents after a failed refresh", async () => {
    m.log.mockResolvedValue({ ...page, items: [{ ...entry, audit_recorded: false }] });
    await render();
    expect(host.textContent).toContain("Manuel registrering");
    expect(host.textContent).toContain("Auditbeviset for denne version mangler");
    m.log.mockRejectedValue(new Error("Synthetic denied log read"));
    await click("Hent nyt grundlag");
    expect(host.textContent).not.toContain("Synthetic original note");
    expect(host.textContent).toContain("Synthetic denied log read");
  });
  it("does not mark a started task performed while actual method or coverage is missing", async () => {
    m.context.mockResolvedValue({
      ...context,
      state: {
        ...state,
        status: "started",
        started_at: "2026-10-08T06:00:00Z",
        started_source: "Synthetic source",
        started_by_id: actor,
      },
      basis: { ...basis, executionGaps: ["actual_method_unknown", "actual_coverage_unknown"] },
    });
    await render();
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Bekræft udført")
        ?.disabled,
    ).toBe(true);
    expect(host.textContent).toContain("Faktisk metode mangler");
    expect(host.textContent).toContain("Faktisk dækning mangler");
    expect(m.change).not.toHaveBeenCalled();
  });
  it("records an independent block with explicit owner, next action and unknown deadline", async () => {
    await render();
    await click("Sæt afventer");
    await fill("Årsag til afventer", "Synthetic access obstruction");
    await fill("Næste handling", "Synthetic obtain access");
    await save();
    expect(m.change.mock.calls[0][0].data.values).toMatchObject({
      operation: "block",
      targetStatus: null,
      blockOwnerId: actor,
      blockReason: "Synthetic access obstruction",
      blockNextAction: "Synthetic obtain access",
      blockDueDate: null,
      startedAt: null,
    });
  });
  it("does not turn missing lifecycle data into a claimed draft status", async () => {
    m.context.mockResolvedValue({ ...context, state: null });
    await render();
    expect(host.textContent).toContain("Status: Ikke fastlagt");
    expect(m.change).not.toHaveBeenCalled();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Opret kladde")).toBe(
      true,
    );
  });
  it("keeps viewers read-only and exposes no ordinary submit or approval buttons", async () => {
    m.context.mockResolvedValue({
      ...context,
      can_manage: false,
      can_start: false,
      can_perform: false,
      can_note: false,
    });
    await render();
    const text = [...host.querySelectorAll("button")].map((b) => b.textContent).join(" ");
    expect(text).not.toMatch(/Registrer start|Tilføj note|Sæt afventer|Aflever|Godkend/);
    expect(m.change).not.toHaveBeenCalled();
  });
  it("does not clear another editor when an idle inspector unmounts", async () => {
    await render();
    m.editing.mockClear();
    await act(async () => root.render(null));
    expect(m.editing).not.toHaveBeenCalled();
  });
  it("clears only its own dirty lock on account change and hides the previous actor draft", async () => {
    await render();
    await click("Tilføj note");
    await fill("Note", "Synthetic actor-private draft");
    m.context.mockReturnValue(new Promise(() => {}));
    m.log.mockReturnValue(new Promise(() => {}));
    await render(id(99));
    expect(host.textContent).not.toContain("Synthetic actor-private draft");
    expect(host.querySelector("textarea")).toBeNull();
    expect(m.editing).toHaveBeenLastCalledWith(false);
  });
});
