// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  actor,
  id,
  scope,
  version,
  execution,
} from "@/services/__tests__/work-order-evidence-fixture";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  sources: vi.fn(),
  executions: vi.fn(),
  readExecution: vi.fn(),
  save: vi.fn(),
  original: vi.fn(),
  editing: vi.fn(),
  blocker: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ useBlocker: m.blocker }));
vi.mock("@/lib/work-order-access.functions", () => ({ getProjectWorkOrderAccess: m.access }));
vi.mock("@/lib/work-order-evidence.functions", () => ({
  listProjectWorkOrderEvidence: m.list,
  listProjectWorkOrderEvidenceSources: m.sources,
  listProjectWorkOrderEvidenceExecutions: m.executions,
  saveProjectWorkOrderEvidence: m.save,
  getProjectWorkOrderEvidenceOriginal: m.original,
}));
vi.mock("@/lib/work-order-execution.functions", () => ({
  readProjectWorkOrderExecutionBinding: m.readExecution,
}));
import { WorkOrderEvidencePanel } from "../WorkOrderEvidencePanel";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
async function render(canContribute = true, actorId = actor) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderEvidencePanel
          key={actorId}
          scope={scope}
          actionId={scope.actionId}
          actorId={actorId}
          canContribute={canContribute}
          onEditing={m.editing}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === text)!;
async function click(text: string) {
  expect(button(text)).toBeTruthy();
  await act(async () => button(text).click());
  await flush();
}
async function fill(label: string, value: string) {
  const node = [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.startsWith(label))!
    .querySelector("select,textarea")!;
  await act(async () => {
    const proto =
      node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value);
    node.dispatchEvent(
      new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
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
  m.access.mockResolvedValue({
    user_id: actor,
    action_id: scope.actionId,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    can_execute: true,
  });
  m.list.mockResolvedValue({ items: [version()], nextAfterId: null });
  m.executions.mockResolvedValue({
    items: [{ ...execution(), id: execution().workspace_entry_id }],
    nextAfterId: null,
  });
  m.readExecution.mockResolvedValue(execution());
  m.sources.mockImplementation(async ({ data }) => ({
    items: [
      data.kind === "photo"
        ? { id: id(51), label: "Bækfoto", version: null, sha256: "a".repeat(64) }
        : { id: id(47), label: "Besigtigelse", version: 1, sha256: null },
    ],
    nextAfterId: null,
  }));
  m.save.mockResolvedValue(version());
  m.original.mockRejectedValue(new Error("Originalen er tilbagekaldt"));
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
describe("task documentation UI", () => {
  it("lets the user pin a performed version explicitly and preserves it across retries", async () => {
    m.save.mockRejectedValueOnce(new Error("Mistet svar"));
    await render();
    expect(m.executions).not.toHaveBeenCalled();
    await click("Ret kobling");
    const select = [...host.querySelectorAll("select")].find((s) =>
      s.closest("label")?.textContent?.startsWith("Udført arbejde"),
    )!;
    expect(select.value).toBe("");
    await fill("Udført arbejde", execution().workspace_entry_id);
    await fill("Begrundelse", "Dokumenterer denne udførelse");
    await submit();
    await submit();
    expect(m.save.mock.calls[0][0].data.executionRevisionId).toBe(execution().workspace_entry_id);
    expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]);
  });
  it("reads the selected historical execution lazily without substituting a newer version", async () => {
    m.list.mockResolvedValue({
      items: [{ ...version(), execution_revision_id: execution().workspace_entry_id }],
      nextAfterId: null,
    });
    await render(false);
    expect(m.readExecution).not.toHaveBeenCalled();
    const detail = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Se tilknyttet udførelse",
    )!;
    await act(async () => {
      detail.open = true;
      detail.dispatchEvent(new Event("toggle"));
    });
    await flush();
    expect(m.readExecution).toHaveBeenCalledWith({
      data: {
        ...scope,
        expectedActorId: actor,
        previousRevisionId: execution().workspace_entry_id,
      },
    });
    expect(host.textContent).toContain("Udførelse version 2");
    expect(host.textContent).toContain("Håndskæring");
    expect(host.textContent).toContain("Udføreren er ikke knyttet");
    expect(m.executions).not.toHaveBeenCalled();
  });
  it("hides cached execution details after failed reauthorization", async () => {
    m.list.mockResolvedValue({
      items: [{ ...version(), execution_revision_id: execution().workspace_entry_id }],
      nextAfterId: null,
    });
    await render(false);
    const detail = [...host.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Se tilknyttet udførelse",
    )!;
    await act(async () => {
      detail.open = true;
      detail.dispatchEvent(new Event("toggle"));
    });
    await flush();
    m.readExecution.mockRejectedValue(new Error("Udførelsen er ikke tilgængelig"));
    await act(async () =>
      cache.invalidateQueries({ queryKey: ["work-order-execution-reference"] }),
    );
    await flush();
    expect(host.textContent).not.toContain("Håndskæring");
    expect(host.textContent).toContain("Udførelsen er ikke tilgængelig");
  });
  it("shows zero, false, unknown date and history without querying all project sources", async () => {
    await render();
    expect(host.textContent).toContain("Ukendt");
    expect(host.querySelector("dd")?.textContent).toBe("0");
    expect([...host.querySelectorAll("dd")].map((n) => n.textContent)).toEqual([
      "0",
      "Nej",
      "Ukendt",
    ]);
    expect(m.sources).not.toHaveBeenCalled();
  });
  it("retries a lost reply with exactly the same evidence and request identities", async () => {
    m.save.mockRejectedValueOnce(new Error("Mistet svar"));
    await render();
    await click("Tilknyt registrering og foto");
    await fill("Gemt feltregistrering", id(47));
    await fill("Verificeret originalfoto", id(51));
    await fill("Begrundelse", "Foto af registreringen");
    expect(m.editing).toHaveBeenLastCalledWith(true);
    await submit();
    expect(host.querySelector("textarea")?.value).toBe("Foto af registreringen");
    await submit();
    expect(m.save).toHaveBeenCalledTimes(2);
    expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]);
    expect(host.querySelector("form")).toBeNull();
    expect(m.editing).toHaveBeenLastCalledWith(false);
  });
  it("preserves the draft and expected version on conflict", async () => {
    m.save.mockRejectedValue(new Error("Opgaven er ændret. Genindlæs før du gemmer."));
    await render();
    await click("Ret kobling");
    await fill("Begrundelse", "Rettelse skal bevares");
    await submit();
    expect(m.save.mock.calls[0][0].data).toMatchObject({
      evidenceId: version().evidence_id,
      expectedVersion: 1,
    });
    await click("Genindlæs historik");
    expect(host.querySelector("textarea")?.value).toBe("Rettelse skal bevares");
  });
  it("hides snapshots on failed reauthorization while retaining the draft for retry", async () => {
    await render();
    await click("Ret kobling");
    await fill("Begrundelse", "Gem min kladde");
    m.access.mockRejectedValueOnce(new Error("Adgang kunne ikke kontrolleres"));
    await act(async () => cache.invalidateQueries({ queryKey: ["work-order-evidence-access"] }));
    await flush();
    expect(host.textContent).not.toContain("kobling version 1");
    await click("Kontrollér igen");
    expect(host.querySelector("textarea")?.value).toBe("Gem min kladde");
  });
  it("offers read-only exact-task documentation to external assignees without source enumeration", async () => {
    await render(false);
    expect(button("Tilknyt registrering og foto")).toBeUndefined();
    expect(button("Ret kobling")).toBeUndefined();
    await click("Åbn originalfoto");
    expect(m.original).toHaveBeenCalledWith({
      data: { ...scope, id: version().id, expectedActorId: actor },
    });
    expect(m.sources).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Originalen er tilbagekaldt");
  });
  it("does not reuse another actor's cache or open draft", async () => {
    await render();
    await click("Ret kobling");
    await fill("Begrundelse", "Privat kladde");
    m.access.mockRejectedValue(new Error("Ingen adgang"));
    await render(false, id(2));
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).not.toContain("Privat kladde");
    expect(m.access).toHaveBeenLastCalledWith({ data: scope });
  });
  it("uses a new withdrawal revision without altering the pinned sources", async () => {
    await render();
    await click("Træk kobling tilbage");
    expect(m.sources).not.toHaveBeenCalled();
    await fill("Begrundelse", "Forkert sammenhæng");
    await submit();
    expect(m.save.mock.calls[0][0].data).toMatchObject({
      state: "withdrawn",
      expectedVersion: 1,
      observationVersionId: version().observation_version_id,
      uploadId: version().upload_id,
    });
  });
  it("disables save on source errors instead of showing an empty successful state", async () => {
    m.sources.mockRejectedValue(new Error("Kilden kunne ikke læses"));
    await render();
    await click("Tilknyt registrering og foto");
    expect(host.textContent).toContain("Kilden kunne ikke læses");
    expect(button("Gem dokumentation").disabled).toBe(true);
    expect(host.textContent).not.toContain("Der er ingen verificerede feltfotos");
  });
});
