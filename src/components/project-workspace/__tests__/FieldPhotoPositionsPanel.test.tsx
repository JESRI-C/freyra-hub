// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  photos: vi.fn(),
  policy: vi.fn(),
  history: vi.fn(),
  save: vi.fn(),
  savePolicy: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "actor" } }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/field-job-access.functions", () => ({ getFieldJobAccess: mocks.access }));
vi.mock("@/services/field-photo-position-service", () => ({
  listFieldPhotos: mocks.photos,
  getFieldPhotoPolicy: mocks.policy,
  listFieldPhotoPositions: mocks.history,
  saveFieldPhotoPosition: mocks.save,
  saveFieldPhotoPolicy: mocks.savePolicy,
}));
import { FieldPhotoPositionsPanel } from "../FieldPhotoPositionsPanel";
const scope = { projectId: "project", organizationId: "org" };
const photo = {
  id: "photo",
  title: "Feltfoto",
  lat: 55,
  lng: 10,
  metadata: {
    field_photo_capture: {
      schema: "freyra.field-photo/v1",
      originalPosition: { lat: 55, lng: 10 },
    },
  },
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
        <FieldPhotoPositionsPanel scope={scope} />
      </QueryClientProvider>,
    ),
  );
  await settle();
  await settle();
  const select = host.querySelector("select")!;
  await act(async () => {
    select.value = "photo";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  await settle();
}
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("field photo position editor", () => {
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
    mocks.photos.mockResolvedValue([photo]);
    mocks.policy.mockResolvedValue(null);
    mocks.history.mockResolvedValue([]);
    mocks.save.mockResolvedValue({});
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    cache.clear();
    host.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  it("allows a point beyond 50 metres to be recorded for clarification", async () => {
    await open();
    await input(host.querySelectorAll("input")[0], "55.001");
    await input(host.querySelector("textarea")!, "Camera GPS offset");
    expect(host.textContent).toContain("Over afstandsgrænsen");
    const save = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Gem observationssted som ny version",
    )!;
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    await settle();
    expect(mocks.save).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        mediaId: "photo",
        point: { lat: 55.001, lng: 10 },
        reason: "Camera GPS offset",
        expectedVersion: 0,
        expectedPolicyVersion: 0,
      }),
    );
    expect(host.textContent).toContain("Originalens GPS er bevaret");
  });
  it("marks a manually placed photograph without original GPS as unverified", async () => {
    mocks.photos.mockResolvedValue([
      {
        ...photo,
        lat: null,
        lng: null,
        metadata: {
          field_photo_capture: { schema: "freyra.field-photo/v1", originalPosition: null },
        },
      },
    ]);
    await open();
    await input(host.querySelectorAll("input")[0], "55");
    await input(host.querySelectorAll("input")[1], "10");
    expect(host.textContent).toContain("Originalposition mangler");
    expect(host.textContent).toContain("Afstand kan ikke bestemmes");
  });
  it("keeps the opening versions when background data changes during editing", async () => {
    await open();
    await input(host.querySelector("textarea")!, "My original edit");
    mocks.history.mockResolvedValue([
      {
        id: "other",
        version: 1,
        lat: 55.002,
        lng: 10,
        status: "needs_review",
        reason: "Other writer",
        radius_m: 50,
        policy_version: 0,
        created_at: "2026-10-29T10:00:00Z",
        created_by: "other",
      },
    ]);
    mocks.policy.mockResolvedValue({ version: 1, radius_m: 10 });
    await act(async () => {
      await cache.invalidateQueries();
    });
    await settle();
    const save = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Gem observationssted som ny version",
    )!;
    await act(async () => save.click());
    await settle();
    expect(mocks.save).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        expectedVersion: 0,
        expectedPolicyVersion: 0,
        reason: "My original edit",
      }),
    );
  });
  it("does not offer write or policy actions to a viewer", async () => {
    mocks.access.mockResolvedValue({
      userId: "actor",
      projectId: "project",
      canConfigure: false,
      canContribute: false,
    });
    await open();
    expect(host.querySelector("input")?.disabled).toBe(true);
    expect([...host.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Gem"))).toBe(
      false,
    );
  });
});
vi.mock("../FieldPhotoReceiptPanel", () => ({ FieldPhotoReceiptPanel: () => null }));
