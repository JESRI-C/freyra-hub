import { fromArrayBuffer } from "geotiff";
export type RasterBounds = [[number, number], [number, number]];
const R = 6378137;
const latitudeFromMercator = (y: number) => (Math.atan(Math.sinh(y / R)) * 180) / Math.PI;
const mercatorFromLatitude = (lat: number) =>
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export function orthophotoBounds(crs: string | null, bbox: number[] | null): RasterBounds {
  if (
    !bbox ||
    bbox.length !== 4 ||
    !bbox.every(Number.isFinite) ||
    bbox[0] >= bbox[2] ||
    bbox[1] >= bbox[3]
  )
    throw new Error("Ortofoto har ugyldige geografiske grænser.");
  let bounds: RasterBounds;
  if (crs === "EPSG:4326")
    bounds = [
      [bbox[1], bbox[0]],
      [bbox[3], bbox[2]],
    ];
  else if (crs === "EPSG:3857")
    bounds = [
      [latitudeFromMercator(bbox[1]), ((bbox[0] / R) * 180) / Math.PI],
      [latitudeFromMercator(bbox[3]), ((bbox[2] / R) * 180) / Math.PI],
    ];
  else
    throw new Error(
      `Kortoverlay understøtter ikke ${crs ?? "ukendt CRS"}. Importér et nordvendt GeoTIFF i EPSG:4326 eller EPSG:3857. Originalen er bevaret.`,
    );
  if (
    bounds.some(
      ([lat, lng]) =>
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 85.051129 ||
        Math.abs(lng) > 180,
    )
  )
    throw new Error("Ortofoto ligger uden for kortets gyldige koordinatområde.");
  return bounds;
}
export async function decodeOrthophoto(bytes: ArrayBuffer, maxDimension = 1024) {
  if (bytes.byteLength > 200 * 1024 * 1024)
    throw new Error("Ortofoto overstiger previewgrænsen på 200 MB.");
  const tiff = await fromArrayBuffer(bytes);
  const image = await tiff.getImage();
  const keys = image.getGeoKeys();
  const directory = image.getFileDirectory();
  if (
    !directory.hasTag("ModelTransformation") &&
    !(directory.hasTag("ModelTiepoint") && directory.hasTag("ModelPixelScale"))
  )
    throw new Error("GeoTIFF mangler georeferering.");
  const transform = directory.getValue("ModelTransformation") as number[] | undefined;
  if (
    transform &&
    (transform[1] !== 0 || transform[4] !== 0 || transform[0] <= 0 || transform[5] >= 0)
  )
    throw new Error("Roterede/skæve GeoTIFF kræver reprojektion før kortoverlay.");
  const resolution = image.getResolution();
  if (resolution[0] <= 0 || resolution[1] >= 0)
    throw new Error("GeoTIFF skal være nordvendt før kortoverlay.");
  const crs = `EPSG:${keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey ?? "unknown"}`;
  const bounds = orthophotoBounds(crs, image.getBoundingBox());
  const originalWidth = image.getWidth(),
    originalHeight = image.getHeight();
  if (originalWidth * originalHeight > 50_000_000)
    throw new Error(
      "Raster over 50 megapixel kræver en servergenereret preview/COG. Originalen er bevaret.",
    );
  const scale = Math.min(
    1,
    Math.max(1, Math.min(maxDimension, 2048)) / Math.max(originalWidth, originalHeight),
  );
  const width = Math.max(1, Math.round(originalWidth * scale)),
    height = Math.max(1, Math.round(originalHeight * scale));
  const rgb = await image.readRGB({ width, height, interleave: true, enableAlpha: true });
  if (rgb.BYTES_PER_ELEMENT !== 1)
    throw new Error("Kortpreview kræver et 8-bit RGB-raster. Originalens radiometri ændres ikke.");
  const noData = image.getGDALNoData();
  const channels = rgb.length / (width * height);
  if (channels < 3) throw new Error("Raster kunne ikke dekodes til RGB.");
  const rgba = new Uint8ClampedArray(width * height * 4);
  // Leaflet uses Mercator. Re-sample geographic rows instead of stretching latitude linearly.
  const south = bounds[0][0],
    north = bounds[1][0],
    southY = mercatorFromLatitude(south),
    northY = mercatorFromLatitude(north);
  for (let y = 0; y < height; y++) {
    const lat = latitudeFromMercator(northY - ((y + 0.5) / height) * (northY - southY));
    const sourceY =
      crs === "EPSG:4326"
        ? Math.max(0, Math.min(height - 1, Math.floor(((north - lat) / (north - south)) * height)))
        : y;
    for (let x = 0; x < width; x++) {
      const source = (sourceY * width + x) * channels,
        target = (y * width + x) * 4;
      rgba[target] = Number(rgb[source]);
      rgba[target + 1] = Number(rgb[source + 1]);
      rgba[target + 2] = Number(rgb[source + 2]);
      rgba[target + 3] =
        channels === 4
          ? Number(rgb[source + 3])
          : noData !== null &&
              Number(rgb[source]) === noData &&
              Number(rgb[source + 1]) === noData &&
              Number(rgb[source + 2]) === noData
            ? 0
            : 255;
    }
  }
  return { width, height, rgba, bounds, crs, measurementApproved: false as const };
}
