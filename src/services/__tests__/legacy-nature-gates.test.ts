import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: () => ({
      handler: (callback: (args: unknown) => Promise<unknown>) => callback,
    }),
  }),
}));
import { fetchAndIngestNatureGeo } from "@/lib/nature-geo.functions";
import { fetchEnvironmentalBundle } from "@/lib/environmental.functions";
it("blocks legacy service-role nature ingest before any network or DB writes", async () => {
  await expect(
    fetchAndIngestNatureGeo({ data: { projectId: "other-tenant", lat: 55, lng: 9 } }),
  ).rejects.toThrow("projektadgang");
});
it("blocks the old point-derived bundle rather than returning fabricated overlap and climate values", async () => {
  await expect(
    fetchEnvironmentalBundle({ data: { lat: 55, lng: 9, areaHa: 100 } }),
  ).rejects.toThrow("ingen preview-tal");
});
