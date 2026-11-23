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
    original_sha256: null,
    original_validation: null,
    original_validation_sha256: null,
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
  function neutralLocalUpload() {
    const row = upload();
    const exif = { DateTimeOriginal: "2026:09:16 12:09:07", latitude: 55.327, longitude: 9.267 };
    const xmp = { CreateDate: "2026-09-16T12:09:07" };
    const capture = { localTimestamp: "2026-09-16T12:09:07", timezoneKnown: false };
    const position = { latitude: exif.latitude, longitude: exif.longitude, source: "exif" };
    const raw = { exif, xmp, parseErrors: [] as string[] };
    const qa = {
      status: "review_required",
      errors: [] as string[],
      warnings: [{ code: "CAPTURE_TIMEZONE_UNKNOWN" }],
    };
    const preview = {
      metadata_schema_version: "drone-image-metadata/v1",
      metadata_status: qa.status,
      content_sha256: "b".repeat(64),
      ready_for_camera_position: false,
      latitude: exif.latitude,
      longitude: exif.longitude,
      drone_metadata: {
        schemaVersion: "drone-image-metadata/v1",
        extractor: "exifr@7.1.3",
        file: {
          name: row.original_file_name,
          sizeBytes: row.file_size,
          mimeType: row.mime_type,
          sha256: "b".repeat(64),
        },
        raw,
        capture,
        qa,
        position,
      },
    };
    row.user_metadata = {
      intake: {
        schema_version: "gofreyra.drone-intake/v1",
        phase: "UNCLASSIFIED",
        media_kind: "drone_photo",
      },
      client_preview: preview,
    };
    return { row, preview, raw, exif, xmp, capture, position, qa };
  }

  it("shows a neutral camera's exact local clock and unconfirmed position without an invented UTC instant", () => {
    const { row, xmp } = neutralLocalUpload();
    Object.assign(xmp, { xmp: { CreateDate: "1970-01-01" } });
    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toMatchObject({
      point: {
        coordinates: { lat: 55.327, lng: 9.267 },
        capturedAt: "",
        capturedAtLabel: "2026-09-16 12:09:07 (lokal tid, tidszone ukendt)",
        intakeMode: "neutral",
        positionTrust: "raw_unvalidated",
      },
    });
    const data = row.user_metadata as { intake: { schema_version: string; phase: string } };
    Object.assign(data.intake, {
      schema_version: "gofreyra.drone-before-intake/v1",
      phase: "BEFORE",
    });
    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toEqual({ reason: "missing_position" });
  });
  it.each([
    [
      "calendar overflow",
      ({ exif, xmp, capture }) => {
        exif.DateTimeOriginal = "2026:02:31 12:09:07";
        xmp.CreateDate = capture.localTimestamp = "2026-02-31T12:09:07";
      },
    ],
    [
      "conflicting sensor time",
      ({ xmp }) => {
        xmp.CreateDate = "2026-09-16T13:09:07";
      },
    ],
    ["conflicting coordinates", ({ xmp }) => Object.assign(xmp, { latitude: 56, longitude: 9 })],
    [
      "untrusted timestamp offset",
      ({ exif }) => Object.assign(exif, { OffsetTimeOriginal: "+02:00" }),
    ],
    [
      "available GPS date and time",
      ({ exif }) => Object.assign(exif, { GPSDateStamp: "2026:09:16", GPSTimeStamp: "10:09:07" }),
    ],
    [
      "unexpected UTC",
      ({ preview }) => Object.assign(preview, { captured_at: "2026-09-16T12:09:07Z" }),
    ],
    [
      "false local time",
      ({ capture }) => {
        capture.localTimestamp = "2026-09-16T23:59:59";
      },
    ],
    [
      "invalid latitude",
      ({ preview }) => {
        preview.latitude = NaN;
      },
    ],
    ["mixed QA warnings", ({ qa }) => qa.warnings.push({ code: "POSITION_VARIANTS" })],
    [
      "unsupported extractor",
      ({ preview }) => {
        preview.drone_metadata.extractor = "other";
      },
    ],
    ["raw parse errors", ({ raw }) => raw.parseErrors.push("damaged")],
  ] satisfies [string, (fixture: ReturnType<typeof neutralLocalUpload>) => unknown][])(
    "rejects neutral local preview with %s",
    (_name, change) => {
      const fixture = neutralLocalUpload();
      change(fixture);
      expect(parseDroneUploadMapPoint(fixture.row, PROJECT_ID)).toEqual({
        reason: "invalid_metadata",
      });
    },
  );
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
        intakeMode: "before",
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
    ["not a drone photo", { upload_type: "image" }, "not_drone_batch"],
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

    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toEqual({ reason: "not_drone_batch" });
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
    expect(lister).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      uploadType: "drone_photo",
      limit: 500,
      afterId: null,
    });
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
  it("maps neutral camera positions beyond 500 existing uploads and rejects mixed intake contracts", async () => {
    const row = upload();
    const metadata = row.user_metadata as { intake: { schema_version: string; phase: string } };
    metadata.intake.schema_version = "gofreyra.drone-intake/v1";
    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toEqual({ reason: "not_drone_batch" });
    metadata.intake.phase = "UNCLASSIFIED";
    expect(parseDroneUploadMapPoint(row, PROJECT_ID)).toMatchObject({
      point: { intakeMode: "neutral", positionTrust: "raw_unvalidated" },
    });
    const before = Array.from({ length: 500 }, (_, i) =>
      upload({ id: `a5000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }),
    );
    const lister = vi
      .fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce([{ ...row, id: OTHER_PROJECT_ID }]);
    const result = await getDroneUploadMapOverview(PROJECT_ID, lister);
    expect(result.points).toHaveLength(501);
    expect(result.points[500].intakeMode).toBe("neutral");
    expect(lister.mock.calls[1][0].afterId).toBe(before[499].id);
  });
});
