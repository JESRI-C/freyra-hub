import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  createServerFn: () => ({
    middleware() {
      return this;
    },
    inputValidator: () => ({
      handler: (callback: (args: unknown) => Promise<unknown>) => callback,
    }),
  }),
}));
import { parseNatureGeoInput } from "@/lib/nature-geo.functions";
import { fetchEnvironmentalBundle } from "@/lib/environmental.functions";
it("rejects an unscoped legacy nature request before any network or DB writes", () => {
  expect(() => parseNatureGeoInput({ projectId: "other-tenant", lat: 55, lng: 9 })).toThrow();
});
it("blocks the old point-derived bundle rather than returning fabricated overlap and climate values", async () => {
  await expect(
    fetchEnvironmentalBundle({ data: { lat: 55, lng: 9, areaHa: 100 } }),
  ).rejects.toThrow("ingen preview-tal");
});
