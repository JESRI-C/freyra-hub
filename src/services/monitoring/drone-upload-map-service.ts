import { DRONE_METADATA_SCHEMA_VERSION } from "./drone-image-metadata";
import { listUploads, type Upload } from "./uploads-service";

const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BEFORE_INTAKE_SCHEMA = "gofreyra.drone-before-intake/v1";
const SHA256_HEX = /^[0-9a-f]{64}$/i;
const RECEIVED_UPLOAD_STATUSES = new Set([
  "awaiting_validation",
  "validating",
  "ready",
  "importing",
  "imported",
  "imported_with_warnings",
]);

function isReceivedUpload(upload: Upload): boolean {
  if (!upload.received_at) return false;
  if (RECEIVED_UPLOAD_STATUSES.has(upload.status)) return true;

  // The resumable-upload migration intentionally preserved historical rows
  // that already had a Storage object but still used the old draft status.
  // A current upload intent always has intent_request_id and is never treated
  // as received until finalize changes its status.
  return upload.status === "draft" && upload.intent_request_id == null;
}

function isDroneBeforeUpload(upload: Upload): boolean {
  if (upload.upload_type !== "drone_photo" || !isRecord(upload.user_metadata)) return false;
  const intake = upload.user_metadata["intake"];
  return (
    isRecord(intake) &&
    intake["schema_version"] === BEFORE_INTAKE_SCHEMA &&
    intake["phase"] === "BEFORE" &&
    intake["media_kind"] === "drone_photo"
  );
}

export type DroneUploadMapPointTrust = "raw_unvalidated";

export interface DroneUploadMapPoint {
  uploadId: string;
  projectId: string;
  fileName: string;
  coordinates: { lat: number; lng: number };
  capturedAt: string;
  altitudeM?: number;
  directionDeg?: number;
  cameraLabel?: string;
  batchId?: string;
  batchSequence?: number;
  uploadStatus: string;
  /** Client EXIF/XMP is only an orientation aid until a server re-extracts it. */
  positionTrust: DroneUploadMapPointTrust;
}

export type DroneUploadMapPointRejection =
  | "wrong_project"
  | "not_received"
  | "inactive_upload"
  | "not_drone_before"
  | "missing_position"
  | "invalid_metadata";

export type DroneUploadMapPointResult =
  | { point: DroneUploadMapPoint }
  | { reason: DroneUploadMapPointRejection };

export interface DroneUploadMapOverview {
  points: DroneUploadMapPoint[];
  totalDroneUploads: number;
  receivedDroneUploads: number;
  mappableUploads: number;
  missingCameraPosition: number;
  unvalidatedCameraPositions: number;
}

type UploadLister = (params: {
  projectId?: string | null;
  status?: string;
  limit?: number;
}) => Promise<Upload[]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return value == null ? undefined : finiteNumber(value);
}

function validIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) {
    return undefined;
  }
  return value;
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= maxLength ? text : undefined;
}

function validClientPreview(
  upload: Upload,
  preview: Record<string, unknown>,
):
  | {
      latitude: number;
      longitude: number;
      capturedAt: string;
      altitudeM?: number;
      directionDeg?: number;
      cameraLabel?: string;
    }
  | "missing_position"
  | "invalid_metadata" {
  if (preview["ready_for_camera_position"] !== true) return "missing_position";
  if (preview["metadata_schema_version"] !== DRONE_METADATA_SCHEMA_VERSION) {
    return "invalid_metadata";
  }
  if (!SHA256_HEX.test(String(preview["content_sha256"] ?? ""))) return "invalid_metadata";

  const latitude = finiteNumber(preview["latitude"]);
  const longitude = finiteNumber(preview["longitude"]);
  const capturedAt = validIsoTimestamp(preview["captured_at"]);
  if (
    latitude == null ||
    longitude == null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    !capturedAt
  ) {
    return "invalid_metadata";
  }

  const droneMetadata = preview["drone_metadata"];
  if (
    !isRecord(droneMetadata) ||
    droneMetadata["schemaVersion"] !== DRONE_METADATA_SCHEMA_VERSION
  ) {
    return "invalid_metadata";
  }
  const file = droneMetadata["file"];
  const raw = droneMetadata["raw"];
  const capture = droneMetadata["capture"];
  const position = droneMetadata["position"];
  const qa = droneMetadata["qa"];
  if (
    !isRecord(file) ||
    !isRecord(raw) ||
    !isRecord(capture) ||
    !isRecord(position) ||
    !isRecord(qa) ||
    file["name"] !== upload.original_file_name ||
    file["sizeBytes"] !== upload.file_size ||
    file["mimeType"] !== upload.mime_type ||
    !SHA256_HEX.test(String(file["sha256"] ?? "")) ||
    file["sha256"] !== preview["content_sha256"] ||
    !Array.isArray(raw["parseErrors"]) ||
    raw["parseErrors"].length > 0 ||
    !Array.isArray(qa["errors"]) ||
    qa["errors"].length > 0 ||
    !["ready", "review_required"].includes(String(qa["status"] ?? "")) ||
    qa["status"] !== preview["metadata_status"] ||
    capture["capturedAtUtc"] !== capturedAt
  ) {
    return "invalid_metadata";
  }

  const nestedLatitude = finiteNumber(position["latitude"]);
  const nestedLongitude = finiteNumber(position["longitude"]);
  if (
    nestedLatitude == null ||
    nestedLongitude == null ||
    !sameNumber(latitude, nestedLatitude) ||
    !sameNumber(longitude, nestedLongitude)
  ) {
    return "invalid_metadata";
  }

  const altitudeM = optionalFiniteNumber(preview["altitude_m"]);
  let directionDeg = optionalFiniteNumber(preview["direction_deg"]);
  if (directionDeg != null && (directionDeg < 0 || directionDeg >= 360)) {
    directionDeg = undefined;
  }
  const make = optionalString(preview["camera_make"], 100);
  const model = optionalString(preview["camera_model"], 100);
  const cameraLabel = [make, model].filter(Boolean).join(" ") || undefined;

  return { latitude, longitude, capturedAt, altitudeM, directionDeg, cameraLabel };
}

/**
 * Converts one RLS-visible staging upload into a map-only camera position.
 * It deliberately never falls back to project centroid and never represents a
 * camera point as an image footprint or report-ready observation.
 */
export function parseDroneUploadMapPoint(
  upload: Upload,
  expectedProjectId: string,
): DroneUploadMapPointResult {
  const projectId = expectedProjectId.toLowerCase();
  if (upload.project_id?.toLowerCase() !== projectId) return { reason: "wrong_project" };
  if (!isDroneBeforeUpload(upload)) return { reason: "not_drone_before" };
  if (!upload.received_at) return { reason: "not_received" };
  if (!isReceivedUpload(upload)) return { reason: "inactive_upload" };

  const userMetadata = upload.user_metadata as Record<string, unknown>;
  const intake = userMetadata["intake"] as Record<string, unknown>;

  const preview = userMetadata["client_preview"];
  if (!isRecord(preview)) return { reason: "missing_position" };
  const parsed = validClientPreview(upload, preview);
  if (typeof parsed === "string") return { reason: parsed };

  const batchId = optionalString(intake["batch_id"], 160);
  const rawBatchSequence = finiteNumber(intake["batch_sequence"]);
  const batchSequence =
    rawBatchSequence != null && Number.isInteger(rawBatchSequence) && rawBatchSequence >= 0
      ? rawBatchSequence
      : undefined;

  return {
    point: {
      uploadId: upload.id,
      projectId,
      fileName: upload.original_file_name,
      coordinates: { lat: parsed.latitude, lng: parsed.longitude },
      capturedAt: parsed.capturedAt,
      altitudeM: parsed.altitudeM,
      directionDeg: parsed.directionDeg,
      cameraLabel: parsed.cameraLabel,
      batchId,
      batchSequence,
      uploadStatus: upload.status,
      positionTrust: "raw_unvalidated",
    },
  };
}

export async function getDroneUploadMapOverview(
  projectId: string,
  lister: UploadLister = listUploads,
): Promise<DroneUploadMapOverview> {
  const normalizedProjectId = projectId.trim().toLowerCase();
  if (!POSTGRES_UUID.test(normalizedProjectId)) throw new Error("Ugyldig projektreference.");

  const rows = await lister({ projectId: normalizedProjectId, limit: 500 });
  // Do not trust the adapter or a stale mock to preserve project scope. Live
  // access is protected independently by uploads RLS.
  const projectRows = rows.filter((row) => row.project_id?.toLowerCase() === normalizedProjectId);
  const droneRows = projectRows.filter(isDroneBeforeUpload);
  const receivedRows = droneRows.filter(isReceivedUpload);

  const parsed = receivedRows.map((row) => parseDroneUploadMapPoint(row, normalizedProjectId));
  const points = parsed.flatMap((result) => ("point" in result ? [result.point] : []));

  return {
    points,
    totalDroneUploads: droneRows.length,
    receivedDroneUploads: receivedRows.length,
    mappableUploads: points.length,
    missingCameraPosition: receivedRows.length - points.length,
    // Every rendered point in this slice comes from client_preview and remains
    // untrusted regardless of the upload workflow status.
    unvalidatedCameraPositions: points.length,
  };
}
