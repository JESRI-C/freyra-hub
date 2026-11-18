// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { PhotoComparisonPanel } from "../PhotoComparisonPanel";

const media = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock("@/services/project-media-service", () => ({
  listComparisonPhotos: media.list,
  getProjectMedia: media.get,
}));
vi.mock("@/services/photo-comparison-service", () => ({
  listPhotoComparisons: async () => [],
  latestPhotoComparisons: () => [],
}));
vi.mock("@/services/action-execution-service", () => ({ listActionExecutions: async () => [] }));

it("loads only a complete selected pair and recovers from an unavailable original", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const scope = { projectId: crypto.randomUUID(), organizationId: crypto.randomUUID() };
  const photos = ["Før", "Efter", "Anden strækning"].map((title, index) => ({
    id: crypto.randomUUID(),
    projectId: scope.projectId,
    title,
    capturedAt: `2026-09-0${index + 1}T12:00:00Z`,
    sha256: String(index + 1).repeat(64),
  }));
  const [before, after] = photos;
  media.list.mockResolvedValue(photos);
  let secondPhotoAvailable = false;
  media.get.mockImplementation(async (_projectId, id) =>
    id === after.id && !secondPhotoAvailable
      ? { data: null, error: "Kunne ikke hente foto" }
      : { data: { url: `/original/${id}` }, error: null },
  );
  const client = new QueryClient();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (text: string) =>
    Array.from(host.querySelectorAll("button")).find((element) => element.textContent === text);
  async function select(label: string, value: string) {
    const element = Array.from(host.querySelectorAll("label"))
      .find((item) => item.textContent?.trimStart().startsWith(label))
      ?.querySelector("select");
    if (!element) throw new Error(`Manglende felt: ${label}`);
    await act(async () => {
      element.value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  // React Query batches notifications outside the original DOM event.
  async function eventually(check: () => void) {
    await vi.waitFor(async () => {
      await act(async () => {});
      check();
    });
  }
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PhotoComparisonPanel scope={scope} canEdit />
        </QueryClientProvider>,
      ),
    );
    const create = "Opret beskrivende sammenligning";
    await eventually(() => expect(button(create)?.disabled).toBe(false));
    expect(media.list).toHaveBeenCalledWith(scope.projectId);
    expect(media.get).not.toHaveBeenCalled();
    await act(async () => button(create)!.click());
    await select("Før-original", before.id);
    expect(media.get).not.toHaveBeenCalled();
    await select("Efter-original", before.id);
    expect(media.get).not.toHaveBeenCalled();
    await select("Efter-original", after.id);
    await eventually(() => expect(button("Prøv igen")).toBeDefined());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Billedparret kunne ikke åbnes",
    );
    const expected = [
      [scope.projectId, before.id],
      [scope.projectId, after.id],
    ];
    expect(media.get.mock.calls).toEqual(expected);
    expect(host.querySelector("img")).toBeNull();

    secondPhotoAvailable = true;
    await act(async () => button("Prøv igen")!.click());
    await eventually(() => expect(host.querySelectorAll("img")).toHaveLength(2));
    expect(media.get.mock.calls).toEqual([...expected, ...expected]);
    expect(host.querySelector('img[alt^="Tidligere"]')?.getAttribute("src")).toBe(
      `/original/${before.id}`,
    );
    expect(host.querySelector('img[alt^="Senere"]')?.getAttribute("src")).toBe(
      `/original/${after.id}`,
    );
    expect(button("Prøv igen")).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.unstubAllGlobals();
  }
});
