// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePhotoAtlas } from "@/lib/photo-atlas";
const m = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/maps/MapEditorMap", () => ({ MapEditorMap: () => null }));
vi.mock("../FieldPhotoPositionsPanel", () => ({ FieldPhotoPositionsPanel: () => null }));
vi.mock("@/services/photo-atlas-service", () => ({
  listPhotoAtlasSources: async () => [
    { id: "atlas", title: "Gemt atlas", created_at: "2026-11-01T12:00:00Z" },
  ],
  loadPhotoAtlas: m.load,
  listPhotoAtlasReviews: async () => [],
  latestPhotoAtlasReviews: () => new Map(),
  savePhotoAtlasReview: m.save,
  importPhotoAtlas: vi.fn(),
}));
import { ProjectPhotoAtlas } from "../ProjectPhotoAtlas";
const scope = {
  projectId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
};
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function render(available: boolean) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <ProjectPhotoAtlas
          scope={scope}
          projectName="Pilot"
          organizationName="Test"
          purpose="Pleje"
          canEdit
          mediaAvailable={available}
          media={[{ id: "original", title: "Liveoriginal" } as never]}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function observation() {
  return [...document.querySelectorAll("label")]
    .find((label) => label.firstChild?.textContent?.trim() === "Synligt på fotoet")!
    .querySelector("textarea")!;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  m.load.mockResolvedValue({
    ...parsePhotoAtlas(
      JSON.stringify({
        photos: [{ id: "foto-1", filename: "foto.jpg", source: "https://original.example/photo" }],
      }),
    ),
    evidenceId: "atlas",
    checksum: "a".repeat(64),
  });
  m.save.mockResolvedValue({});
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
describe("retained atlas during unavailable signed-media list", () => {
  it("keeps the real portal review draft but blocks stale-list actions until media is checked again", async () => {
    await render(true);
    await flush();
    const photo = [...host.querySelectorAll("button")].find(
      (button) =>
        button.textContent?.includes("foto-1") && button.textContent?.includes("foto.jpg"),
    )!;
    expect(photo).toBeTruthy();
    await act(async () => photo.click());
    await flush();
    const input = observation();
    expect(host.contains(input)).toBe(false); // Real Dialog portal, outside the route container.
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        input,
        "Ugemt faglig observation",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await render(false);
    expect(observation()).toBe(input);
    expect(input.value).toBe("Ugemt faglig observation");
    expect(input.disabled).toBe(true);
    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Gem fotogennemgang som ny version",
    )!;
    expect(save.disabled).toBe(true);
    expect(
      [...document.querySelectorAll("a")].some(
        (link) => link.textContent === "Åbn originalens kildehenvisning",
      ),
    ).toBe(false);
    expect(document.body.textContent).not.toContain("Liveoriginal");
    const build = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Byg fotoatlas fra sagens originaler",
    )!;
    expect(build.disabled).toBe(true);
    await act(async () =>
      input
        .closest("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(m.save).not.toHaveBeenCalled();
    await render(true);
    expect(observation()).toBe(input);
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("Ugemt faglig observation");
    await act(async () => save.click());
    await flush();
    expect(m.save).toHaveBeenCalledWith(
      scope,
      "atlas",
      "foto-1",
      expect.objectContaining({ observation: "Ugemt faglig observation" }),
      undefined,
    );
  });
});
