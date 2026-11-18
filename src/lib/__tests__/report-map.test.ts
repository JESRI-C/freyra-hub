import { describe, expect, it } from "vitest";
import { isOnReportMap, offsetReportMap, placeReportMapLabels, reportMapPlan } from "../report-map";
describe("report basemap viewport", () => {
  it("renders a saved viewport independently of its sources and retains original point numbers", () => {
    const viewport = { center: [9.41, 55.21] as [number, number], zoom: 17 };
    const plan = reportMapPlan([[12, 57], viewport.center], 1250, 620, viewport);
    expect(plan.points[1]).toEqual([625, 310]);
    expect(isOnReportMap(plan.points[0])).toBe(false);
    expect(
      placeReportMapLabels(plan.points, 1250, 620, true).map((label) => label.index + 1),
    ).toEqual([2]);
    expect(reportMapPlan([], 1250, 620, viewport).tiles).toEqual(plan.tiles);
    expect(() => reportMapPlan([], 1250, 620, { ...viewport, zoom: 30 })).toThrow();
  });
  it("pans in the same projected pixels used to render the export", () => {
    const initial = reportMapPlan([
      [9.4, 55.2],
      [9.42, 55.21],
    ]).viewport;
    const moved = offsetReportMap(initial, 125, -62);
    const [point] = reportMapPlan([initial.center], 1250, 620, moved).points;
    expect(point[0]).toBeCloseTo(500, 6);
    expect(point[1]).toBeCloseTo(372, 6);
    const east = offsetReportMap({ center: [179.99, 55], zoom: 15 }, 1000, 0);
    expect(east.center[0]).toBeLessThan(-179);
  });
  it("keeps all six numbers readable with tightly spaced camera pairs", () => {
    const points: [number, number][] = [
      [40, 40],
      [41, 41],
      [350, 220],
      [353, 222],
      [900, 440],
      [900, 440],
    ];
    const labels = placeReportMapLabels(points);
    expect(labels.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const [index, a] of labels.entries()) {
      expect(a.left).toBeGreaterThanOrEqual(2);
      expect(a.top).toBeGreaterThanOrEqual(2);
      for (const b of labels.slice(index + 1)) {
        expect(
          a.left < b.left + b.width &&
            a.left + a.width > b.left &&
            a.top < b.top + b.height &&
            a.top + a.height > b.top,
        ).toBe(false);
      }
    }
  });
  it("bounds tile requests and preserves point order for a stream reach", () => {
    const plan = reportMapPlan([
      [9.4, 55.2],
      [9.41, 55.21],
      [9.42, 55.22],
    ]);
    expect(plan.tiles.length).toBeLessThanOrEqual(32);
    expect(plan.points).toHaveLength(3);
    expect(plan.points.every(([x, y]) => x >= 0 && x <= 1250 && y >= 0 && y <= 620)).toBe(true);
    expect(plan.tiles.every((t) => t.url.startsWith("https://tile.openstreetmap.org/"))).toBe(true);
  });
  it("does not invent a map center without GPS", () => {
    expect(() => reportMapPlan([])).toThrow();
    expect(() => reportMapPlan([[400, 99]])).toThrow();
  });
  it("limits zoom for single-point surveys", () => {
    const plan = reportMapPlan([[9.4, 55.2]]);
    expect(plan.zoom).toBe(18);
    expect(plan.points[0]).toEqual([625, 310]);
    expect(plan.scale.meters).toBe(50);
    expect(plan.scale.pixels).toBeGreaterThan(145);
    expect(plan.scale.pixels).toBeLessThan(150);
  });
});
