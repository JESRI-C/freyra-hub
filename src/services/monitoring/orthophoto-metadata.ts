export interface OrthophotoReference {
  status: "georeferenced" | "blocked";
  crs: string | null;
  bbox: number[] | null;
  width: number | null;
  height: number | null;
  error: string | null;
  measurementApproved: false;
}
/** A georeferenced TIFF is still not a validated measurement: ground control/accuracy are separate. */
export function validateOrthophotoReference(input: {
  crs: number | null;
  bbox: number[];
  width: number;
  height: number;
  hasTransform: boolean;
}): OrthophotoReference {
  const { crs, bbox, width, height, hasTransform } = input;
  const valid =
    !!crs &&
    crs !== 32767 &&
    hasTransform &&
    bbox.length === 4 &&
    bbox.every(Number.isFinite) &&
    bbox[0] < bbox[2] &&
    bbox[1] < bbox[3] &&
    width > 0 &&
    height > 0;
  return {
    status: valid ? "georeferenced" : "blocked",
    crs: crs && crs !== 32767 ? `EPSG:${crs}` : null,
    bbox: valid ? bbox : null,
    width,
    height,
    error: valid
      ? null
      : "GeoTIFF mangler kendt EPSG-kode eller gyldig georeferering. Filen kan ikke bruges som målgrundlag.",
    measurementApproved: false,
  };
}
export async function inspectOrthophoto(file: Blob): Promise<OrthophotoReference> {
  try {
    const { fromArrayBuffer } = await import("geotiff");
    const tiff = await fromArrayBuffer(await file.arrayBuffer());
    const image = await tiff.getImage();
    const keys = image.getGeoKeys();
    const directory = image.getFileDirectory();
    return validateOrthophotoReference({
      crs: Number(keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey) || null,
      bbox: image.getBoundingBox(),
      width: image.getWidth(),
      height: image.getHeight(),
      hasTransform:
        directory.hasTag("ModelTransformation") ||
        (directory.hasTag("ModelTiepoint") && directory.hasTag("ModelPixelScale")),
    });
  } catch {
    return {
      status: "blocked",
      crs: null,
      bbox: null,
      width: null,
      height: null,
      error:
        "Filen kunne ikke læses som et georefereret GeoTIFF. Originalen er bevaret, men kortoverlay og arealmåling er blokeret.",
      measurementApproved: false,
    };
  }
}
