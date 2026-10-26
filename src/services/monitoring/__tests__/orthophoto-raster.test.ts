import { describe, expect, it } from "vitest";
import { writeArrayBuffer } from "geotiff";
import { decodeOrthophoto, orthophotoBounds } from "../orthophoto-raster";
const fixture = (crs = 4326) =>
  writeArrayBuffer([0, 64, 128, 255], {
    width: 2,
    height: 2,
    ModelPixelScale: [0.001, 0.001, 0],
    ModelTiepoint: [0, 0, 0, 9, 55, 0],
    GeographicTypeGeoKey: crs,
    GTModelTypeGeoKey: 2,
    GTRasterTypeGeoKey: 1,
  });
describe("orthophoto derived raster", () => {
  it("decodes actual TIFF RGB preview without modifying source bytes", async () => {
    const bytes = fixture();
    const before = new Uint8Array(bytes).slice();
    const result = await decodeOrthophoto(bytes);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.rgba).toHaveLength(16);
    expect(result.bounds).toEqual([
      [54.998, 9],
      [55, 9.002],
    ]);
    expect(result.measurementApproved).toBe(false);
    expect(new Uint8Array(bytes)).toEqual(before);
  });
  it("bounds preview resolution", async () => {
    const bytes = writeArrayBuffer(new Array(400 * 100).fill(100), {
      width: 400,
      height: 100,
      ModelPixelScale: [0.001, 0.001, 0],
      ModelTiepoint: [0, 0, 0, 9, 55, 0],
      GeographicTypeGeoKey: 4326,
      GTModelTypeGeoKey: 2,
    });
    const result = await decodeOrthophoto(bytes, 128);
    expect(result.width).toBe(128);
    expect(result.height).toBe(32);
    expect(result.rgba.length).toBe(128 * 32 * 4);
  });
  it("converts verified web mercator extent", () => {
    const bounds = orthophotoBounds("EPSG:3857", [0, 0, 111319.49079327358, 111325.14286638486]);
    expect(bounds[1][0]).toBeCloseTo(1, 6);
    expect(bounds[1][1]).toBeCloseTo(1, 6);
  });
  it("rejects unsupported projected CRS rather than placing it at wrong coordinates", async () => {
    await expect(decodeOrthophoto(fixture(25832))).rejects.toThrow("understøtter ikke EPSG:25832");
  });
  it("rejects invalid latitude extent", () => {
    expect(() => orthophotoBounds("EPSG:4326", [0, 89, 1, 90])).toThrow("koordinatområde");
  });
});
