import { describe, expect, it, vi } from "vitest";
import {
  extractDroneImageMetadata,
  isReadyForAutomaticCameraPosition,
  normaliseDroneImageMetadata,
  sha256File,
  toJsonValue,
} from "@/services/monitoring/drone-image-metadata";

const FILE_INFO = {
  name: "DJI_0001.JPG",
  sizeBytes: 42,
  mimeType: "image/jpeg",
  lastModified: 1_777_777_777_000,
};

const HASH = "a".repeat(64);

function buildMinimalExifJpeg(): File {
  const tiff = new Uint8Array(337);
  const view = new DataView(tiff.buffer);
  const ascii = new TextEncoder();
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  const entry = (offset: number, tag: number, type: number, count: number, value: number) => {
    u16(offset, tag);
    u16(offset + 2, type);
    u32(offset + 4, count);
    u32(offset + 8, value);
  };
  const inlineAscii = (offset: number, value: string) => {
    tiff.set(ascii.encode(`${value}\0`), offset + 8);
  };
  const text = (offset: number, value: string) => tiff.set(ascii.encode(`${value}\0`), offset);
  const rational = (offset: number, numerator: number, denominator: number) => {
    u32(offset, numerator);
    u32(offset + 4, denominator);
  };

  // Little-endian TIFF header with IFD0 at byte 8.
  tiff.set([0x49, 0x49], 0);
  u16(2, 42);
  u32(4, 8);

  u16(8, 4);
  entry(10, 0x010f, 2, 4, 0); // Make
  inlineAscii(10, "DJI");
  entry(22, 0x0110, 2, 19, 62); // Model
  entry(34, 0x8769, 4, 1, 82); // Exif IFD pointer
  entry(46, 0x8825, 4, 1, 184); // GPS IFD pointer
  u32(58, 0);
  text(62, "Mavic 3 Enterprise");

  u16(82, 5);
  entry(84, 0x9003, 2, 20, 148); // DateTimeOriginal
  entry(96, 0x9011, 2, 7, 168); // OffsetTimeOriginal
  entry(108, 0x920a, 5, 1, 176); // FocalLength
  entry(120, 0xa002, 4, 1, 5280); // PixelXDimension
  entry(132, 0xa003, 4, 1, 3956); // PixelYDimension
  u32(144, 0);
  text(148, "2026:08:28 14:05:06");
  text(168, "+02:00");
  rational(176, 123, 10);

  u16(184, 7);
  entry(186, 0x0001, 2, 2, 0); // GPSLatitudeRef
  inlineAscii(186, "N");
  entry(198, 0x0002, 5, 3, 274); // GPSLatitude
  entry(210, 0x0003, 2, 2, 0); // GPSLongitudeRef
  inlineAscii(210, "E");
  entry(222, 0x0004, 5, 3, 298); // GPSLongitude
  entry(234, 0x0005, 1, 1, 0); // GPSAltitudeRef
  entry(246, 0x0006, 5, 1, 322); // GPSAltitude
  entry(258, 0x0012, 2, 7, 330); // GPSMapDatum
  u32(270, 0);
  rational(274, 55, 1);
  rational(282, 14, 1);
  rational(290, 444408, 10_000);
  rational(298, 9, 1);
  rational(306, 29, 1);
  rational(314, 155544, 10_000);
  rational(322, 784, 10);
  text(330, "WGS-84");

  const exifHeader = ascii.encode("Exif\0\0");
  const payloadLength = exifHeader.length + tiff.length;
  const jpeg = new Uint8Array(2 + 2 + 2 + payloadLength + 2);
  jpeg.set([0xff, 0xd8, 0xff, 0xe1], 0);
  new DataView(jpeg.buffer).setUint16(4, payloadLength + 2, false);
  jpeg.set(exifHeader, 6);
  jpeg.set(tiff, 6 + exifHeader.length);
  jpeg.set([0xff, 0xd9], jpeg.length - 2);
  // Keep the runtime value a Uint8Array so exifr uses its native buffer reader
  // in Vitest's Node environment, while exposing the File fields used by the
  // production extractor. Browsers pass a real File through the same parser.
  return Object.assign(jpeg, {
    name: "DJI_0001.JPG",
    size: jpeg.byteLength,
    type: "image/jpeg",
    lastModified: FILE_INFO.lastModified,
    arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
  }) as unknown as File;
}

function standardExif(overrides: Record<string, unknown> = {}) {
  return {
    ifd0: {
      Make: "DJI",
      Model: "Mavic 3 Enterprise",
      ImageWidth: 5280,
      ImageHeight: 3956,
    },
    exif: {
      DateTimeOriginal: "2026:08:28 14:05:06",
      SubSecTimeOriginal: "123",
      OffsetTimeOriginal: "+02:00",
      FocalLength: 12.3,
    },
    gps: {
      latitude: 55.245678,
      longitude: 9.487654,
      GPSAltitude: 78.4,
      GPSAltitudeRef: 0,
      GPSHPositioningError: 0.04,
      GPSMapDatum: "WGS-84",
      GPSImgDirection: 91.5,
      GPSImgDirectionRef: "T",
      ...overrides,
    },
  };
}

describe("normaliseDroneImageMetadata", () => {
  it("normalises standard EXIF without using the host timezone", () => {
    const metadata = normaliseDroneImageMetadata(standardExif(), null, FILE_INFO, HASH);

    expect(metadata.position).toMatchObject({
      latitude: 55.245678,
      longitude: 9.487654,
      source: "exif",
      datum: "WGS-84",
      horizontalAccuracyM: 0.04,
    });
    expect(metadata.capture).toEqual({
      capturedAtUtc: "2026-08-28T12:05:06.123Z",
      offset: "+02:00",
      timezoneKnown: true,
      source: "exif-offset",
    });
    expect(metadata.altitude.gpsM).toBe(78.4);
    expect(metadata.orientation.imageDirectionDeg).toBe(91.5);
    expect(metadata.orientation.imageOrientation).toBeUndefined();
    expect(metadata.camera).toMatchObject({
      make: "DJI",
      model: "Mavic 3 Enterprise",
      focalLengthMm: 12.3,
      widthPx: 5280,
      heightPx: 3956,
    });
    expect(metadata.qa.status).toBe("ready");
    expect(isReadyForAutomaticCameraPosition(metadata)).toBe(true);
  });

  it("keeps altitude forms separate and applies below-sea-level GPS reference", () => {
    const metadata = normaliseDroneImageMetadata(
      standardExif({ GPSAltitude: 3.2, GPSAltitudeRef: 1 }),
      { "drone-dji": { AbsoluteAltitude: "+52.75", RelativeAltitude: "+31.20" } },
      FILE_INFO,
      HASH,
    );

    expect(metadata.altitude).toEqual({
      gpsM: -3.2,
      gpsRef: 1,
      absoluteM: 52.75,
      relativeTakeoffM: 31.2,
    });
  });

  it("uses GPS date/time as deterministic UTC fallback", () => {
    const exif = standardExif();
    exif.exif = { FocalLength: 12.3 } as typeof exif.exif;
    Object.assign(exif.gps, { GPSDateStamp: "2026:08:28", GPSTimeStamp: [12, 5, 6.25] });

    const metadata = normaliseDroneImageMetadata(exif, null, FILE_INFO, HASH);
    expect(metadata.capture).toEqual({
      capturedAtUtc: "2026-08-28T12:05:06.250Z",
      timezoneKnown: true,
      source: "gps-utc",
    });
  });

  it("never coerces an offsetless local timestamp into timestamptz", () => {
    const exif = standardExif();
    delete (exif.exif as Partial<typeof exif.exif>).OffsetTimeOriginal;

    const metadata = normaliseDroneImageMetadata(exif, null, FILE_INFO, HASH);
    expect(metadata.capture.capturedAtUtc).toBeUndefined();
    expect(metadata.capture.localTimestamp).toBe("2026-08-28T14:05:06.123");
    expect(metadata.capture.timezoneKnown).toBe(false);
    expect(metadata.qa.warnings.map((issue) => issue.code)).toContain("CAPTURE_TIMEZONE_UNKNOWN");
    expect(isReadyForAutomaticCameraPosition(metadata)).toBe(false);
  });

  it("preserves DJI XMP flight, gimbal, calibration and RTK values", () => {
    const xmp = {
      "drone-dji": {
        GpsLatitude: "+55.245678",
        GpsLongitude: "+9.487654",
        AbsoluteAltitude: "+82.50",
        RelativeAltitude: "+39.10",
        FlightYawDegree: "-179.90",
        FlightPitchDegree: "-2.70",
        FlightRollDegree: "+0.30",
        GimbalYawDegree: "+175.60",
        GimbalPitchDegree: "-90.00",
        GimbalRollDegree: "+0.00",
        RtkFlag: "50",
        RtkStdLat: "0.01205",
        RtkStdLon: "0.01023",
        RtkStdHgt: "0.02511",
        CalibratedFocalLength: "3666.666504",
        CalibratedOpticalCenterX: "2736.0",
        CalibratedOpticalCenterY: "1824.0",
        CreateDate: "2026-08-28T14:05:06.123+02:00",
      },
    };

    const metadata = normaliseDroneImageMetadata(null, xmp, FILE_INFO, HASH);
    expect(metadata.position).toMatchObject({
      latitude: 55.245678,
      longitude: 9.487654,
      source: "xmp",
    });
    expect(metadata.altitude).toMatchObject({ absoluteM: 82.5, relativeTakeoffM: 39.1 });
    expect(metadata.orientation.drone).toEqual({ yawDeg: 180.1, pitchDeg: -2.7, rollDeg: 0.3 });
    expect(metadata.orientation.gimbal).toEqual({ yawDeg: 175.6, pitchDeg: -90, rollDeg: 0 });
    expect(metadata.orientation.viewDirectionDeg).toBe(175.6);
    expect(metadata.rtk).toEqual({
      flagRaw: "50",
      stdLatRaw: 0.01205,
      stdLonRaw: 0.01023,
      stdHeightRaw: 0.02511,
    });
    expect(metadata.camera).toMatchObject({
      calibratedFocalLength: 3666.666504,
      opticalCenterX: 2736,
      opticalCenterY: 1824,
    });
  });

  it("treats zero degrees and zero roll as valid values", () => {
    const metadata = normaliseDroneImageMetadata(
      standardExif({ GPSImgDirection: 0 }),
      { "drone-dji": { GimbalYawDegree: 0, GimbalPitchDegree: -90, GimbalRollDegree: 0 } },
      FILE_INFO,
      HASH,
    );
    expect(metadata.orientation.viewDirectionDeg).toBe(0);
    expect(metadata.orientation.gimbal).toEqual({ yawDeg: 0, pitchDeg: -90, rollDeg: 0 });
  });

  it("blocks invalid coordinates", () => {
    const metadata = normaliseDroneImageMetadata(
      standardExif({ latitude: 95, longitude: 9 }),
      null,
      FILE_INFO,
      HASH,
    );
    expect(metadata.position).toBeUndefined();
    expect(metadata.qa.status).toBe("blocked");
    expect(metadata.qa.errors.map((issue) => issue.code)).toContain("POSITION_INVALID");
  });

  it("blocks EXIF/XMP positions that disagree by more than five metres", () => {
    const metadata = normaliseDroneImageMetadata(
      standardExif(),
      { "drone-dji": { GpsLatitude: 55.255678, GpsLongitude: 9.497654 } },
      FILE_INFO,
      HASH,
    );
    expect(metadata.qa.status).toBe("blocked");
    expect(metadata.qa.errors.map((issue) => issue.code)).toContain("POSITION_CONFLICT");
    expect(isReadyForAutomaticCameraPosition(metadata)).toBe(false);
  });

  it("retains raw evidence and blocks automatic placement when GPS is missing", () => {
    const metadata = normaliseDroneImageMetadata(
      {
        ifd0: { Make: "Unknown", MakerNote: new Uint8Array([1, 2, 3]) },
        exif: standardExif().exif,
      },
      null,
      FILE_INFO,
      HASH,
    );
    expect(metadata.file.sha256).toBe(HASH);
    expect(metadata.raw.exif).toMatchObject({
      ifd0: { Make: "Unknown", MakerNote: { type: "Uint8Array", byteLength: 3 } },
    });
    expect(metadata.qa.errors.map((issue) => issue.code)).toContain("POSITION_MISSING");
  });
});

describe("extraction and serialization", () => {
  it("extracts a real in-memory JPEG/EXIF fixture through exifr", async () => {
    const metadata = await extractDroneImageMetadata(buildMinimalExifJpeg());

    expect(metadata.position).toMatchObject({ source: "exif", datum: "WGS-84" });
    expect(metadata.position?.latitude).toBeCloseTo(55.245678, 6);
    expect(metadata.position?.longitude).toBeCloseTo(9.487654, 6);
    expect(metadata.capture).toEqual({
      capturedAtUtc: "2026-08-28T12:05:06.000Z",
      offset: "+02:00",
      timezoneKnown: true,
      source: "exif-offset",
    });
    expect(metadata.camera).toMatchObject({
      make: "DJI",
      model: "Mavic 3 Enterprise",
      focalLengthMm: 12.3,
      widthPx: 5280,
      heightPx: 3956,
    });
    expect(metadata.altitude.gpsM).toBe(78.4);
    expect(metadata.raw.parseErrors).toEqual([]);
  });

  it("produces the known SHA-256 for a deterministic fixture", async () => {
    const file = new File(["gofreyra-drone-fixture-v1"], "fixture.jpg", { type: "image/jpeg" });
    await expect(sha256File(file)).resolves.toBe(
      "912c0c16e2ec2e579bb5bbf5efaeecfe18c771370d8a0aa25de6319a0f48b0c8",
    );
  });

  it("calls exifr with timezone-safe parsing and preserves raw XMP", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce(standardExif())
      .mockResolvedValueOnce({ xmp: "<x:xmpmeta><rdf:RDF /></x:xmpmeta>" });
    const sidecar = vi.fn().mockResolvedValue({ "drone-dji": { RtkFlag: "50" } });
    const file = new File(["gofreyra-drone-fixture-v1"], "fixture.jpg", {
      type: "image/jpeg",
      lastModified: FILE_INFO.lastModified,
    });

    const metadata = await extractDroneImageMetadata(file, {
      reader: { parse, sidecar } as never,
    });

    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[0]?.[1]).toMatchObject({
      reviveValues: false,
      xmp: false,
      makerNote: true,
    });
    expect(parse.mock.calls[1]?.[1]).toMatchObject({
      reviveValues: false,
      xmp: { parse: false, multiSegment: true },
    });
    expect(sidecar).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ reviveValues: false }),
      "xmp",
    );
    expect(metadata.raw.xmpXml).toContain("x:xmpmeta");
    expect(metadata.file.sha256).toBe(
      "912c0c16e2ec2e579bb5bbf5efaeecfe18c771370d8a0aa25de6319a0f48b0c8",
    );
  });

  it("serializes cycles and binary metadata deterministically", () => {
    const circular: Record<string, unknown> = { bytes: new Uint16Array([1, 2]) };
    circular.self = circular;
    expect(toJsonValue(circular)).toEqual({
      bytes: { type: "Uint16Array", byteLength: 4 },
      self: "[Circular]",
    });
  });
});
