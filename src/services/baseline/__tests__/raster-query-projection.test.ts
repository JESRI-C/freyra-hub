import { describe, expect, it } from "vitest";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { buildRasterQueryProjection, projectRasterQueryPoint } from "../raster-query-projection";

const POLYGON: GeoJSONPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [9.26, 55.363],
      [9.27, 55.363],
      [9.27, 55.367],
      [9.26, 55.367],
      [9.26, 55.363],
    ],
  ],
};
describe("declared ETRS89 catalogue envelopes", () => {
  it("reproduces the actual three-product metadata probe envelope for the synthetic technical area", () => {
    // Root's public 13Oct2026 probe returned HTTP200 for all three metadata
    // catalogues; this polygon has not been agreed as a municipal reach.
    const result = buildRasterQueryProjection({
      type: "Polygon",
      coordinates: [
        [
          [9.249033116, 55.336099018],
          [9.273036068, 55.336099018],
          [9.273036068, 55.373372295],
          [9.249033116, 55.373372295],
          [9.249033116, 55.336099018],
        ],
      ],
    });
    expect(result.bbox).toEqual([515756, 6132196, 517345, 6136401]);
    expect(result.queryBufferM).toBe(25);
    expect(result.edgeSampleStepDegrees).toBe(0.01);
    expect(result.surveyAccuracyVerified).toBe(false);
    expect(result.heightTransformed).toBe(false);
  });
  it("agrees with the official PROJ UTM32/GRS80 example, without a survey claim", () => {
    // Primary PROJ UTM docs: 12E,56N -> 687071.44,6210141.33.
    const result = projectRasterQueryPoint([12, 56]);
    expect(Math.abs(result[0] - 687071.44)).toBeLessThan(0.02);
    expect(Math.abs(result[1] - 6210141.33)).toBeLessThan(0.02);
  });
  it.each([
    [
      [9.267746972, 55.365161528],
      [516971.46, 6135460.08],
    ],
    [
      [9.266042848, 55.370176781],
      [516861.31, 6136017.79],
    ],
  ] as const)(
    "agrees with paired Bykær WFS coordinate %j within 2cm, not ground accuracy",
    (lngLat, native) => {
      // Source1233766a..., root13Oct2026 dualCRS200, nativebodySHA
      // 2947c9ed75261031f024648d1a37c4bd84be9c89b3e9d535a101bff50ba1e96c.
      // The whole308-point root probe found max0.0037774m disagreement.
      const result = projectRasterQueryPoint(lngLat);
      expect(Math.hypot(result[0] - native[0], result[1] - native[1])).toBeLessThan(0.02);
    },
  );
  it("densifies edges, expands25m, rounds outward and records datum/epoch limitations", () => {
    const polygon: GeoJSONPolygon = {
      type: "Polygon",
      coordinates: [
        [
          [9, 55],
          [10, 55],
          [10, 56],
          [9, 56],
          [9, 55],
        ],
      ],
    };
    const envelope = buildRasterQueryProjection(polygon);
    expect(envelope.queryCrs).toBe("EPSG:25832");
    expect(envelope.sourceAxisOrder).toBe("lng-lat");
    expect(envelope.projectedSampleCount).toBeGreaterThan(4);
    expect(envelope.surveyAccuracyVerified).toBe(false);
    expect(envelope.heightTransformed).toBe(false);
    expect(envelope.datumAssumption).toContain("without-epoch-or-grid-shift");
    for (let x = 9; x <= 10; x += 0.05)
      for (let y = 55; y <= 56; y += 0.05) {
        const point = projectRasterQueryPoint([x, y]);
        expect(point[0]).toBeGreaterThanOrEqual(envelope.bbox[0] + 24);
        expect(point[0]).toBeLessThanOrEqual(envelope.bbox[2] - 24);
        expect(point[1]).toBeGreaterThanOrEqual(envelope.bbox[1] + 24);
        expect(point[1]).toBeLessThanOrEqual(envelope.bbox[3] - 24);
      }
  });
  it("never mutates canonical geometry or accepts swapped axes/height coordinates", () => {
    const copy = structuredClone(POLYGON);
    buildRasterQueryProjection(POLYGON);
    expect(POLYGON).toEqual(copy);
    expect(() => projectRasterQueryPoint([55.36, 9.26])).toThrow();
    expect(() => projectRasterQueryPoint([9.26, 55.36, 12] as never)).toThrow();
    expect(() => projectRasterQueryPoint([NaN, 55.36])).toThrow();
  });
  it("bounds edge sampling before a complex valid area can consume unbounded CPU", () => {
    const ring: [number, number][] = [];
    for (let index = 0; index < 400; index++) {
      const angle = (2 * Math.PI * index) / 400;
      const radius = index % 2 === 0 ? 1 : 0.2;
      ring.push([11.5 + 4.4 * radius * Math.cos(angle), 56 + 1.9 * radius * Math.sin(angle)]);
    }
    ring.push([...ring[0]]);
    expect(() => buildRasterQueryProjection({ type: "Polygon", coordinates: [ring] })).toThrow(
      "forespørgselsgrænsen",
    );
  });
});
