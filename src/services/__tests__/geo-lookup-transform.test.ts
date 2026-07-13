import { describe, it, expect } from "vitest";
import {
  ensureClosedRing,
  ringToWkt,
  ringToDawaPolygonParam,
  jordstykkeLabel,
  jordstykkeAreaHa,
  markblokLabel,
  markblokAreaHa,
  capResults,
  downsampleRing,
  type LngLat,
} from "@/services/geo-lookup-transform";

const OPEN_RING: LngLat[] = [
  [9.4, 55.2],
  [9.5, 55.2],
  [9.5, 55.3],
];

describe("ensureClosedRing", () => {
  it("lukker en åben ring", () => {
    const closed = ensureClosedRing(OPEN_RING);
    expect(closed).toHaveLength(4);
    expect(closed[3]).toEqual(closed[0]);
  });

  it("rører ikke en allerede lukket ring", () => {
    const ring: LngLat[] = [...OPEN_RING, OPEN_RING[0]];
    expect(ensureClosedRing(ring)).toHaveLength(4);
  });
});

describe("ringToWkt", () => {
  it("bygger WKT POLYGON i lng lat-orden med lukket ring", () => {
    const wkt = ringToWkt(OPEN_RING);
    expect(wkt).toBe("POLYGON((9.4 55.2, 9.5 55.2, 9.5 55.3, 9.4 55.2))");
  });
});

describe("ringToDawaPolygonParam", () => {
  it("bygger JSON-array af lukkede [lng,lat]-ringe", () => {
    const param = ringToDawaPolygonParam(OPEN_RING);
    const parsed = JSON.parse(param) as number[][][];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toHaveLength(4);
    expect(parsed[0][0]).toEqual([9.4, 55.2]);
    expect(parsed[0][3]).toEqual([9.4, 55.2]);
  });
});

describe("labels og arealer", () => {
  it("jordstykkeLabel håndterer varierende feltnavne", () => {
    expect(jordstykkeLabel({ matrikelnr: "7a", ejerlavnavn: "Skallebæk By" })).toBe(
      "Matr.nr. 7a, Skallebæk By",
    );
    expect(jordstykkeLabel({ matrikelnummer: "12b" })).toBe("Matr.nr. 12b");
    expect(jordstykkeLabel({})).toBe("Matr.nr. ?");
  });

  it("jordstykkeAreaHa konverterer m² til ha", () => {
    expect(jordstykkeAreaHa({ registreretareal: 25000 })).toBe(2.5);
    expect(jordstykkeAreaHa({})).toBeNull();
    expect(jordstykkeAreaHa({ registreretareal: "ikke-tal" })).toBeNull();
  });

  it("markblokLabel og -areal", () => {
    expect(markblokLabel({ MARKBLOKNR: "551234-56" })).toBe("Markblok 551234-56");
    expect(markblokLabel({}, "fid.7")).toBe("Markblok fid.7");
    expect(markblokAreaHa({ BRUTTOAREAL: 14.567 })).toBe(14.57);
    expect(markblokAreaHa({})).toBeNull();
  });
});

describe("capResults", () => {
  it("markerer trunkering ved loftet", () => {
    const big = Array.from({ length: 600 }, (_, i) => i);
    const capped = capResults(big, 500);
    expect(capped.items).toHaveLength(500);
    expect(capped.truncated).toBe(true);
    expect(capResults([1, 2, 3], 500).truncated).toBe(false);
  });
});

describe("downsampleRing", () => {
  it("bevarer små ringe uændret", () => {
    expect(downsampleRing(OPEN_RING, 500)).toHaveLength(3);
  });

  it("nedsampler store ringe til loftet med første/sidste bevaret", () => {
    const big: LngLat[] = Array.from({ length: 2000 }, (_, i) => [9 + i / 10000, 55]);
    const small = downsampleRing(big, 500);
    expect(small).toHaveLength(500);
    expect(small[0]).toEqual(big[0]);
    expect(small[499]).toEqual(big[1999]);
  });
});
