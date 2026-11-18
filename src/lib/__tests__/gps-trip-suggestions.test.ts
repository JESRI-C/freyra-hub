import { describe, expect, it } from "vitest";
import { suggestGpsTrips } from "../gps-trip-suggestions";

function fix(minute: number, longitude: number, id = String(minute)) {
  return {
    id,
    measured_at: new Date(Date.UTC(2026, 10, 17, 10, minute)).toISOString(),
    latitude: 55,
    longitude,
  };
}

describe("GPS trip suggestions", () => {
  it("splits at a measured stop and after a gap without inventing endpoints", () => {
    const points = [
      fix(0, 9),
      fix(1, 9.0002),
      fix(2, 9.002),
      fix(3, 9.004),
      fix(13, 9.0041),
      fix(14, 9.006),
      fix(16, 9.008),
      fix(40, 9.03),
      fix(41, 9.032),
    ].reverse();
    expect(suggestGpsTrips(points).map(({ start, end }) => [start.id, end.id])).toEqual([
      ["40", "41"],
      ["13", "16"],
      ["1", "3"],
    ]);
  });

  it("ignores nearby position noise and repeated measurement times", () => {
    expect(
      suggestGpsTrips([
        fix(0, 9),
        fix(0, 10, "duplicate"),
        fix(2, 9.0002),
        fix(4, 9.0005),
        fix(14, 9.0004),
      ]),
    ).toEqual([]);
    expect(suggestGpsTrips([fix(0, 9), fix(16, 9.1)])).toEqual([]);
    expect(suggestGpsTrips([])).toEqual([]);
  });
});
