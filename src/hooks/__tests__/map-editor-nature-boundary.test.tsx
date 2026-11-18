// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useMapEditor } from "../useMapEditor";
import type { Project } from "@/lib/supabase/types";

const mocks = vi.hoisted(() => ({ nature: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: true, supabase: null }));
vi.mock("@/services/nature/paragraph3-service", () => ({
  fetchNatureData: mocks.nature,
  fetchWatercourses: async () => [],
}));
vi.mock("@/services/zones-service", () => ({
  getZonesByProject: async () => [],
  createZone: vi.fn(),
  updateZone: vi.fn(),
  deleteZone: vi.fn(),
}));
vi.mock("../useProjectMapDevices", () => ({
  useProjectMapDevices: () => ({ points: [], onlinePercent: null, status: "Ingen enheder" }),
}));
vi.mock("@/services/projects-service", () => ({
  BoundaryOperationInProgressError: class extends Error {},
  clearProjectBoundary: vi.fn(),
  persistProjectBoundary: vi.fn(),
  createBoundaryOperationGuard: () => ({ run: (fn: () => unknown) => fn() }),
  projectBoundaryMutationErrorMessage: () => "Fejl",
}));
const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [9.48, 55.25],
      [9.49, 55.25],
      [9.49, 55.26],
      [9.48, 55.26],
      [9.48, 55.25],
    ],
  ],
};
const secondPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [9.48, 55.25],
      [9.495, 55.25],
      [9.49, 55.26],
      [9.48, 55.26],
      [9.48, 55.25],
    ],
  ],
};
const project = {
  id: "project-one",
  geometry_polygon: polygon,
  geometry_centroid_lat: 55.255,
  geometry_centroid_lng: 9.485,
  geometry_area_ha: 70,
} as unknown as Project;
const result = {
  p3: { mode: "live", overlapPercent: 24, areas: [] },
  species: { mode: "live", species: [] },
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let current: ReturnType<typeof useMapEditor>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function Probe({ value }: { value: Project | null }) {
  current = useMapEditor(value);
  return <span>{current.natureStatus}</span>;
}
async function render(value: Project | null) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe value={value} />
      </QueryClientProvider>,
    );
  });
}
async function settled() {
  for (let attempt = 0; attempt < 40; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (!client.isFetching()) return;
  }
  throw Error("Queries did not settle");
}
beforeEach(() => {
  mocks.nature.mockReset().mockResolvedValue(result);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});

it("uses the exact stored polygon and separates projects and shape revisions in the cache", async () => {
  await render(project);
  await settled();
  expect(mocks.nature).toHaveBeenLastCalledWith(55.255, 9.485, 70, polygon);
  expect(current.coverage.nature).toBe(24);
  await render({ ...project, id: "project-two" });
  await settled();
  expect(mocks.nature).toHaveBeenCalledTimes(2);
  await render({ ...project, id: "project-two", geometry_polygon: secondPolygon });
  await settled();
  expect(mocks.nature).toHaveBeenCalledTimes(3);
  expect(mocks.nature).toHaveBeenLastCalledWith(55.255, 9.485, 70, secondPolygon);
});
it.each([
  null,
  { type: "Point", coordinates: [9.48, 55.25] },
  { type: "Polygon", coordinates: [] },
])("does not invent a boundary or zero overlap for %j", async (geometry) => {
  await render({ ...project, geometry_polygon: geometry });
  await settled();
  expect(mocks.nature).not.toHaveBeenCalled();
  expect(current.coverage.nature).toBeNull();
  expect(current.natureStatus).toMatch(/gyldig projektgrænse/);
});
it("removes previous overlap when the boundary is cleared", async () => {
  await render(project);
  await settled();
  expect(current.coverage.nature).toBe(24);
  await render({ ...project, geometry_polygon: null });
  await settled();
  expect(current.coverage.nature).toBeNull();
  expect(current.paragraph3Areas).toEqual([]);
  expect(mocks.nature).toHaveBeenCalledTimes(1);
});
it("suppresses a previous successful value after a failed refresh", async () => {
  await render(project);
  await settled();
  expect(current.coverage.nature).toBe(24);
  mocks.nature.mockRejectedValue(new Error("source failed"));
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["nature-data"] });
  });
  await settled();
  expect(current.coverage.nature).toBeNull();
  expect(current.natureStatus).toMatch(/kunne ikke hentes/);
  expect(current.paragraph3Areas).toEqual([]);
});
it("does not reject valid zero coordinates", async () => {
  await render({ ...project, geometry_centroid_lat: 0, geometry_centroid_lng: 0 });
  await settled();
  expect(mocks.nature).toHaveBeenCalledWith(0, 0, 70, polygon);
});
