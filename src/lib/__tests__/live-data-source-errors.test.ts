import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectGeometry } from "@/lib/supabase/types";

const clients = vi.hoisted(() => ({
  dmiClient: { fetchByGeometry: vi.fn(), fetchPreview: vi.fn() },
  miljoeportalClient: { fetchByGeometry: vi.fn(), fetchPreview: vi.fn() },
  dataforsyningenClient: { fetchByGeometry: vi.fn(), fetchPreview: vi.fn() },
  copernicusClient: { fetchByGeometry: vi.fn(), fetchPreview: vi.fn() },
}));
vi.mock("@/services/live-data", () => clients);
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: () => ({ handler: (handler: unknown) => handler }),
  }),
}));

import { fetchProjectLiveData } from "@/lib/live-data.functions";

const geometry: ProjectGeometry = {
  polygon: null,
  centroid: { lat: 55.249, lng: 9.487 },
  areaHa: null,
  hasValidGeometry: true,
  geometrySource: "manual",
  bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const client of Object.values(clients)) {
    client.fetchByGeometry.mockResolvedValue({
      data: null,
      mode: "error",
      status: "no_coverage",
      latencyMs: 0,
      fetchedAt: "2026-10-13T10:00:00Z",
    });
  }
});

describe("server live data bundle", () => {
  it.each([
    ["weather", "dmiClient"],
    ["nature", "miljoeportalClient"],
    ["places", "dataforsyningenClient"],
    ["satellite", "copernicusClient"],
  ] as const)(
    "preserves a thrown %s source error and never calls preview",
    async (source, clientName) => {
      clients[clientName].fetchByGeometry.mockRejectedValue(new Error("Source unavailable"));
      const bundle = await fetchProjectLiveData({ data: { geometry } });
      expect(bundle[source]).toMatchObject({
        data: null,
        mode: "error",
        status: "error",
        error: "Source unavailable",
      });
      for (const client of Object.values(clients))
        expect(client.fetchPreview).not.toHaveBeenCalled();
    },
  );

  it("keeps independent successful source results when another source times out", async () => {
    clients.dmiClient.fetchByGeometry.mockRejectedValue(
      new DOMException("Cancelled", "AbortError"),
    );
    clients.copernicusClient.fetchByGeometry.mockResolvedValue({
      data: { scenes: [{ id: "real-scene" }], ndviIsSimulated: false },
      mode: "live",
      status: "ok",
      latencyMs: 12,
      fetchedAt: "2026-10-13T10:00:00Z",
    });
    const bundle = await fetchProjectLiveData({ data: { geometry } });
    expect(bundle.weather).toMatchObject({ data: null, mode: "error", status: "timeout" });
    expect(bundle.satellite).toMatchObject({
      mode: "live",
      status: "ok",
      data: { ndviIsSimulated: false },
    });
  });
});
