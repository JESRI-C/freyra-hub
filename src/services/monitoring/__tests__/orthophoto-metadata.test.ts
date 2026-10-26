import { expect, it } from "vitest";
import { writeArrayBuffer } from "geotiff";
import { inspectOrthophoto } from "../orthophoto-metadata";
it("reads CRS and georeferencing from actual GeoTIFF bytes", async () => {
  const bytes = writeArrayBuffer([1, 2, 3, 4], {
    width: 2,
    height: 2,
    ModelPixelScale: [0.001, 0.001, 0],
    ModelTiepoint: [0, 0, 0, 9, 55, 0],
    GeographicTypeGeoKey: 4326,
    GTModelTypeGeoKey: 2,
    GTRasterTypeGeoKey: 1,
  });
  const result = await inspectOrthophoto(new Blob([bytes]));
  expect(result.status).toBe("georeferenced");
  expect(result.crs).toBe("EPSG:4326");
  expect(result.bbox).toEqual([9, 54.998, 9.002, 55]);
  expect(result.measurementApproved).toBe(false);
});
it("blocks invalid TIFF bytes without claiming a georeferenced raster", async () => {
  expect((await inspectOrthophoto(new Blob(["not a TIFF"]))).status).toBe("blocked");
});
