import { describe, expect, it } from "vitest";
import { reportMapPlan } from "../report-map";
describe("report basemap viewport", () => {
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
  });
});
