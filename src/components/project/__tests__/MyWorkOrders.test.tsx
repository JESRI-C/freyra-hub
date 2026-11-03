// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
const m = vi.hoisted(() => ({
  load: vi.fn(),
  claim: vi.fn(),
  fieldAccess: vi.fn(),
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
vi.mock("@/lib/field-job-access.functions", () => ({ getFieldJobAccess: m.fieldAccess }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    search,
    params,
    disabled,
  }: {
    to: string;
    children: React.ReactNode;
    search?: unknown;
    params?: unknown;
    disabled?: boolean;
  }) => (
    <a
      href={disabled ? undefined : to}
      aria-disabled={disabled}
      data-search={JSON.stringify(search)}
      data-params={JSON.stringify(params)}
    >
      {children}
    </a>
  ),
}));
import { MyWorkOrders } from "../MyWorkOrders";
vi.mock("../WorkOrderSubmissionPanel", () => ({
  WorkOrderSubmissionPanel: ({
    actionId,
    actorId,
    scope,
    readOnly,
    allowReviewInReadOnly,
    onEditing,
  }: {
    actionId: string;
    actorId: string;
    scope: { organizationId: string; projectId: string };
    readOnly: boolean;
    allowReviewInReadOnly: boolean;
    onEditing: (value: boolean) => void;
  }) => (
    <div
      data-submission-task={actionId}
      data-actor={actorId}
      data-project={scope.projectId}
      data-organization={scope.organizationId}
      data-read-only={readOnly}
      data-allow-review={allowReviewInReadOnly}
    >
      Afleveringsgrundlag
      <button onClick={() => onEditing(true)}>Synthetic edit submission</button>
      <button onClick={() => onEditing(false)}>Synthetic cancel submission</button>
    </div>
  ),
}));
vi.mock("../WorkOrderEvidencePanel", () => ({
  WorkOrderEvidencePanel: ({
    actionId,
    canContribute,
    onEditing,
  }: {
    actionId: string;
    canContribute: boolean;
    onEditing: (value: boolean) => void;
  }) => (
    <div data-evidence-task={actionId} data-can-contribute={canContribute}>
      <button onClick={() => onEditing(true)}>Synthetic open original</button>
      <button onClick={() => onEditing(false)}>Synthetic original complete</button>
    </div>
  ),
}));
vi.mock("../WorkOrderStatusPanel", () => ({
  WorkOrderStatusPanel: ({ onEditing }: { onEditing: (value: boolean) => void }) => (
    <>
      <button onClick={() => onEditing(true)}>Synthetic edit status</button>
      <button onClick={() => onEditing(false)}>Synthetic cancel status</button>
    </>
  ),
}));
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
  waiting_for_prerequisites: false,
  cancelled: false,
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
async function openTask() {
  await click("Åbn opgave");
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
  m.fieldAccess.mockResolvedValue({
    userId: task.user_id,
    projectId: task.project_id,
    canContribute: false,
  });
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
  it("shows the saved plan window and location before an assigned worker opens the task", async () => {
    const assigned = {
      ...task,
      assignment_mode: "person",
      can_claim: false,
      can_execute: true,
    };
    m.load.mockResolvedValue({
      items: [
        {
          ...assigned,
          plan: {
            ...task.plan,
            plannedStart: "2026-11-05",
            plannedEnd: "2026-11-07",
            locationNote: "Ved den nordlige låge",
          },
        },
        {
          ...assigned,
          action_id: id(10),
          plan: { ...emptyWorkOrderPlan("Startdato"), plannedStart: "2026-11-09" },
        },
        { ...assigned, action_id: id(11), plan: emptyWorkOrderPlan("Afventer dato") },
      ],
      nextAfterActionId: null,
    });

    await render();

    const previews = [...host.querySelectorAll('dl[aria-label="Planlagt tid og sted"]')];
    expect(previews).toHaveLength(3);
    expect(previews.every((preview) => !preview.closest("[hidden]"))).toBe(true);
    expect(previews[0].textContent).toContain("Planlagt periode");
    expect(previews[0].textContent).toContain("5. nov. 2026 – 7. nov. 2026");
    expect(previews[0].textContent).toContain("Ved den nordlige låge");
    expect(previews[1].textContent).toContain("Planlagt start");
    expect(previews[1].textContent).toContain("9. nov. 2026");
    expect(previews[1].textContent).not.toContain("Sted");
    expect(previews[2].textContent).toContain("Ingen planlagt dato");
  });

  it("submits a title search with the selected status and clears it explicitly", async () => {
    await render();
    await click("Aktive");
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "  mobil  ",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Søg");
    expect(m.load.mock.lastCall?.[0].data).toMatchObject({
      expectedActorId: id(1),
      afterActionId: null,
      filter: "active",
      search: "mobil",
    });
    await openTask();
    await click("← Tilbage til opgavelisten");
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("  mobil  ");
    await click("Ryd søgning");
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("");
  });

  it("requests filtered pages from the server and restores the selected list after opening a task", async () => {
    m.load.mockImplementation(({ data }) =>
      Promise.resolve({
        items: data.filter === "cancelled" ? [{ ...task, cancelled: true }] : [task],
        nextAfterActionId: null,
      }),
    );
    await render();
    await click("Aflyste");
    expect(m.load).toHaveBeenLastCalledWith({
      data: {
        expectedActorId: id(1),
        afterActionId: null,
        pageSize: 20,
        filter: "cancelled",
      },
    });
    expect(host.textContent).toContain("Aflyst.");
    await openTask();
    await click("← Tilbage til opgavelisten");
    expect(
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Aflyste")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps a cancelled task accessible without offering active field actions", async () => {
    m.load.mockResolvedValue({
      items: [{ ...task, cancelled: true, can_execute: true, can_plan: true }],
      nextAfterActionId: null,
    });
    await render();
    expect(host.textContent).toContain("Aflyst.");
    await openTask();
    expect(host.textContent).toContain("Synthetic instructions");
    expect(host.textContent).toContain("Status og logbog");
    expect(host.textContent).not.toContain("Overtag opgaven");
    expect(host.textContent).not.toContain("Registrér arbejdstid");
    expect(host.textContent).not.toContain("Tag fotos på projektet");
  });

  it("shows waiting status before opening a task and keeps its instructions accessible", async () => {
    m.load.mockResolvedValue({
      items: [{ ...task, waiting_for_prerequisites: true }],
      nextAfterActionId: null,
    });
    await render();
    expect(host.textContent).toContain("Afventer forudsætninger");
    await openTask();
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.textContent).toContain(
      "Synthetic instructions",
    );
  });

  it("opens the exact task in the field workspace and enables its existing manual evidence link for a project contributor", async () => {
    m.load.mockResolvedValue({
      items: [{ ...task, assignment_mode: "person", can_claim: false, can_execute: true }],
      nextAfterActionId: null,
    });
    m.fieldAccess.mockResolvedValue({
      userId: task.user_id,
      projectId: task.project_id,
      canContribute: true,
    });
    await render();
    expect(m.fieldAccess).not.toHaveBeenCalled();
    await openTask();
    expect(m.fieldAccess).toHaveBeenCalledWith({ data: { projectId: task.project_id } });
    const photo = host.querySelector('a[href="/felt"]')!;
    expect(photo.textContent).toBe("Tag fotos på projektet");
    expect(JSON.parse(photo.getAttribute("data-search")!)).toEqual({
      project: task.project_id,
      task: task.action_id,
    });
    const execution = [...host.querySelectorAll("a")].find(
      (link) => link.textContent === "Registrér udført arbejde",
    )!;
    expect(execution.getAttribute("href")).toBe("/app/projects/$slug");
    expect(JSON.parse(execution.getAttribute("data-params")!)).toEqual({ slug: task.project_id });
    expect(JSON.parse(execution.getAttribute("data-search")!)).toEqual({
      step: "udfoerelse",
      task: task.action_id,
      work: "execution",
    });

    const evidence = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Dokumentation",
    )!;
    await act(async () => {
      evidence.open = true;
      evidence.dispatchEvent(new Event("toggle"));
    });
    await flush();
    const panel = host.querySelector<HTMLElement>("[data-evidence-task]")!;
    expect(panel.dataset.evidenceTask).toBe(task.action_id);
    expect(panel.dataset.canContribute).toBe("true");
    await click("Synthetic open original");
    expect(photo.getAttribute("aria-disabled")).toBe("true");
    expect(photo.getAttribute("href")).toBeNull();
    expect(execution.getAttribute("aria-disabled")).toBe("true");
  });

  it.each([
    { kind: "outside project contribution", userId: id(1), projectId: id(4), canContribute: false },
    { kind: "different user", userId: id(99), projectId: id(4), canContribute: true },
    { kind: "different project", userId: id(1), projectId: id(99), canContribute: true },
  ])("keeps field photos and evidence writes closed for $kind", async ({ kind: _, ...access }) => {
    m.load.mockResolvedValue({
      items: [{ ...task, assignment_mode: "person", can_claim: false, can_execute: true }],
      nextAfterActionId: null,
    });
    m.fieldAccess.mockResolvedValue(access);
    await render();
    await openTask();
    expect(host.textContent).not.toContain("Tag fotos på projektet");
    expect(host.textContent).not.toContain("Registrér udført arbejde");
    const evidence = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Se dokumentation",
    )!;
    await act(async () => {
      evidence.open = true;
      evidence.dispatchEvent(new Event("toggle"));
    });
    await flush();
    expect(host.querySelector<HTMLElement>("[data-evidence-task]")?.dataset.canContribute).toBe(
      "false",
    );
  });

  it.each([
    { canExecute: true, cancelled: false, readOnly: false, allowReview: true },
    { canExecute: false, cancelled: false, readOnly: true, allowReview: true },
    { canExecute: true, cancelled: true, readOnly: true, allowReview: false },
  ])("uses exact task scope and execution access for submission (%j)", async (access) => {
    m.load.mockResolvedValue({
      items: [
        {
          ...task,
          assignment_mode: "person",
          can_claim: false,
          can_execute: access.canExecute,
          cancelled: access.cancelled,
        },
      ],
      nextAfterActionId: null,
    });
    await render();
    await openTask();
    const submission = [...host.querySelectorAll("details")].find(
      (d) =>
        d.querySelector("summary")?.textContent ===
        (access.readOnly ? "Se afleveringsversioner" : "Aflevering og historik"),
    )!;
    await act(async () => {
      submission.open = true;
      submission.dispatchEvent(new Event("toggle"));
    });
    await flush();

    const panel = host.querySelector<HTMLElement>("[data-submission-task]")!;
    expect(panel.dataset).toMatchObject({
      submissionTask: task.action_id,
      actor: task.user_id,
      project: task.project_id,
      organization: task.organization_id,
      readOnly: String(access.readOnly),
      allowReview: String(access.allowReview),
    });
    if (access.readOnly) return;

    await click("Synthetic edit submission");
    expect(panel.closest("fieldset")?.disabled).toBe(false);
    expect(
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent === "Opdater opgaver",
      )?.disabled,
    ).toBe(true);
    await click("Synthetic cancel submission");

    const status = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Status og logbog",
    )!;
    await act(async () => {
      status.open = true;
      status.dispatchEvent(new Event("toggle"));
    });
    await flush();
    await click("Synthetic edit status");
    expect(panel.closest("fieldset")?.disabled).toBe(true);
  });

  it("opens exact-task documentation as read-only and retains the status editor lock", async () => {
    await render();
    await openTask();
    const details = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Se dokumentation",
    )!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    await flush();
    expect(host.querySelector("[data-evidence-task]")?.getAttribute("data-evidence-task")).toBe(
      task.action_id,
    );
    expect(host.querySelector("[data-evidence-task]")?.getAttribute("data-can-contribute")).toBe(
      "false",
    );
    const status = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Status og logbog",
    )!;
    await act(async () => {
      status.open = true;
      status.dispatchEvent(new Event("toggle"));
    });
    await flush();
    await click("Synthetic edit status");
    await click("Synthetic original complete");
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Opdater opgaver")
        ?.disabled,
    ).toBe(true);
    await click("Synthetic cancel status");
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Opdater opgaver")
        ?.disabled,
    ).toBe(false);
  });
  it("locks list refresh and claim while a nested status or note draft is open", async () => {
    await render();
    await openTask();
    const detail = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Status og logbog",
    )!;
    await act(async () => {
      detail.open = true;
      detail.dispatchEvent(new Event("toggle"));
    });
    await flush();
    await click("Synthetic edit status");
    expect(
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent === "← Tilbage til opgavelisten",
      )?.disabled,
    ).toBe(true);
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Opdater opgaver")
        ?.disabled,
    ).toBe(true);
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Overtag opgaven")
        ?.disabled,
    ).toBe(true);
    await click("Synthetic cancel status");
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Opdater opgaver")
        ?.disabled,
    ).toBe(false);
  });
  it("opens exact task instructions for external users without opening the project", async () => {
    await render();
    expect(host.textContent).toContain("Synthetic instructions");
    expect(host.querySelector('a[href="/app/projects/$slug"]')).toBeNull();
    expect(m.load).toHaveBeenCalledWith({
      data: { expectedActorId: id(1), afterActionId: null, pageSize: 20, filter: "all" },
    });
  });
  it("reuses the same claim request and frozen versions after a lost response", async () => {
    await render();
    await openTask();
    await click("Overtag opgaven");
    await click("← Tilbage til opgavelisten");
    await openTask();
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
    await openTask();
    expect(host.textContent).not.toContain("Gå til status og logbog");
    await click("Overtag opgaven");
    expect(host.textContent).toContain("Overtaget af dig");
    await click("Gå til status og logbog");
    expect(document.activeElement?.textContent).toBe("Status og logbog");
    expect(document.activeElement?.parentElement?.hasAttribute("open")).toBe(true);
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
  it("opens one task with immediate instructions and carries its exact identity to execution", async () => {
    m.load.mockResolvedValue({ items: [{ ...task, can_plan: true }], nextAfterActionId: null });
    await render();
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.parentElement?.hidden).toBe(
      true,
    );
    await openTask();
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.parentElement?.hidden).toBe(
      false,
    );
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.textContent).toContain(
      "Synthetic instructions",
    );
    expect(
      JSON.parse(host.querySelector('a[href="/app/projects/$slug"]')!.getAttribute("data-search")!),
    ).toEqual({ step: "udfoerelse", task: id(2), work: "execution" });
    expect(JSON.parse(host.querySelector('a[href="/felt"]')!.getAttribute("data-search")!)).toEqual(
      { project: id(4), task: id(2) },
    );
    await click("← Tilbage til opgavelisten");
    expect(host.querySelector('[aria-label="Opgavens instruktion"]')?.parentElement?.hidden).toBe(
      true,
    );
  });
});
