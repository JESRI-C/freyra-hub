// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldWorkPack } from "@/lib/field-offline";
const f = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  project: "22222222-2222-4222-8222-222222222222",
  action: "33333333-3333-4333-8333-333333333333",
  packs: vi.fn(),
  enqueue: vi.fn(),
  prepare: vi.fn(),
  photo: vi.fn(),
  blocker: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: f.blocker,
  Link: ({
    children,
    to,
    params: _params,
    search: _search,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    params?: unknown;
    search?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: null }));
vi.mock("@/services/field-offline-store", () => ({
  openFieldOfflineStore: async () => ({
    packs: f.packs,
    enqueue: f.enqueue,
    items: async () => [],
    close: () => {},
  }),
}));
vi.mock("@/services/field-offline-sync", () => ({ drainFieldOfflineQueue: async () => 0 }));
vi.mock("@/services/field-offline-service", () => ({
  offlineSyncDependencies: () => ({}),
  prepareOfflineJob: f.prepare,
  prepareOfflinePhoto: f.photo,
  downloadFieldWorkPack: vi.fn(),
  requireOfflineOnlineActor: vi.fn(),
}));
vi.mock("@/services/field-offline-shell", () => ({
  checkFieldOfflineShell: async () => true,
  prepareFieldOfflineShell: vi.fn(),
}));
import { FieldOfflineWorkspace } from "../FieldOfflineWorkspace";
let root: ReturnType<typeof createRoot> | undefined, host: HTMLDivElement;
const pack = (): FieldWorkPack => {
  const template = {
    id: crypto.randomUUID(),
    template_id: crypto.randomUUID(),
    organization_id: crypto.randomUUID(),
    project_id: f.project,
    version: 1,
    request_id: crypto.randomUUID(),
    created_by: f.actor,
    created_at: new Date().toISOString(),
    definition: {
      schema: "freyra.field-job-template/v1" as const,
      title: "Tilsyn",
      domain: "general" as const,
      fields: [
        { key: "count", label: "Antal", type: "number" as const, unit: "stk.", required: true },
        { key: "seen", label: "Observeret", type: "boolean" as const, required: true },
      ],
    },
  };
  return {
    actorId: f.actor,
    projectId: f.project,
    organizationId: template.organization_id,
    projectName: "Testsag",
    savedAt: 1000,
    jobs: [
      {
        actionId: f.action,
        title: "Feltbesøg",
        template,
        latest: {
          id: crypto.randomUUID(),
          organization_id: template.organization_id,
          project_id: f.project,
          action_id: f.action,
          template_version_id: template.id,
          version: 1,
          request_id: crypto.randomUUID(),
          created_by: f.actor,
          created_at: new Date().toISOString(),
          values: { count: 0, seen: false },
          status: "draft",
          correction_reason: null,
        },
      },
    ],
  };
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("freyra-field-device-v1", f.actor);
  f.packs.mockResolvedValue([pack()]);
  f.prepare.mockReturnValue({ id: "local" });
  f.enqueue.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function edit() {
  await act(async () => root!.render(<FieldOfflineWorkspace requestedProject={f.project} />));
  const task = Array.from(host.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.value === f.action),
  )!;
  await act(async () => {
    task.value = f.action;
    task.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const reason = Array.from(host.querySelectorAll("label"))
    .find((l) => l.textContent?.includes("Begrundelse"))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      reason,
      "Feltbesøg",
    );
    reason.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Gem registrering på telefonen"),
  )!;
}
describe("mobile field local save feedback", () => {
  it("retains a rejected camera file for download and retry instead of discarding the selection", async () => {
    f.photo.mockResolvedValue({ id: "photo" });
    f.enqueue.mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
    await act(async () => root!.render(<FieldOfflineWorkspace requestedProject={f.project} />));
    const camera = host.querySelector<HTMLInputElement>('input[capture="environment"]')!;
    Object.defineProperty(camera, "files", {
      value: [new File(["raw"], "camera.png", { type: "image/png" })],
    });
    await act(async () => camera.dispatchEvent(new Event("change", { bubbles: true })));
    expect(host.textContent).toContain("1 originaler er endnu ikke gemt");
    expect(host.textContent).toContain("Hent ikke-gemt original: camera.png");
    expect(f.blocker.mock.calls.at(-1)?.[0].enableBeforeUnload).toBe(true);
    const retry = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Prøv at gemme de resterende"),
    )!;
    f.enqueue.mockResolvedValue(undefined);
    await act(async () => retry.click());
    expect(f.enqueue.mock.calls[1][1]).toBe(f.enqueue.mock.calls[0][1]);
    expect(host.textContent).toContain("1 af 1 originaler er gemt på telefonen.");
    expect(host.textContent).not.toContain("1 originaler er endnu ikke gemt");
    expect(f.blocker.mock.calls.at(-1)?.[0].enableBeforeUnload).toBe(false);
  });
  it("acknowledges only a committed local save and preserves false, zero and field units", async () => {
    let commit!: () => void;
    f.enqueue.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          commit = resolve;
        }),
    );
    const save = await edit();
    expect(host.textContent).toContain("Antal (stk.)");
    await act(async () => save.click());
    expect(host.textContent).not.toContain("Registreringen er gemt på telefonen.");
    expect(f.prepare.mock.calls.at(-1)?.[2]).toMatchObject({
      values: { count: 0, seen: false },
      correctionReason: "Feltbesøg",
    });
    await act(async () => commit());
    expect(host.textContent).toContain("Registreringen er gemt på telefonen.");
  });
  it("keeps the form and reason after quota failure instead of confirming a save", async () => {
    f.enqueue.mockRejectedValue(new DOMException("Lageret er fuldt", "QuotaExceededError"));
    const save = await edit();
    await act(async () => save.click());
    expect(host.textContent).toContain("Telefonens lager er fuldt");
    expect(host.textContent).not.toContain("Registreringen er gemt på telefonen.");
    expect(Array.from(host.querySelectorAll("input")).some((i) => i.value === "Feltbesøg")).toBe(
      true,
    );
  });
});
