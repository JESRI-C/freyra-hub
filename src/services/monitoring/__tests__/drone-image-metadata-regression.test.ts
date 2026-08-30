import { describe, expect, it, vi } from "vitest";
import {
  extractDroneImageMetadata,
  isReadyForAutomaticCameraPosition,
  normaliseDroneImageMetadata,
} from "@/services/monitoring/drone-image-metadata";

const FILE_INFO = {
  name: "DJI_REGRESSION.JPG",
  sizeBytes: 128,
  mimeType: "image/jpeg",
  lastModified: 1_777_777_777_000,
};

const HASH = "b".repeat(64);

function positionedExif(overrides: Record<string, unknown> = {}) {
  return {
    ifd0: { Make: "DJI", Model: "Mavic 3 Enterprise", ImageWidth: 5280, ImageHeight: 3956 },
    exif: {
      DateTimeOriginal: "2026:08:28 14:05:06",
      OffsetTimeOriginal: "+02:00",
      FocalLength: 12.3,
    },
    gps: {
      latitude: 55.245678,
      longitude: 9.487654,
      GPSHPositioningError: 2.5,
      ...overrides,
    },
  };
}

describe("drone metadata P0 regressions", () => {
  it("never combines latitude and longitude from different metadata parents", () => {
    const metadata = normaliseDroneImageMetadata(
      {
        exif: { DateTimeOriginal: "2026:08:28 14:05:06", OffsetTimeOriginal: "+02:00" },
        gps: { latitude: 55.245678 },
      },
      { "drone-dji": { GpsLongitude: 9.487654 } },
      FILE_INFO,
      HASH,
    );

    expect(metadata.position).toBeUndefined();
    expect(metadata.qa.errors.map((issue) => issue.code)).toContain("POSITION_MISSING");
    expect(isReadyForAutomaticCameraPosition(metadata)).toBe(false);
  });

  it("keeps reported accuracy bound to the selected complete coordinate parent", () => {
    const metadata = normaliseDroneImageMetadata(
      positionedExif(),
      {
        "drone-dji": {
          GpsLatitude: 55.245683,
          GpsLongitude: 9.487659,
          RtkStdLat: 0.01,
          RtkStdLon: 0.02,
        },
      },
      FILE_INFO,
      HASH,
    );

    expect(metadata.position).toMatchObject({
      source: "exif",
      latitude: 55.245678,
      longitude: 9.487654,
      horizontalAccuracyM: 2.5,
    });
    expect(metadata.position?.horizontalAccuracyM).not.toBeCloseTo(Math.hypot(0.01, 0.02));
  });

  it("does not borrow an XMP offset for an EXIF timestamp", () => {
    const exif = positionedExif();
    delete (exif.exif as Partial<typeof exif.exif>).OffsetTimeOriginal;
    const metadata = normaliseDroneImageMetadata(
      exif,
      { "drone-dji": { OffsetTimeOriginal: "+02:00" } },
      FILE_INFO,
      HASH,
    );

    expect(metadata.capture).toMatchObject({
      localTimestamp: "2026-08-28T14:05:06",
      timezoneKnown: false,
    });
    expect(metadata.capture.capturedAtUtc).toBeUndefined();
    expect(isReadyForAutomaticCameraPosition(metadata)).toBe(false);
  });

  it("parses an embedded offset in EXIF colon format and applies sibling subseconds", () => {
    const exif = positionedExif();
    delete (exif.exif as Partial<typeof exif.exif>).OffsetTimeOriginal;
    Object.assign(exif.exif, {
      DateTimeOriginal: "2026:08:28 14:05:06+02:00",
      SubSecTimeOriginal: "123",
      FocalLength: 12.3,
    });

    const metadata = normaliseDroneImageMetadata(exif, null, FILE_INFO, HASH);
    expect(metadata.capture).toEqual({
      capturedAtUtc: "2026-08-28T12:05:06.123Z",
      offset: "+02:00",
      timezoneKnown: true,
      source: "exif-offset",
    });
  });

  it.each([
    ["an impossible calendar date", "2026:02:31 14:05:06", undefined],
    ["a year outside the supported evidence range", "0001:01:01 00:00:00", undefined],
    ["an out-of-range GPS hour", undefined, [25, 0, 0]],
  ])("rejects %s instead of allowing Date rollover", (_label, localTime, gpsTime) => {
    const exif = positionedExif();
    exif.exif = localTime
      ? ({
          DateTimeOriginal: localTime,
          OffsetTimeOriginal: "+02:00",
          FocalLength: 12.3,
        } as typeof exif.exif)
      : ({ FocalLength: 12.3 } as typeof exif.exif);
    Object.assign(exif.gps, { GPSDateStamp: "2026:08:28", GPSTimeStamp: gpsTime });

    const metadata = normaliseDroneImageMetadata(exif, null, FILE_INFO, HASH);
    expect(metadata.capture.capturedAtUtc).toBeUndefined();
    expect(metadata.qa.errors.map((issue) => issue.code)).toContain("CAPTURE_TIME_MISSING");
    expect(isReadyForAutomaticCameraPosition(metadata)).toBe(false);
  });

  it("harvests exifr output.errors and blocks automatic readiness", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce({ ...positionedExif(), errors: [new Error("broken TIFF entry")] })
      .mockResolvedValueOnce({});
    const sidecar = vi.fn();
    const file = new File(["metadata-regression"], "fixture.jpg", { type: "image/jpeg" });

    const metadata = await extractDroneImageMetadata(file, {
      reader: { parse, sidecar } as never,
    });

    expect(metadata.raw.parseErrors).toContain("EXIF: broken TIFF entry");
    expect(metadata.qa.warnings.map((issue) => issue.code)).toContain("METADATA_PARSE_WARNING");
    expect(metadata.position).toBeDefined();
    expect(metadata.capture.capturedAtUtc).toBeDefined();
    expect(isReadyForAutomaticCameraPosition(metadata)).toBe(false);
  });

  it("preserves the hash but blocks readiness when XMP sidecar parsing fails", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce(positionedExif())
      .mockResolvedValueOnce({ xmp: "<x:xmpmeta><rdf:RDF /></x:xmpmeta>" });
    const sidecar = vi.fn().mockRejectedValue(new Error("malformed XMP"));
    const file = new File(["metadata-regression"], "fixture.jpg", { type: "image/jpeg" });

    const metadata = await extractDroneImageMetadata(file, {
      reader: { parse, sidecar } as never,
    });

    expect(metadata.file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.raw.xmpXml).toContain("x:xmpmeta");
    expect(metadata.raw.parseErrors).toContain("XMP: malformed XMP");
    expect(isReadyForAutomaticCameraPosition(metadata)).toBe(false);
  });
});
