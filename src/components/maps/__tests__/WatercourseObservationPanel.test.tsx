// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { WatercourseObservationPanel } from "../WatercourseObservationPanel";

const api = vi.hoisted(() => ({
  photos: vi.fn(),
  get: vi.fn(),
  lines: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  approve: vi.fn(),
}));
vi.mock("@/services/project-media-service", () => ({
  listWatercoursePhotos: api.photos,
  getProjectMedia: api.get,
}));
vi.mock("@/services/watercourse-service", () => ({
  getWatercourseVersions: api.lines,
  saveWatercourseVersion: vi.fn(),
}));
vi.mock("@/services/watercourse-observations", async (original) => ({
  ...(await original<typeof import("@/services/watercourse-observations")>()),
  listWatercourseObservations: api.list,
  createWatercourseObservation: api.create,
  approveWatercourseObservation: api.approve,
}));
const entry = {
  id: "photo-1",
  title: "DJI_0239.JPG",
  localCaptureDate: "2026-09-16",
  coordinates: { lat: 55.327, lng: 9.267 },
};
const saved = {
  id: "obs-1",
  kind: "vegetation",
  text: "Synlig brink",
  feature_key: "brink-1",
  source_ids: [entry.id],
  comparison: null,
  centerline_version_id: "line-2",
  segment_id: "s2",
  determination_level: "observed",
  quality_flags: [],
  watercourse_observation_reviews: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  api.photos.mockResolvedValue([entry, { id: "old-satellite", title: "Satellitbillede" }]);
  api.get.mockResolvedValue({
    data: { id: entry.id, title: entry.title, url: "/private-v1.jpg", category: "drone_image" },
  });
  api.lines.mockResolvedValue([
    {
      id: "line-2",
      version: 2,
      length_m: 250,
      method: "gemt metode",
      source: "officiel linje",
      segments: [{ id: "s2", name: "Bykær Bæk", fromM: 100, toM: 250 }],
    },
  ]);
  api.list.mockResolvedValue([saved]);
  api.create.mockResolvedValue(saved);
});

it.each([true, false])(
  "reopens scoped local-date originals with edit access %s",
  async (canEdit) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const button = (label: string) =>
      [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
    const click = async (label: string) => {
      const target = button(label);
      expect(target).toBeDefined();
      await act(async () => target!.click());
    };
    const waitFor = async (check: () => unknown) => {
      await act(async () => {
        await vi.waitFor(check, { timeout: 10_000 });
      });
    };
    try {
      await act(async () =>
        root.render(
          <QueryClientProvider client={cache}>
            <WatercourseObservationPanel
              actorId="actor"
              projectId="project"
              organizationId="org"
              canEdit={canEdit}
            />
          </QueryClientProvider>,
        ),
      );
      expect(api.photos).not.toHaveBeenCalled();
      await act(async () => {
        host.querySelector("details")!.open = true;
        host.querySelector("details")!.dispatchEvent(new Event("toggle"));
      });
      await waitFor(() => expect(api.list).toHaveBeenCalledWith("project", "org"));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(api.get).not.toHaveBeenCalled();
      expect(Boolean(host.querySelector('input[type="file"]'))).toBe(canEdit);
      expect(Boolean(button("Gem observation til gennemgang"))).toBe(canEdit);
      expect(Boolean(button("Jeg har gennemgået kilder og forbehold - godkend"))).toBe(canEdit);
      await click("Åbn kildefoto");
      await waitFor(() => expect(api.get).toHaveBeenCalledWith("project", entry.id));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(host.textContent).toContain("2026-09-16 (lokal kameradato, tidszone ukendt)");
      expect(host.querySelector("img")?.getAttribute("src")).toBe("/private-v1.jpg");
      expect(host.textContent).toContain("Bykær Bæk");
      expect(api.approve).not.toHaveBeenCalled();
      if (canEdit) {
        const segment = [...host.querySelectorAll("select")].find((s) =>
          [...s.options].some((o) => o.value === "s2"),
        )!;
        await act(async () => {
          segment.value = "s2";
          segment.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await act(async () => {
          const key = host.querySelector<HTMLInputElement>('input[placeholder*="trægruppe"]')!;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            key,
            "brink-1",
          );
          key.dispatchEvent(new Event("input", { bubbles: true }));
          const note = host.querySelector("textarea")!;
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
            note,
            "Synlig brink",
          );
          note.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await click("Gem observation til gennemgang");
        expect(api.create).toHaveBeenCalledWith(
          expect.objectContaining({
            project_id: "project",
            organization_id: "org",
            source_ids: [entry.id],
            comparison: null,
            segment_id: "s2",
            centerline_version_id: "line-2",
            text: "Synlig brink",
            feature_key: "brink-1",
          }),
        );
        expect(api.approve).not.toHaveBeenCalled();
        await click("Jeg har gennemgået kilder og forbehold - godkend");
        expect(api.approve).toHaveBeenCalledWith("obs-1");
      }
      api.get.mockResolvedValueOnce({ data: null, error: "Adgang ændret" });
      await click("Åbn kildefoto");
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(host.querySelector("img")).toBeNull();
      expect(host.textContent).toContain("Adgang ændret");
    } finally {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
      vi.unstubAllGlobals();
    }
  },
);
