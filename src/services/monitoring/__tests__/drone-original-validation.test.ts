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

/** Structural MPO fixture, not a decoded-photo fixture. The auxiliary offset is
 * TIFF-relative; primary size can reproduce DJI's stale pre-metadata value. */
function indexedMpo(
  options: { little?: boolean; staleSize?: boolean; secondary?: Uint8Array } = {},
) {
  const little = options.little ?? true,
    secondary = options.secondary ?? originalJpeg(960, 640);
  const primary = originalJpeg(5472, 3648);
  const padding = options.staleSize ? new Uint8Array(8192) : new Uint8Array();
  if (padding.length) padding.set([0xff, 0xe3, 0x1f, 0xfe]);
  const tiff = new Uint8Array(82),
    view = new DataView(tiff.buffer);
  tiff.set(little ? [0x49, 0x49] : [0x4d, 0x4d]);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, 3, little);
  const tag = (at: number, id: number, type: number, count: number, value: number) => {
    view.setUint16(at, id, little);
    view.setUint16(at + 2, type, little);
    view.setUint32(at + 4, count, little);
    view.setUint32(at + 8, value, little);
  };
  tag(10, 0xb000, 7, 4, 0);
  tiff.set([0x30, 0x31, 0x30, 0x30], 18);
  tag(22, 0xb001, 4, 1, 2);
  tag(34, 0xb002, 7, 32, 50);
  const segment = new Uint8Array([0xff, 0xe2, 0, 88, 0x4d, 0x50, 0x46, 0, ...tiff]);
  const primaryEnd = primary.length + segment.length + padding.length,
    base = 10;
  const bytes = new Uint8Array(primaryEnd + secondary.length);
  bytes.set(primary.subarray(0, 2));
  bytes.set(segment, 2);
  bytes.set(padding, 2 + segment.length);
  bytes.set(primary.subarray(2), 2 + segment.length + padding.length);
  bytes.set(secondary, primaryEnd);
  const index = new DataView(bytes.buffer, base, tiff.length);
  index.setUint32(50, 0xa0030000, little);
  index.setUint32(54, primaryEnd - padding.length, little);
  index.setUint16(64, 2, little);
  index.setUint32(66, 0x40010001, little);
  index.setUint32(70, secondary.length, little);
  index.setUint32(74, primaryEnd - base, little);
  return { bytes, primaryEnd, base, little };
}

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
  it.each([true, false])(
    "accepts fully indexed, contiguous MPO JPEGs in either TIFF byte order: %s",
    (little) => {
      const warnings: { code: string; message: string }[] = [];
      expect(validateJpegStructure(indexedMpo({ little }).bytes, warnings)).toEqual({
        widthPx: 5472,
        heightPx: 3648,
        components: 1,
        encoding: "baseline",
        scans: 1,
      });
      expect(warnings).toEqual([]);
    },
  );
  it("uses parsed primary EOI and exact secondary bounds when DJI primary-size metadata is stale", async () => {
    const { bytes } = indexedMpo({ staleSize: true });
    const warnings: { code: string; message: string }[] = [];
    expect(validateJpegStructure(bytes, warnings)).toMatchObject({ widthPx: 5472, heightPx: 3648 });
    expect(warnings.map((warning) => warning.code)).toEqual(["MPF_PRIMARY_SIZE_ADVISORY"]);
    const result = await validateDroneOriginalBytes(
      canonicalUpload(bytes),
      storageObject(bytes),
      bytes,
      ACTOR_ID,
    );
    expect(result.validatorVersion).toBe("jpeg-structure-exifr/v1");
    expect(result.status).not.toBe("rejected");
    expect(result.warnings.some((warning) => warning.code === "MPF_PRIMARY_SIZE_ADVISORY")).toBe(
      true,
    );
    expect(result.original.sha256).toBe(await sha256File(new Blob([bytes.slice().buffer])));
    expect(result.pixelDecoded).toBe(false);
    expect(result.reportEligible).toBe(false);
    expect(
      await parseStoredDroneOriginalValidation(
        result,
        await originalValidationSha256(result),
        canonicalUpload(bytes),
      ),
    ).toEqual(result);
  });
  it.each([
    "primary_zero",
    "primary_overflow",
    "secondary_gap",
    "secondary_overlap",
    "secondary_overflow",
    "secondary_short",
    "index_overflow",
    "excess_images",
    "non_jpeg_format",
    "bad_secondary",
  ])("rejects malformed MPF boundaries or secondary JPEG: %s", (kind) => {
    const { bytes, base, primaryEnd } = indexedMpo({ staleSize: true }),
      index = new DataView(bytes.buffer, base);
    if (kind === "primary_zero") index.setUint32(54, 0, true);
    if (kind === "primary_overflow") index.setUint32(54, primaryEnd + 1, true);
    if (kind === "secondary_gap") index.setUint32(74, primaryEnd - base + 1, true);
    if (kind === "secondary_overlap") index.setUint32(74, primaryEnd - base - 1, true);
    if (kind === "secondary_overflow") index.setUint32(70, 0xffffffff, true);
    if (kind === "secondary_short") index.setUint32(70, bytes.length - primaryEnd - 1, true);
    if (kind === "index_overflow") index.setUint32(42, 0xffffffff, true);
    if (kind === "excess_images") index.setUint32(30, 9, true);
    if (kind === "non_jpeg_format") index.setUint32(66, 0x41010001, true);
    if (kind === "bad_secondary") bytes[primaryEnd] = 0;
    expect(() => validateJpegStructure(bytes)).toThrow();
  });
  it("continues rejecting unindexed concatenated JPEGs, nested MPOs and all undeclared trailing bytes", () => {
    const { bytes } = indexedMpo();
    for (const invalid of [
      new Uint8Array([...originalJpeg(), ...originalJpeg()]),
      new Uint8Array([...bytes, 0]),
      new Uint8Array([...bytes, ...originalJpeg()]),
      indexedMpo({ secondary: bytes }).bytes,
    ])
      expect(() => validateJpegStructure(invalid)).toThrow();
  });
  it("applies the existing metadata budget across all indexed images", () => {
    const plain = originalJpeg(),
      metadata = new Uint8Array(65004);
    metadata.set([0xff, 0xe1, 0xfd, 0xea]);
    const secondary = new Uint8Array(plain.length + metadata.length * 17);
    secondary.set(plain.subarray(0, 2));
    for (let index = 0; index < 17; index++) secondary.set(metadata, 2 + index * metadata.length);
    secondary.set(plain.subarray(2), 2 + 17 * metadata.length);
    expect(() => validateJpegStructure(indexedMpo({ secondary }).bytes)).toThrow(
      "metadata overskrider",
    );
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
