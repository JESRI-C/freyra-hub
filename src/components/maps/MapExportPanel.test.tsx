// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { GeoFeatureCollection } from "@/services/geospatial-service";
const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  auth: {
    user: { id: "reader" },
    currentOrg: { id: "org", projects: [{ id: "case" }, { id: "other" }] },
    loading: false,
    refreshing: false,
  },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/services/audit-service", () => ({ logProjectExportRequest: mocks.audit }));
import { MapExportPanel } from "./MapExportPanel";
const collection: GeoFeatureCollection = {
  type: "FeatureCollection",
  projectId: "case",
  projectName: "DEMO",
  generatedAt: "2026-11-17T12:00:00Z",
  features: [],
};
let host: HTMLDivElement;
let root: Root;
let click: ReturnType<typeof vi.spyOn>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
async function render(
  projectId = "case",
  data: GeoFeatureCollection | null = collection,
  reason: string | null = null,
) {
  await act(async () =>
    root.render(
      <MapExportPanel
        geoJSON={data}
        projectId={projectId}
        projectName="DEMO"
        disabledReason={reason}
      />,
    ),
  );
}
async function exportClick(csv = false) {
  await act(async () => {
    const button = [...host.querySelectorAll("button")].find((node) =>
      node.textContent?.includes(csv ? "Download punktdata" : "Download GeoJSON"),
    )!;
    button.click();
  });
}
beforeEach(() => {
  mocks.auth.user = { id: "reader" };
  mocks.auth.currentOrg = { id: "org", projects: [{ id: "case" }, { id: "other" }] };
  mocks.auth.refreshing = false;
  mocks.audit.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => "blob:map"),
      revokeObjectURL: vi.fn(),
    }),
  );
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("waits for the actor-bound project receipt before creating a file", async () => {
  let release!: () => void;
  mocks.audit.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await render();
  await exportClick();
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: "reader", projectId: "case", format: "geojson" }),
  );
  expect(click).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  await act(async () => release());
  expect(click).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:map");
});
it.each([false, true])("does not download after an audit denial (CSV %s)", async (csv) => {
  mocks.audit.mockRejectedValue(new Error("Eksport afvist"));
  await render();
  await exportClick(csv);
  expect(click).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Eksport afvist");
});
it.each(["actor", "project", "membership", "source"])(
  "cancels a pending file after %s changes",
  async (change) => {
    let release!: () => void;
    mocks.audit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await render();
    await exportClick();
    if (change === "actor") mocks.auth.user = { id: "new-user" };
    if (change === "membership") mocks.auth.currentOrg.projects = [];
    await render(
      change === "project" ? "other" : "case",
      change === "project" ? { ...collection, projectId: "other" } : collection,
      change === "source" ? "Kortdata kunne ikke hentes" : null,
    );
    await act(async () => release());
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  },
);
it("rejects a collection for another project and a failed source", async () => {
  await render("other");
  await exportClick();
  expect(mocks.audit).not.toHaveBeenCalled();
  await render("case", null, "Henter data");
  expect([...host.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
});
