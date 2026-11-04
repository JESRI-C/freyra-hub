// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reviewActor as actorId,
  reviewContext,
  reviewId as id,
  reviewScope as scope,
} from "@/services/__tests__/work-order-review-fixture";
import { WorkOrderRequestError } from "@/lib/work-order-access";
const m = vi.hoisted(() => ({
  context: vi.fn(),
  mutate: vi.fn(),
  saveReport: vi.fn(),
  editing: vi.fn(),
  phase: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: vi.fn(),
  Link: ({
    children,
    search,
    to,
    params,
  }: {
    children: React.ReactNode;
    search: Record<string, string> | ((previous: Record<string, string>) => Record<string, string>);
    to: string;
    params?: { slug: string };
  }) => (
    <a
      href={`${to.replace("$slug", params?.slug ?? "")}?${new URLSearchParams(typeof search === "function" ? search({}) : search)}`}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/services/report-document-service", () => ({
  saveApprovedWorkOrderReport: m.saveReport,
}));
vi.mock("@/lib/work-order-submission.functions", () => ({
  getProjectWorkOrderReviewContext: m.context,
}));
vi.mock("@/lib/work-order-lifecycle.functions", () => ({
  mutateProjectWorkOrderLifecycle: m.mutate,
}));
import { WorkOrderReviewControls } from "../WorkOrderReviewControls";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 15));
  });
}
async function render(props: Partial<React.ComponentProps<typeof WorkOrderReviewControls>> = {}) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderReviewControls
          scope={scope}
          actorId={actorId}
          disabledByParent={false}
          parentAuthorized
          readOnly={false}
          allowReview
          active
          onEditing={m.editing}
          onPhase={m.phase}
          {...props}
        />
      </QueryClientProvider>,
    ),
  );
  await settle();
  await settle();
}
function button(name: string) {
  return [...host.querySelectorAll("button")].find((b) => b.textContent === name);
}
async function click(name: string) {
  expect(button(name), name).toBeTruthy();
  await act(async () => button(name)!.click());
  await settle();
}
async function fill(text = "Synthetic scope, findings and coverage") {
  const el = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  m.context.mockResolvedValue(reviewContext());
  m.mutate.mockResolvedValue({});
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
describe("version-bound review on the existing task", () => {
  it("explains the next step on a returned delivery with and without a reopen action", async () => {
    const context = reviewContext();
    m.context.mockResolvedValue({
      ...context,
      can_reopen: true,
      can_review: false,
      state: { ...context.state, status: "returned", reason: "Tilføj foto af afslutningen." },
    });
    await render();
    expect(host.textContent).toContain("Tilføj foto af afslutningen.");
    expect(host.textContent).toContain("Genåbn opgaven for at rette manglerne");

    await render({ readOnly: true });
    expect(host.textContent).toContain("En person med adgang til at genåbne opgaven");
    expect(host.textContent).not.toContain("Genåbn opgaven for at rette manglerne");
  });
  it("keeps the return reason for the reopened version next to correction shortcuts", async () => {
    const context = reviewContext();
    const openCorrection = vi.fn();
    m.context.mockResolvedValue({
      ...context,
      state: { ...context.state, status: "reopened", reason: "Genåbnet efter gennemgang." },
      recent_reviews: [
        {
          state: {
            ...context.state,
            id: id(21),
            status: "returned",
            reason: "Tilføj foto af afslutningen.",
          },
          submission_version: 1,
        },
      ],
    });
    await render({ onOpenCorrection: openCorrection });
    const heading = [...host.querySelectorAll("h4")].find(
      (node) => node.textContent === "Ret den genåbnede aflevering",
    );
    expect(heading?.parentElement?.textContent).toContain("Mangler i afleveringsversion 1");
    expect(heading?.parentElement?.textContent).toContain("Tilføj foto af afslutningen.");
    await click("Åbn udførelsen");
    await click("Åbn dokumentationen");
    const note = { submissionVersion: 1, reason: "Tilføj foto af afslutningen." };
    expect(openCorrection.mock.calls).toEqual([
      ["execution", note],
      ["evidence", note],
    ]);
    await render({ readOnly: true, onOpenCorrection: openCorrection });
    expect(button("Åbn dokumentationen")).toBeUndefined();
  });
  it("does not let the author or performer review their own material", async () => {
    m.context.mockResolvedValue({ ...reviewContext(), self_review: true, can_review: false });
    await render();
    expect(button("Godkend denne aflevering")).toBeUndefined();
    expect(button("Returnér med mangler")).toBeUndefined();
    expect(host.textContent).toContain("En anden autoriseret reviewer");
  });
  it("allows stale material to be returned while blocking approval", async () => {
    cache.setQueryDefaults(["field-job-actions"], { gcTime: Infinity });
    const ownKey = [
      "field-job-actions",
      actorId,
      { organizationId: scope.organizationId, projectId: scope.projectId },
    ];
    const otherKey = [
      "field-job-actions",
      id(90),
      { organizationId: scope.organizationId, projectId: scope.projectId },
    ];
    cache.setQueryData(ownKey, [{ id: scope.actionId, status: "submitted" }]);
    cache.setQueryData(otherKey, [{ id: scope.actionId, status: "submitted" }]);
    m.context.mockResolvedValue({ ...reviewContext(), packet_current: false });
    await render();
    expect(button("Godkend denne aflevering")?.disabled).toBe(true);
    expect(button("Returnér med mangler")?.disabled).toBe(false);
    await click("Returnér med mangler");
    await fill();
    await click("Gem afleveringshandling");
    expect(m.mutate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...scope,
        expectedActorId: actorId,
        expectedVersion: 6,
        values: expect.objectContaining({
          operation: "review",
          targetStatus: "returned",
          submissionVersionId: id(8),
          reviewScope: "execution_and_documentation",
        }),
      }),
    });
    expect(cache.getQueryState(ownKey)?.isInvalidated).toBe(true);
    expect(cache.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });
  it("keeps the exact receipt identity and note after a lost response, even when context refreshes", async () => {
    m.mutate.mockRejectedValueOnce(new Error("Lost response")).mockResolvedValueOnce({});
    await render();
    await click("Godkend denne aflevering");
    await fill();
    await click("Gem afleveringshandling");
    const first = structuredClone(m.mutate.mock.calls[0][0]);
    expect(host.querySelector("textarea")?.value).toContain("Synthetic scope");
    expect(host.querySelector("textarea")?.disabled).toBe(true);
    expect(m.editing).toHaveBeenLastCalledWith(true);
    await click("Prøv samme handling igen");
    expect(m.mutate.mock.calls[1][0]).toEqual(first);
    expect(host.querySelector("textarea")).toBeNull();
    expect(m.editing).toHaveBeenLastCalledWith(false);
  });
  it("enables the task-scoped reviewer entry without enabling preparation or reopening", async () => {
    await render({ readOnly: true, allowReview: true });
    expect(button("Godkend denne aflevering")).toBeDefined();
    expect(button("Aflevér til gennemgang")).toBeUndefined();
    expect(button("Genåbn til rettelse")).toBeUndefined();
    await render({ readOnly: true, allowReview: false });
    expect(button("Godkend denne aflevering")).toBeUndefined();
  });
  it("retains a dirty review on view changes and quarantines state after parent access failure", async () => {
    await render();
    await click("Returnér med mangler");
    await fill();
    const calls = m.context.mock.calls.length;
    await render({ active: false });
    await render({ active: true });
    expect(m.context.mock.calls.length).toBe(calls);
    expect(host.querySelector("textarea")?.value).toContain("Synthetic scope");
    await render({ parentAuthorized: false, disabledByParent: true });
    expect(host.querySelector("textarea")?.value).toContain("Synthetic scope");
    expect(button("Gem afleveringshandling")?.disabled).toBe(true);
    expect(button("Godkend denne aflevering")).toBeUndefined();
  });
  it("checks actor identity before exposing state or actions", async () => {
    m.context.mockResolvedValue({ ...reviewContext(), user_id: id(99) });
    await render();
    expect(button("Godkend denne aflevering")).toBeUndefined();
    expect(host.textContent).not.toContain("Status: Afleveret");
  });
  it("rechecks access after a denied mutation while keeping the user's note", async () => {
    await render();
    await click("Godkend denne aflevering");
    await fill();
    m.mutate.mockRejectedValueOnce(new WorkOrderRequestError("access"));
    m.context.mockRejectedValue(new WorkOrderRequestError("access"));
    await click("Gem afleveringshandling");
    await settle();
    expect(host.querySelector("textarea")?.value).toContain("Synthetic scope");
    expect(button("Gem afleveringshandling")?.disabled).toBe(true);
    expect(host.textContent).not.toContain("Status: Afleveret");
  });
});

it("opens the saved report on exactly the approved packet and review", async () => {
  const c = reviewContext();
  m.context.mockResolvedValue({
    ...c,
    state: { ...c.state, id: id(20), status: "approved", operation: "review" },
  });
  m.saveReport.mockResolvedValue({
    report_id: id(21),
    version: 1,
    content: { workOrderApproval: { reviewId: id(20) } },
  });
  await render();
  expect(button("Klargør rapportkladde for afleveringsversion 1")).toBeUndefined();
  const openFollowUpPlan = vi.fn();
  const createFollowUp = vi.fn();
  await render({
    canCreateReport: true,
    onOpenFollowUpPlan: openFollowUpPlan,
    onCreateApprovedFollowUp: createFollowUp,
  });
  await click("Åbn arbejdsgrundlaget for opfølgning");
  expect(openFollowUpPlan).toHaveBeenCalledOnce();
  await click("Opret opfølgning fra godkendt plan");
  expect(createFollowUp).toHaveBeenCalledWith(c.packet);
  await click(`Klargør rapportkladde for afleveringsversion ${c.packet!.version}`);
  expect(host.textContent).toContain("Rapportkladden er klar");
  expect(m.saveReport).toHaveBeenCalledWith({
    ...scope,
    submissionId: c.packet!.id,
    reviewId: id(20),
  });
  expect(host.querySelector('a[href^="/app/reports/preview"]')?.getAttribute("href")).toBe(
    `/app/reports/preview?report=${id(21)}&version=1`,
  );
});

it("opens the historical approval after the task has been reopened", async () => {
  const c = reviewContext();
  const createFollowUp = vi.fn();
  m.context.mockResolvedValue({
    ...c,
    state: { ...c.state, status: "reopened" },
    recent_reviews: [
      {
        state: {
          ...c.state,
          id: id(22),
          status: "approved",
          operation: "review",
          submission_version_id: id(23),
          plan_version_id: id(25),
        },
        submission_version: 1,
      },
    ],
  });
  m.saveReport.mockResolvedValue({
    report_id: id(24),
    version: 1,
    content: { workOrderApproval: { reviewId: id(22) } },
  });
  await render({ canCreateReport: true, onCreateApprovedFollowUp: createFollowUp });
  await click("Opret opfølgning fra afleveringsversion 1");
  expect(createFollowUp).toHaveBeenCalledWith({ id: id(23), version: 1, plan_version_id: id(25) });
  const historicalLink = [...host.querySelectorAll("a")].find(
    (link) => link.textContent === "Se afleveringsversion 1",
  );
  expect(historicalLink?.getAttribute("href")).toBe(
    `/app/projects/${scope.projectId}?tab=handlinger&task=${scope.actionId}&work=submission&submissionVersion=1`,
  );
  await click("Klargør rapportkladde for afleveringsversion 1");
  expect(m.saveReport).toHaveBeenCalledWith({
    ...scope,
    submissionId: id(23),
    reviewId: id(22),
  });
});
