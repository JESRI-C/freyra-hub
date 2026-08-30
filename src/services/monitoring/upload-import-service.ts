// Upload import service — parses CSV, Excel, GeoJSON, KML and GPX files
// client-side, plus EXIF/GPS extraction for images. Returns typed previews for
// the upload wizard to render before the user commits an import.
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { kml, gpx } from "@tmcw/togeojson";
import {
  extractDroneImageMetadata,
  isReadyForAutomaticCameraPosition,
  type DroneImageMetadata,
} from "./drone-image-metadata";

export interface TabularPreview {
  kind: "tabular";
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  sampleRows: Record<string, unknown>[];
  errors: string[];
}

export interface GeoPreview {
  kind: "geo";
  featureCount: number;
  points: number;
  lines: number;
  polygons: number;
  geojson: GeoJSON.FeatureCollection;
  bbox: [number, number, number, number] | null;
  errors: string[];
}

export interface ImagePreview {
  kind: "image";
  width?: number;
  height?: number;
  latitude?: number;
  longitude?: number;
  altitudeM?: number;
  directionDeg?: number;
  capturedAt?: string;
  cameraMake?: string;
  cameraModel?: string;
  droneMetadata: DroneImageMetadata;
  errors: string[];
}

export type ParsePreview = TabularPreview | GeoPreview | ImagePreview;

const MAX_ROWS_IN_MEMORY = 20_000;
const SAMPLE_SIZE = 5;

export async function parseCsv(file: File): Promise<TabularPreview> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      preview: MAX_ROWS_IN_MEMORY,
      complete: (result) => {
        const rows = result.data as Record<string, unknown>[];
        const headers = result.meta.fields ?? [];
        resolve({
          kind: "tabular",
          headers,
          rows,
          totalRows: rows.length,
          sampleRows: rows.slice(0, SAMPLE_SIZE),
          errors: (result.errors ?? [])
            .slice(0, 20)
            .map((e) => `${e.type}: ${e.message} (række ${e.row ?? "?"})`),
        });
      },
      error: (err) => reject(err),
    });
  });
}

export async function parseExcel(file: File): Promise<TabularPreview> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      kind: "tabular",
      headers: [],
      rows: [],
      totalRows: 0,
      sampleRows: [],
      errors: ["Excel-filen har ingen ark."],
    };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return {
    kind: "tabular",
    headers,
    rows,
    totalRows: rows.length,
    sampleRows: rows.slice(0, SAMPLE_SIZE),
    errors: [],
  };
}

export async function parseGeoJson(file: File): Promise<GeoPreview> {
  const text = await file.text();
  let json: GeoJSON.FeatureCollection;
  try {
    json = JSON.parse(text) as GeoJSON.FeatureCollection;
  } catch (err) {
    return emptyGeo(`Kunne ikke læse GeoJSON: ${(err as Error).message}`);
  }
  return summarizeGeo(json);
}

export async function parseKml(file: File): Promise<GeoPreview> {
  const text = await file.text();
  const dom = new DOMParser().parseFromString(text, "text/xml");
  const parseErr = dom.querySelector("parsererror");
  if (parseErr) return emptyGeo("KML-filen kunne ikke parses.");
  const collection = kml(dom) as GeoJSON.FeatureCollection;
  return summarizeGeo(collection);
}

export async function parseGpx(file: File): Promise<GeoPreview> {
  const text = await file.text();
  const dom = new DOMParser().parseFromString(text, "text/xml");
  const parseErr = dom.querySelector("parsererror");
  if (parseErr) return emptyGeo("GPX-filen kunne ikke parses.");
  const collection = gpx(dom) as GeoJSON.FeatureCollection;
  return summarizeGeo(collection);
}

export async function parseImage(
  file: File,
  extractor: typeof extractDroneImageMetadata = extractDroneImageMetadata,
): Promise<ImagePreview> {
  const metadata = await extractor(file);
  const bmp = await tryDecodeSize(file);
  return {
    kind: "image",
    width: bmp?.width ?? metadata.camera.widthPx,
    height: bmp?.height ?? metadata.camera.heightPx,
    latitude: metadata.position?.latitude,
    longitude: metadata.position?.longitude,
    altitudeM: metadata.altitude.absoluteM ?? metadata.altitude.gpsM,
    directionDeg: metadata.orientation.viewDirectionDeg,
    capturedAt: metadata.capture.capturedAtUtc,
    cameraMake: metadata.camera.make,
    cameraModel: metadata.camera.model,
    droneMetadata: metadata,
    errors: metadata.qa.errors.map((issue) => issue.message),
  };
}

/**
 * Builds the versioned staging envelope persisted with the upload row. The
 * full normalized/raw evidence remains nested while the fields used for list
 * views and routing are duplicated at the top level deliberately.
 */
export function buildImageDetectedMetadata(preview: ImagePreview): Record<string, unknown> {
  const detected: Record<string, unknown> = {
    content_sha256: preview.droneMetadata.file.sha256,
    metadata_schema_version: preview.droneMetadata.schemaVersion,
    metadata_status: preview.droneMetadata.qa.status,
    ready_for_camera_position: isReadyForAutomaticCameraPosition(preview.droneMetadata),
    drone_metadata: preview.droneMetadata,
  };
  if (preview.width != null) detected.width = preview.width;
  if (preview.height != null) detected.height = preview.height;
  if (preview.latitude != null) detected.latitude = preview.latitude;
  if (preview.longitude != null) detected.longitude = preview.longitude;
  if (preview.capturedAt) detected.captured_at = preview.capturedAt;
  if (preview.cameraMake) detected.camera_make = preview.cameraMake;
  if (preview.cameraModel) detected.camera_model = preview.cameraModel;
  if (preview.altitudeM != null) detected.altitude_m = preview.altitudeM;
  if (preview.directionDeg != null) detected.direction_deg = preview.directionDeg;
  return detected;
}

async function tryDecodeSize(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bmp = await createImageBitmap(file);
    const dimensions = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dimensions;
  } catch {
    return null;
  }
}

function emptyGeo(err: string): GeoPreview {
  return {
    kind: "geo",
    featureCount: 0,
    points: 0,
    lines: 0,
    polygons: 0,
    geojson: { type: "FeatureCollection", features: [] },
    bbox: null,
    errors: [err],
  };
}

function summarizeGeo(collection: GeoJSON.FeatureCollection): GeoPreview {
  const features = collection.features ?? [];
  let points = 0;
  let lines = 0;
  let polygons = 0;
  const errors: string[] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const f of features) {
    if (!f.geometry) {
      errors.push("Feature uden geometri sprunget over.");
      continue;
    }
    const type = f.geometry.type;
    if (type === "Point" || type === "MultiPoint") points++;
    else if (type === "LineString" || type === "MultiLineString") lines++;
    else if (type === "Polygon" || type === "MultiPolygon") polygons++;
    const coords = flatten(f.geometry);
    for (const [x, y] of coords) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const bbox: GeoPreview["bbox"] = Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
  return {
    kind: "geo",
    featureCount: features.length,
    points,
    lines,
    polygons,
    geojson: collection,
    bbox,
    errors,
  };
}

function flatten(g: GeoJSON.Geometry): [number, number][] {
  switch (g.type) {
    case "Point":
      return [g.coordinates as [number, number]];
    case "MultiPoint":
    case "LineString":
      return g.coordinates as [number, number][];
    case "MultiLineString":
    case "Polygon":
      return (g.coordinates as [number, number][][]).flat();
    case "MultiPolygon":
      return (g.coordinates as [number, number][][][]).flat(2);
    case "GeometryCollection":
      return g.geometries.flatMap(flatten);
    default:
      return [];
  }
}

export interface ColumnMapping {
  timestamp?: string;
  latitude?: string;
  longitude?: string;
  value?: string;
  parameter?: string;
  device?: string;
}

/**
 * Suggests a mapping from source columns to canonical fields based on common
 * header names. The wizard exposes this as pre-filled defaults the user can
 * confirm or override.
 */
export function suggestMapping(headers: string[]): ColumnMapping {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const find = (needles: string[]) => headers.find((h) => needles.includes(norm(h)));
  return {
    timestamp: find([
      "timestamp",
      "measuredat",
      "time",
      "date",
      "datetime",
      "tid",
      "tidspunkt",
      "målttidspunkt",
      "malttidspunkt",
    ]),
    latitude: find(["lat", "latitude", "breddegrad"]),
    longitude: find(["lng", "lon", "long", "longitude", "længdegrad", "laengdegrad"]),
    value: find(["value", "reading", "measurement", "vaerdi", "værdi"]),
    parameter: find(["parameter", "measurement", "type", "parametername"]),
    device: find(["device", "sensor", "sensorid", "deviceid", "enhed"]),
  };
}

export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warnings: string[];
  errors: string[];
}

export function validateTabular(
  preview: TabularPreview,
  mapping: ColumnMapping,
): ValidationSummary {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!mapping.timestamp)
    warnings.push("Ingen tids-kolonne valgt — importerede rækker får uploadtidspunkt.");
  if (!mapping.value) warnings.push("Ingen værdi-kolonne valgt — kun geografi importeres.");
  let valid = 0;
  let invalid = 0;
  for (const row of preview.rows) {
    let ok = true;
    if (mapping.timestamp) {
      const t = row[mapping.timestamp];
      if (t == null || (typeof t === "string" && Number.isNaN(Date.parse(t)))) {
        invalid++;
        ok = false;
      }
    }
    if (ok && mapping.latitude && mapping.longitude) {
      const lat = Number(row[mapping.latitude]);
      const lng = Number(row[mapping.longitude]);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        invalid++;
        ok = false;
      }
    }
    if (ok) valid++;
  }
  if (invalid > 0)
    errors.push(`${invalid} af ${preview.totalRows} rækker har ugyldige tids- eller GPS-værdier.`);
  return { totalRows: preview.totalRows, validRows: valid, invalidRows: invalid, warnings, errors };
}
