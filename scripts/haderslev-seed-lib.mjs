import { createHash } from "node:crypto";

export const CORE_POINTS = Object.freeze({
  P02: "DJI_0040.JPG",
  P06: "DJI_0060.JPG",
  P11: "DJI_0103.JPG",
  P14: "DJI_0123.JPG",
  P17: "DJI_0135.JPG",
  P20: "DJI_0149.JPG",
});
export const CASE_NAME = "Bykær Bæk – Haderslev";
export const FLIGHT_DATE = "2026-08-24";

export function stableUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function validateSeedMetadata(metadata, dimensions) {
  const model = String(metadata?.Model ?? "").trim();
  const date = String(metadata?.DateTimeOriginal ?? "")
    .slice(0, 10)
    .replaceAll(":", "-");
  if (
    model !== "FC3411" ||
    !String(metadata?.Make ?? "")
      .toUpperCase()
      .includes("DJI")
  ) {
    throw new Error("Originalen skal være optaget med DJI FC3411.");
  }
  if (date !== FLIGHT_DATE) throw new Error("Originalen skal være fra flyvningen 24.08.2026.");
  const lat = metadata.latitude ?? Number(metadata.GpsLatitude ?? metadata.GPSLatitude);
  const lon = metadata.longitude ?? Number(metadata.GpsLongitude ?? metadata.GPSLongitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    throw new Error("Originalen mangler gyldig EXIF/XMP-GPS.");
  }
  const width = Number(metadata.ExifImageWidth ?? metadata.PixelXDimension);
  const height = Number(metadata.ExifImageHeight ?? metadata.PixelYDimension);
  if (
    !width ||
    !height ||
    width !== dimensions.width ||
    height !== dimensions.height ||
    Math.max(width, height) < 4000
  ) {
    throw new Error("Billedets dimensioner matcher ikke et originalfoto med fuld EXIF-opløsning.");
  }
  return { model, date, latitude: lat, longitude: lon, width, height };
}

/** Read JPEG SOF dimensions, independent of potentially retained EXIF dimensions. */
export function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9)
    throw new Error("Ufuldstændig JPEG-original.");
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("Ugyldig JPEG-struktur.");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8)
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    offset += length;
  }
  throw new Error("JPEG-originalens pixelmål kunne ikke læses.");
}

export function assertStagingTarget(url, expectedRef) {
  const parsed = new URL(url);
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (local) return;
  if (
    !expectedRef ||
    parsed.protocol !== "https:" ||
    parsed.hostname !== `${expectedRef}.supabase.co`
  ) {
    throw new Error("Målet skal matche HADERSLEV_STAGING_PROJECT_REF. Produktion må ikke bruges.");
  }
}
