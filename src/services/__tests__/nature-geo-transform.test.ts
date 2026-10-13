import { describe, it, expect } from "vitest";
import {
  natureCandidatesForDisplay,
  nativeNaturePointForDisplay,
  NATURE_DISPLAY_PROJECTION,
} from "@/services/nature-geo-transform";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import type { WaterPlanNaturePayload } from "@/services/baseline/water-plan-nature-source";
import { natureCatalogueFixture } from "./nature-geo.fixtures";

describe("native catalogue display projection", () => {
  it.each([
    [
      [516971.46, 6135460.08],
      [9.267746972, 55.365161528],
    ],
    [
      [516861.31, 6136017.79],
      [9.266042848, 55.370176781],
    ],
  ] as const)(
    "agrees with paired official coordinates %j without a survey accuracy claim",
    (native, lngLat) => {
      const display = nativeNaturePointForDisplay(native);
      expect(Math.abs(display[0] - lngLat[0])).toBeLessThan(0.000001);
      expect(Math.abs(display[1] - lngLat[1])).toBeLessThan(0.000001);
      expect(NATURE_DISPLAY_PROJECTION).toMatchObject({
        sourceCrs: "EPSG:25832",
        displayCrs: "EPSG:4326",
        displayAxisOrder: "lng-lat",
        surveyAccuracyVerified: false,
        heightTransformed: false,
      });
      expect(NATURE_DISPLAY_PROJECTION.datumAssumption).toContain("without-epoch-or-grid-shift");
    },
  );
  it.each([{ point: [9.26, 55.36] }, { point: [516000, 6135000, 1] }, { point: [NaN, 6135000] }])(
    "rejects swapped/geographic/nonfinite/height coordinates %j",
    ({ point }) => {
      expect(() => nativeNaturePointForDisplay(point as [number, number])).toThrow();
    },
  );
  it("uses unknown display status for code0 even when the raw source label sounds approved", async () => {
    const payload = (await natureCatalogueFixture()).payload as unknown as WaterPlanNaturePayload;
    const candidate = payload.products[0].candidates[0];
    if (candidate.kind === "vp3-watercourses") throw new Error("Wrong test fixture");
    candidate.status = {
      code: 0,
      name: "Gældende / Vedtaget",
      interpretation: "unknown",
      legalApproval: false,
    };
    const feature = natureCandidatesForDisplay(payload).paragraph3.features[0];
    expect(feature.properties.registryStatus).toBe("Ukendt");
    expect(feature.properties.registryStatusSourceLabel).toBe("Gældende / Vedtaget");
  });
  it("projects candidate geometries without mutating native payload or inventing project metrics", async () => {
    const source = await natureCatalogueFixture();
    const payload = source.payload as unknown as WaterPlanNaturePayload;
    const before = await baselineSha256(payload);
    const display = natureCandidatesForDisplay(payload);
    expect(display.paragraph3.features).toHaveLength(2);
    expect(display.watercourses.features).toHaveLength(1);
    const geometry = display.paragraph3.features[0].geometry.coordinates as number[][][][];
    expect(geometry[0][0][0][0]).toBeGreaterThan(9);
    expect(geometry[0][0][0][1]).toBeGreaterThan(55);
    expect(geometry[0][0][0][0]).toBeLessThan(10);
    expect(await baselineSha256(payload)).toBe(before);
    expect(display.paragraph3.features[1].properties).toMatchObject({
      registryStatus: "Ukendt",
      registryStatusCode: 0,
      scope: "bbox_candidate",
      juridicalPresenceAssessed: false,
      reportAccepted: false,
    });
    expect(JSON.stringify(display)).not.toMatch(
      /Shape_area|paragraph3AreasHa|protected_nature_present|watercourse_present|Bruger_id|Sagsbeh|Journalnr|DKRIVER2580/,
    );
  });
  it.each(["incomplete", "metrics", "duplicate-product", "wrong-crs"])(
    "rejects corrupt display contract %s",
    async (change) => {
      const payload = (await natureCatalogueFixture()).payload as unknown as WaterPlanNaturePayload;
      if (change === "incomplete") payload.products.pop();
      if (change === "metrics") Object.assign(payload, { metricsCalculated: true });
      if (change === "duplicate-product") payload.products[1] = payload.products[0];
      if (change === "wrong-crs")
        Object.assign(payload.products[0].candidates[0], { geometryCrs: "EPSG:4326" });
      expect(() => natureCandidatesForDisplay(payload)).toThrow();
    },
  );
});
describe("isOpenDataLiveEnabled", () => {
  it("keeps the existing explicit public-live flag semantics", async () => {
    const { isOpenDataLiveEnabled } = await import("@/lib/nature-geo.functions");
    expect(isOpenDataLiveEnabled({})).toBe(true);
    expect(isOpenDataLiveEnabled({ VITE_ENABLE_LIVE_DATA: "true" })).toBe(true);
    expect(isOpenDataLiveEnabled({ VITE_ENABLE_LIVE_DATA: "false" })).toBe(false);
    expect(isOpenDataLiveEnabled({ ENABLE_LIVE_DATA: "0" })).toBe(false);
    expect(isOpenDataLiveEnabled({ ENABLE_LIVE_DATA: "off" })).toBe(false);
    expect(
      isOpenDataLiveEnabled({ ENABLE_LIVE_DATA: "true", VITE_ENABLE_LIVE_DATA: "false" }),
    ).toBe(true);
  });
});
