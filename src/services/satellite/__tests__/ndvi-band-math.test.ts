import { describe, it, expect } from "vitest";
import {
  latLngToUtm,
  pixelWindow,
  medianNdviFromBands,
  pickOverviewIndex,
} from "@/services/satellite/ndvi-band-math";

describe("latLngToUtm", () => {
  it("giver easting præcis 500000 på centralmeridianen", () => {
    // Zone 32's centralmeridian er 9°Ø.
    const { easting } = latLngToUtm(56, 9, 32);
    expect(easting).toBeCloseTo(500000, 0);
  });

  it("giver easting > 500000 øst for centralmeridianen og < vest for", () => {
    expect(latLngToUtm(56, 10, 32).easting).toBeGreaterThan(500000);
    expect(latLngToUtm(56, 8, 32).easting).toBeLessThan(500000);
  });

  it("northing vokser med breddegraden (~111 km pr. grad)", () => {
    const n55 = latLngToUtm(55, 9, 32).northing;
    const n56 = latLngToUtm(56, 9, 32).northing;
    expect(n56 - n55).toBeGreaterThan(110000);
    expect(n56 - n55).toBeLessThan(112500);
  });

  it("rammer kendt referencepunkt (København, zone 33) inden for få meter", () => {
    // 55.6761 N, 12.5683 Ø → UTM33 ca. E 347090, N 6172710
    const { easting, northing } = latLngToUtm(55.6761, 12.5683, 33);
    expect(easting).toBeGreaterThan(345000);
    expect(easting).toBeLessThan(349000);
    expect(northing).toBeGreaterThan(6170000);
    expect(northing).toBeLessThan(6176000);
  });
});

describe("pixelWindow", () => {
  // Billede: 100x100 px, dækker 0-1000 m i begge akser (10 m/px).
  const bbox: [number, number, number, number] = [0, 0, 1000, 1000];

  it("centrerer vinduet om punktet", () => {
    const win = pixelWindow(bbox, 100, 100, 500, 500, 8);
    expect(win).toEqual({ x0: 42, y0: 42, x1: 58, y1: 58 });
  });

  it("klipper vinduet ved billedkanten", () => {
    const win = pixelWindow(bbox, 100, 100, 10, 990, 8); // nær øverste venstre hjørne
    expect(win).not.toBeNull();
    expect(win!.x0).toBe(0);
    expect(win!.y0).toBe(0);
  });

  it("returnerer null for punkter uden for billedet", () => {
    expect(pixelWindow(bbox, 100, 100, -50, 500)).toBeNull();
    expect(pixelWindow(bbox, 100, 100, 500, 2000)).toBeNull();
  });

  it("y-aksen er vendt (nord = række 0)", () => {
    const north = pixelWindow(bbox, 100, 100, 500, 950, 2)!;
    const south = pixelWindow(bbox, 100, 100, 500, 50, 2)!;
    expect(north.y0).toBeLessThan(south.y0);
  });
});

describe("medianNdviFromBands", () => {
  it("beregner korrekt NDVI for kendte reflektanser", () => {
    // NIR 6000, rød 2000 → NDVI (6000-2000)/(6000+2000) = 0.5
    const ndvi = medianNdviFromBands([2000, 2000, 2000], [6000, 6000, 6000]);
    expect(ndvi).toBe(0.5);
  });

  it("filtrerer nodata (0) og outliers fra", () => {
    const ndvi = medianNdviFromBands([0, 2000, 20000], [5000, 6000, 5000]);
    // kun det midterste par er gyldigt: (6000-2000)/8000 = 0.5
    expect(ndvi).toBe(0.5);
  });

  it("returnerer null uden gyldige pixels", () => {
    expect(medianNdviFromBands([0, 0], [0, 0])).toBeNull();
    expect(medianNdviFromBands([], [])).toBeNull();
  });

  it("tager medianen ved blandede værdier", () => {
    // NDVI-værdier: 0.2, 0.5, 0.8 → median 0.5
    const red = [4000, 2000, 500];
    const nir = [6000, 6000, 4500];
    expect(medianNdviFromBands(red, nir)).toBe(0.5);
  });
});

describe("pickOverviewIndex", () => {
  it("vælger første niveau under maks-bredden (bredder sorteret faldende)", () => {
    expect(pickOverviewIndex([10980, 5490, 2745, 1373, 687], 1500)).toBe(3);
  });

  it("falder tilbage til mindste overview når alle er for brede", () => {
    expect(pickOverviewIndex([10980, 5490], 1500)).toBe(1);
  });
});
