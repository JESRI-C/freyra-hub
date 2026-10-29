// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  actions: vi.fn(),
  templates: vi.fn(),
  history: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "actor" } }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));
vi.mock("@/lib/field-job-access.functions", () => ({ getFieldJobAccess: mocks.access }));
vi.mock("@/services/field-job-cards-service", () => ({
  listFieldJobActions: mocks.actions,
  listFieldJobTemplates: mocks.templates,
  listFieldJobVersions: mocks.history,
  saveFieldJobVersion: mocks.save,
  saveFieldJobTemplate: vi.fn(),
}));
import { FieldJobCardsPanel } from "../FieldJobCardsPanel";
const scope = { organizationId: "org", projectId: "project" };
const definition = {
  schema: "freyra.field-job-template/v1",
  title: "Besøg",
  domain: "nature",
  fields: [
    { key: "count", label: "Antal", type: "number", required: true },
    { key: "present", label: "Tilstede", type: "boolean", required: true },
    { key: "notes", label: "Faglig note", type: "text", required: true },
  ],
};
const old = { id: "old", template_id: "stable", version: 1, definition };
const newer = {
  id: "new",
  template_id: "stable",
  version: 2,
  definition: {
    ...definition,
    fields: [{ key: "count", label: "Ny overskrift", type: "number", required: true }],
  },
};
const row = {
  id: "record",
  action_id: "action",
  template_version_id: "old",
  version: 1,
  values: { count: 0, present: false },
  status: "draft",
  created_at: "2026-10-29T08:00:00Z",
  correction_reason: "",
};
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function open() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <FieldJobCardsPanel scope={scope} />
      </QueryClientProvider>,
    ),
  );
  await settle();
  await settle();
  const select = host.querySelector("select")!;
  await act(async () => {
    select.value = "action";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  await settle();
}
describe("job card editor", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    mocks.access.mockResolvedValue({
      userId: "actor",
      projectId: "project",
      canConfigure: true,
      canContribute: true,
    });
    mocks.actions.mockResolvedValue([{ id: "action", title: "Tilsyn", status: "Åben" }]);
    mocks.templates.mockResolvedValue([newer, old]);
    mocks.history.mockResolvedValue([row]);
    mocks.save.mockResolvedValue({ ...row, version: 2 });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    cache.clear();
    host.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  it("reopens the pinned template and preserves zero and false", async () => {
    await open();
    expect(host.textContent).toContain("skabelonversion 1");
    expect(host.textContent).toContain("Faglig note");
    expect(host.querySelector('input[type="number"]')?.getAttribute("value")).toBe("0");
    const selects = [...host.querySelectorAll("select")];
    expect(selects.some((s) => s.value === "false")).toBe(true);
    expect(host.textContent).toContain("Mangler kan gemmes");
  });
  it("keeps viewer forms read only", async () => {
    mocks.access.mockResolvedValue({
      userId: "actor",
      projectId: "project",
      canConfigure: false,
      canContribute: false,
    });
    await open();
    expect(host.textContent).toContain("læseadgang");
    expect(
      [...host.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("Gem registreringsversion"),
      ),
    ).toBe(false);
    expect(host.querySelector('input[type="number"]')?.hasAttribute("disabled")).toBe(true);
  });
  it("saves incomplete answers against the pinned version and explicit correction", async () => {
    await open();
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        "Feltkontrol",
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Gem registreringsversion",
    )!;
    await act(async () => save.click());
    await settle();
    expect(mocks.save).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        templateVersionId: "old",
        expectedVersion: 1,
        values: { count: 0, present: false },
        correctionReason: "Feltkontrol",
      }),
    );
  });
  it("uses the shared task without another picker and releases its lock only after explicitly cancelling the draft", async () => {
    const editing = vi.fn();
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <FieldJobCardsPanel scope={scope} selectedActionId="action" onEditing={editing} />
        </QueryClientProvider>,
      ),
    );
    await settle();
    await settle();
    expect(
      [...host.querySelectorAll("select")].some((select) =>
        [...select.options].some((option) => option.value === "action"),
      ),
    ).toBe(false);
    const count = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(count, "12");
      count.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(editing).toHaveBeenLastCalledWith(true);
    const cancel = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Fortryd ændringer i jobkort",
    )!;
    await act(async () => cancel.click());
    expect(count.value).toBe("0");
    expect(editing).toHaveBeenLastCalledWith(false);
  });
});
