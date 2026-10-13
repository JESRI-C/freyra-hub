import { describe, expect, it, vi } from "vitest";
import { normaliseDroneImageMetadata, sha256File } from "../drone-image-metadata";
import {
  assertCanonicalDroneOriginal,
  MAX_ORIGINAL_JPEG_BYTES,
  originalValidationSha256,
  parsePreparedDroneOriginal,
  parseStoredDroneOriginalValidation,
  validateDroneOriginalBytes,
  validateJpegStructure,
} from "../drone-original-validation.server";
import {
  ACTOR_ID,
  PROJECT_ID,
  UPLOAD_ID,
  canonicalUpload,
  originalJpeg,
  storageObject,
} from "./drone-original-validation.fixtures";

describe("server original JPEG validation", () => {
  it("validates bounded JPEG structure and reports the actual frame dimensions", () => {
    expect(validateJpegStructure(originalJpeg())).toEqual({
      widthPx: 1,
      heightPx: 1,
      components: 1,
      encoding: "baseline",
      scans: 1,
    });
    expect(validateJpegStructure(originalJpeg(5280, 3956))).toMatchObject({
      widthPx: 5280,
      heightPx: 3956,
    });
  });

  it("rejects renamed non-JPEG, truncation, missing image data, trailing payload and excessive dimensions", () => {
    const bytes = originalJpeg();
    for (const invalid of [
      new TextEncoder().encode("renamed PNG masquerading as JPEG"),
      bytes.slice(0, -1),
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      new Uint8Array([...bytes, 1]),
      originalJpeg(20000, 20000),
    ]) {
      expect(() => validateJpegStructure(invalid)).toThrow();
    }
  });

  it("does not accept draft, foreign project, legacy, forged path or oversized uploads", () => {
    const upload = canonicalUpload();
    for (const patch of [
      { status: "draft" },
      { project_id: ACTOR_ID },
      { intent_request_id: null },
      { storage_path: `${ACTOR_ID}/other.jpg` },
      { file_size: MAX_ORIGINAL_JPEG_BYTES + 1 },
    ]) {
      expect(() =>
        assertCanonicalDroneOriginal({ ...upload, ...patch }, PROJECT_ID, UPLOAD_ID),
      ).toThrow();
    }
  });

  it("re-extracts actual original bytes and never invents GPS, capture UTC or timezone", async () => {
    const bytes = originalJpeg(),
      upload = canonicalUpload(bytes);
    const result = await validateDroneOriginalBytes(upload, storageObject(bytes), bytes, ACTOR_ID);
    expect(result.original.sha256).toBe(await sha256File(new Blob([bytes.slice().buffer])));
    expect(result.metadata?.file.lastModified).toBe(0);
    expect(result.status).toBe("review_required");
    expect(result.metadata?.position).toBeUndefined();
    expect(result.metadata?.capture.capturedAtUtc).toBeUndefined();
    expect(result.metadata?.capture.timezoneKnown).toBe(false);
    expect(result.cameraPositionEligible).toBe(false);
    expect(result.reportEligible).toBe(false);
    expect(result.georeferenced).toBe(false);
    expect(result.pixelDecoded).toBe(false);
  });

  it("rejects invalid bytes before calling the metadata parser and binds rejection to actual SHA", async () => {
    const bytes = new TextEncoder().encode("not a JPEG"),
      extract = vi.fn();
    const result = await validateDroneOriginalBytes(
      canonicalUpload(bytes),
      storageObject(bytes),
      bytes,
      ACTOR_ID,
      { extract },
    );
    expect(result.status).toBe("rejected");
    expect(result.metadata).toBeNull();
    expect(result.jpegStructure).toBeNull();
    expect(extract).not.toHaveBeenCalled();
    expect(result.original.sha256).toBe(await sha256File(new Blob([bytes.slice().buffer])));
  });

  it("hashes and parses only the supplied view when its backing buffer contains other bytes", async () => {
    const bytes = originalJpeg();
    const backing = new Uint8Array(bytes.length + 2);
    backing.set(bytes, 1);
    const view = backing.subarray(1, 1 + bytes.length);
    const result = await validateDroneOriginalBytes(
      canonicalUpload(bytes),
      storageObject(bytes),
      view,
      ACTOR_ID,
    );
    expect(result.original.sha256).toBe(await sha256File(new Blob([bytes.slice().buffer])));
    expect(result.jpegStructure).toMatchObject({ widthPx: 1, heightPx: 1 });
  });

  it("keeps a local EXIF timestamp local rather than inferring Europe/Copenhagen", async () => {
    const bytes = originalJpeg();
    const extract = vi.fn(async (file: File) =>
      normaliseDroneImageMetadata(
        { GPSLatitude: 55.25, GPSLongitude: 9.48, DateTimeOriginal: "2026:10:13 12:00:00" },
        null,
        { name: file.name, sizeBytes: file.size, mimeType: file.type, lastModified: 0 },
        await sha256File(file),
      ),
    );
    const result = await validateDroneOriginalBytes(
      canonicalUpload(bytes),
      storageObject(bytes),
      bytes,
      ACTOR_ID,
      { extract },
    );
    expect(result.metadata?.capture.localTimestamp).toContain("2026");
    expect(result.metadata?.capture.capturedAtUtc).toBeUndefined();
    expect(result.cameraPositionEligible).toBe(false);
  });

  it("accepts server-extracted GPS/time only as a camera point and never a footprint or approval", async () => {
    const bytes = originalJpeg();
    const extract = vi.fn(async (file: File) =>
      normaliseDroneImageMetadata(
        {
          GPSLatitude: 55.25,
          GPSLongitude: 9.48,
          DateTimeOriginal: "2026:10:13 12:00:00",
          OffsetTimeOriginal: "+02:00",
        },
        null,
        { name: file.name, sizeBytes: file.size, mimeType: file.type, lastModified: 0 },
        await sha256File(file),
      ),
    );
    const result = await validateDroneOriginalBytes(
      canonicalUpload(bytes),
      storageObject(bytes),
      bytes,
      ACTOR_ID,
      { extract },
    );
    expect(result.metadata?.capture.capturedAtUtc).toBe("2026-10-13T10:00:00.000Z");
    expect(result.cameraPositionEligible).toBe(true);
    expect(result.georeferenced).toBe(false);
    expect(result.reportEligible).toBe(false);
  });

  it("fails closed on download-size mismatch or extractor hash mismatch", async () => {
    const bytes = originalJpeg(),
      upload = canonicalUpload(bytes);
    await expect(
      validateDroneOriginalBytes(upload, storageObject(bytes), bytes.slice(1), ACTOR_ID),
    ).rejects.toThrow("filstørrelsen");
    const badMetadata = normaliseDroneImageMetadata(
      {},
      null,
      {
        name: upload.original_file_name,
        sizeBytes: upload.file_size,
        mimeType: upload.mime_type,
        lastModified: 0,
      },
      "a".repeat(64),
    );
    await expect(
      validateDroneOriginalBytes(upload, storageObject(bytes), bytes, ACTOR_ID, {
        extract: vi.fn().mockResolvedValue(badMetadata),
      }),
    ).rejects.toThrow("SHA-256");
  });

  it("validates stored idempotent results without downloading or recomputing metadata", async () => {
    const bytes = originalJpeg(),
      upload = canonicalUpload(bytes),
      object = storageObject(bytes);
    const result = await validateDroneOriginalBytes(upload, object, bytes, ACTOR_ID);
    const checksum = await originalValidationSha256(result);
    expect(
      (
        await parsePreparedDroneOriginal(
          { upload, object, existing: result, existing_sha256: checksum },
          PROJECT_ID,
          UPLOAD_ID,
        )
      ).existing,
    ).toEqual(result);
    expect(await parseStoredDroneOriginalValidation(result, checksum, upload)).toEqual(result);
    const reordered = Object.fromEntries(Object.entries(result).reverse());
    expect(await originalValidationSha256(reordered)).toBe(checksum);
  });

  it("rejects stored metadata tampering and changed Storage versions", async () => {
    const bytes = originalJpeg(),
      upload = canonicalUpload(bytes),
      object = storageObject(bytes);
    const result = await validateDroneOriginalBytes(upload, object, bytes, ACTOR_ID),
      checksum = await originalValidationSha256(result);
    await expect(
      parseStoredDroneOriginalValidation({ ...result, reportEligible: true }, checksum, upload),
    ).rejects.toThrow("checksum");
    await expect(
      parsePreparedDroneOriginal(
        {
          upload,
          object: { ...object, version: "replacement" },
          existing: result,
          existing_sha256: checksum,
        },
        PROJECT_ID,
        UPLOAD_ID,
      ),
    ).rejects.toThrow("Storage-version");
  });
});
