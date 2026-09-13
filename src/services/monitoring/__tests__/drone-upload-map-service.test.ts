import { describe, expect, it, vi } from "vitest";
import type { Upload } from "@/services/monitoring/uploads-service";
import {
  getDroneUploadMapOverview,
  parseDroneUploadMapPoint,
} from "@/services/monitoring/drone-upload-map-service";

const PROJECT_ID = "a2000000-0000-4000-8000-000000000001";
const OTHER_PROJECT_ID = "a2000000-0000-4000-8000-000000000002";

function upload(overrides: Partial<Upload> = {}): Upload {
  const fileName = overrides.original_file_name ?? "DJI_0001.JPG";
  const fileSize = overrides.file_size ?? 8_192;
  const mimeType = overrides.mime_type ?? "image/jpeg";
  return {
    id: "a5000000-0000-4000-8000-000000000001",
    organization_id: null,
    project_id: PROJECT_ID,
    zone_id: null,
    uploaded_by: "a1000000-0000-4000-8000-000000000001",
    file_name: fileName,
    original_file_name: fileName,
    mime_type: mimeType,
    file_size: fileSize,
    storage_path:
      "a1000000-0000-4000-8000-000000000001/intents/a5000000-0000-4000-8000-000000000001/DJI_0001.JPG",
    upload_type: "drone_photo",
    status: "awaiting_validation",
    detected_metadata: {},
    user_metadata: {
      intake: {
        schema_version: "gofreyra.drone-before-intake/v1",
        phase: "BEFORE",
        media_kind: "drone_photo",
        batch_id: "before-batch-1",
        batch_sequence: 7,
      },
      client_preview: {
        content_sha256: "a".repeat(64),
        metadata_schema_version: "drone-image-metadata/v1",
        metadata_status: "ready",
        ready_for_camera_position: true,
        latitude: 55.245678,
        longitude: 9.487654,
        captured_at: "2026-08-28T12:05:06.000Z",
        altitude_m: 82.5,
        direction_deg: 91.5,
        camera_make: "DJI",
        camera_model: "Mavic 3 Enterprise",
        drone_metadata: {
          schemaVersion: "drone-image-metadata/v1",
          file: {
            name: fileName,
            sizeBytes: fileSize,
            mimeType,
            sha256: "a".repeat(64),
          },
          raw: { parseErrors: [] },
          capture: { capturedAtUtc: "2026-08-28T12:05:06.000Z" },
          position: { latitude: 55.245678, longitude: 9.487654, source: "exif" },
          qa: { status: "ready", errors: [], warnings: [] },
        },
      },
    },
    validation_result: {},
    import_result: {},
    source_reference: null,
    intent_expires_at: null,
    intent_request_id: null,
    received_at: "2026-08-28T12:06:00.000Z",
    created_at: "2026-08-28T12:04:00.000Z",
    updated_at: "2026-08-28T12:06:00.000Z",
    ...overrides,
  };
}

describe("drone upload map points", () => {
  it("maps a complete BEFORE client preview without promoting it to validated evidence", () => {
    expect(parseDroneUploadMapPoint(upload(), PROJECT_ID)).toEqual({
      point: {
        uploadId: "a5000000-0000-4000-8000-000000000001",
        projectId: PROJECT_ID,
        fileName: "DJI_0001.JPG",
        coordinates: { lat: 55.245678, lng: 9.487654 },
        capturedAt: "2026-08-28T12:05:06.000Z",
        altitudeM: 82.5,
        directionDeg: 91.5,
        cameraLabel: "DJI Mavic 3 Enterprise",
        batchId: "before-batch-1",
        batchSequence: 7,
        uploadStatus: "awaiting_validation",
        positionTrust: "raw_unvalidated",
      },
    });
  });

  it.each([
    ["wrong project", { project_id: OTHER_PROJECT_ID }, "wrong_project"],
    ["not received", { received_at: null }, "not_received"],
    [
      "unfinished current draft intent",
      {
        status: "draft",
        intent_request_id: "a6000000-0000-4000-8000-000000000001",
      },
      "inactive_upload",
    ],
    ["archived", { status: "archived" }, "inactive_upload"],
    ["not a drone photo", { upload_type: "image" }, "not_drone_before"],
  ] as const)("rejects %s", (_label, overrides, reason) => {
    expect(parseDroneUploadMapPoint(upload(overrides), PROJECT_ID)).toEqual({ reason });
  });

  it("keeps a received legacy draft without an upload intent visible as unvalidated", () => {
    expect(
      parseDroneUploadMapPoint(
        upload({ status: "draft", intent_request_id: null, received_at: "2026-08-28T12:06:00Z" }),
        PROJECT_ID,
      ),
    ).toMatchObject({
      point: { uploadStatus: "draft", positionTrust: "raw_unvalidated" },
    });
  });

  it("requires the exact BEFORE intake contract", () => {
    const row = upload();
    row.user_metadata = {
      ...(row.user_metadata as Record<string, unknown>),
      intake: {
        schema_version: "gofreyra.drone-before-intake/v1",
        phase: "AFTER",
        media_kind: "drone_photo",
      },
    } as Upload["user_metadata"];

    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toEqual({ reason: "not_drone_before" });
  });

  it("rejects forged, incomplete and internally inconsistent client metadata", () => {
    const row = upload();
    const metadata = structuredClone(row.user_metadata) as Record<string, unknown>;
    const preview = metadata["client_preview"] as Record<string, unknown>;
    preview["longitude"] = 181;
    row.user_metadata = metadata as Upload["user_metadata"];
    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toEqual({ reason: "invalid_metadata" });

    const mismatched = upload();
    const mismatchedMetadata = structuredClone(mismatched.user_metadata) as Record<string, unknown>;
    const mismatchedPreview = mismatchedMetadata["client_preview"] as Record<string, unknown>;
    const droneMetadata = mismatchedPreview["drone_metadata"] as Record<string, unknown>;
    const position = droneMetadata["position"] as Record<string, unknown>;
    position["latitude"] = 56;
    mismatched.user_metadata = mismatchedMetadata as Upload["user_metadata"];
    expect(parseDroneUploadMapPoint(mismatched, PROJECT_ID)).toEqual({
      reason: "invalid_metadata",
    });
  });

  it("does not use a position that the metadata QA has blocked", () => {
    const row = upload();
    const metadata = structuredClone(row.user_metadata) as Record<string, unknown>;
    const preview = metadata["client_preview"] as Record<string, unknown>;
    preview["ready_for_camera_position"] = false;
    row.user_metadata = metadata as Upload["user_metadata"];

    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toEqual({ reason: "missing_position" });
  });

  it("accepts zero coordinates instead of treating them as missing", () => {
    const row = upload();
    const metadata = structuredClone(row.user_metadata) as Record<string, unknown>;
    const preview = metadata["client_preview"] as Record<string, unknown>;
    preview["latitude"] = 0;
    preview["longitude"] = 0;
    const droneMetadata = preview["drone_metadata"] as Record<string, unknown>;
    const position = droneMetadata["position"] as Record<string, unknown>;
    position["latitude"] = 0;
    position["longitude"] = 0;
    row.user_metadata = metadata as Upload["user_metadata"];

    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toMatchObject({
      point: { coordinates: { lat: 0, lng: 0 } },
    });
  });

  it("loads only the requested project and reports every received drone row", async () => {
    const lister = vi.fn().mockResolvedValue([
      upload(),
      upload({
        id: "a5000000-0000-4000-8000-000000000002",
        user_metadata: {
          intake: {
            schema_version: "gofreyra.drone-before-intake/v1",
            phase: "BEFORE",
            media_kind: "drone_photo",
          },
        },
      }),
      upload({
        id: "a5000000-0000-4000-8000-000000000003",
        project_id: OTHER_PROJECT_ID,
      }),
      upload({
        id: "a5000000-0000-4000-8000-000000000004",
        upload_type: "pdf",
      }),
      upload({
        id: "a5000000-0000-4000-8000-000000000005",
        user_metadata: {
          intake: {
            schema_version: "gofreyra.drone-before-intake/v1",
            phase: "AFTER",
            media_kind: "drone_photo",
          },
        },
      }),
    ]);

    await expect(getDroneUploadMapOverview(PROJECT_ID, lister)).resolves.toMatchObject({
      totalDroneUploads: 2,
      receivedDroneUploads: 2,
      mappableUploads: 1,
      missingCameraPosition: 1,
      unvalidatedCameraPositions: 1,
      points: [{ uploadId: "a5000000-0000-4000-8000-000000000001" }],
    });
    expect(lister).toHaveBeenCalledWith({ projectId: PROJECT_ID, limit: 500 });
  });

  it("fails closed for a malformed project id", async () => {
    const lister = vi.fn();
    await expect(getDroneUploadMapOverview("not-a-project", lister)).rejects.toThrow(
      "Ugyldig projektreference",
    );
    expect(lister).not.toHaveBeenCalled();
  });

  it("does not truncate a complete 120-photo BEFORE batch", async () => {
    const rows = Array.from({ length: 120 }, (_, index) =>
      upload({
        id: `a5000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        original_file_name: `DJI_${String(index + 1).padStart(4, "0")}.JPG`,
      }),
    );

    const overview = await getDroneUploadMapOverview(PROJECT_ID, vi.fn().mockResolvedValue(rows));
    expect(overview.mappableUploads).toBe(120);
    expect(overview.points).toHaveLength(120);
    expect(new Set(overview.points.map((point) => point.uploadId)).size).toBe(120);
  });
});
