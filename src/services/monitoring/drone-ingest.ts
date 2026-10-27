import exifr from "exifr";

export type SurveyPhase = "before" | "after" | "follow_up";
export type FileProgress = {
  name: string;
  status: "pending" | "uploading" | "uploaded" | "duplicate" | "failed";
  error?: string;
  missingGps?: boolean;
};
export interface OriginalMetadata {
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  direction: number | null;
  capturedAt: string | null;
  camera: string | null;
  qualityFlags: string[];
  exif: Record<string, unknown>;
}
export function normalizeMetadata(raw: Record<string, unknown> | null): OriginalMetadata {
  const data = raw ?? {};
  const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const lat = number(data.latitude),
    lng = number(data.longitude);
  const validGps = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const date =
    data.DateTimeOriginal instanceof Date && !Number.isNaN(data.DateTimeOriginal.getTime())
      ? data.DateTimeOriginal.toISOString()
      : null;
  const yaw =
    number(data.GimbalYawDegree) ?? number(data.GPSImgDirection) ?? number(data.FlightYawDegree);
  return {
    latitude: validGps ? lat : null,
    longitude: validGps ? lng : null,
    altitudeM: number(data.GPSAltitude) ?? number(data.AbsoluteAltitude),
    direction: yaw === null ? null : ((yaw % 360) + 360) % 360,
    capturedAt: date,
    camera: [data.Make, data.Model].filter((v) => typeof v === "string").join(" ") || null,
    qualityFlags: [
      ...(!validGps ? ["missing_gps"] : []),
      ...(!date ? ["missing_capture_time"] : []),
      ...(yaw === null ? ["missing_direction"] : []),
      "unreviewed",
    ],
    exif: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
  };
}
export async function readOriginalMetadata(file: File): Promise<OriginalMetadata> {
  try {
    return normalizeMetadata(await exifr.parse(file, { xmp: true, gps: true }));
  } catch {
    return normalizeMetadata(null);
  }
}
export async function sha256(file: Blob): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
/** Sequential processing bounds memory and isolates per-file failures; retries skip successful rows. */
export async function runBatch<T>(
  files: File[],
  upload: (file: File) => Promise<{ item: T; duplicate: boolean; missingGps: boolean }>,
  onProgress: (states: FileProgress[]) => void,
  previous: FileProgress[] = [],
): Promise<T[]> {
  const states: FileProgress[] = files.map((file, i) =>
    previous[i]?.name === file.name ? { ...previous[i] } : { name: file.name, status: "pending" },
  );
  const items: T[] = [];
  for (let i = 0; i < files.length; i++) {
    if (states[i].status === "uploaded" || states[i].status === "duplicate") continue;
    states[i] = { name: files[i].name, status: "uploading" };
    onProgress(states.map((s) => ({ ...s })));
    try {
      const result = await upload(files[i]);
      items.push(result.item);
      states[i] = {
        name: files[i].name,
        status: result.duplicate ? "duplicate" : "uploaded",
        missingGps: result.missingGps,
      };
    } catch (error) {
      states[i] = {
        name: files[i].name,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    onProgress(states.map((s) => ({ ...s })));
  }
  return items;
}
