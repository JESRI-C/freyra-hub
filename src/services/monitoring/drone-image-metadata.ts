import exifr from "exifr";

export const DRONE_METADATA_SCHEMA_VERSION = "drone-image-metadata/v1";
export const DRONE_METADATA_EXTRACTOR = "exifr@7.1.3";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DroneMetadataQaStatus = "ready" | "review_required" | "blocked";

export interface DroneMetadataIssue {
  code: string;
  message: string;
}

export interface DroneImageMetadata {
  schemaVersion: typeof DRONE_METADATA_SCHEMA_VERSION;
  extractor: typeof DRONE_METADATA_EXTRACTOR;
  file: {
    name: string;
    sizeBytes: number;
    mimeType: string;
    lastModified: number;
    sha256: string;
  };
  raw: {
    exif: JsonValue;
    xmpXml: string | null;
    xmp: JsonValue;
    parseErrors: string[];
  };
  capture: {
    capturedAtUtc?: string;
    localTimestamp?: string;
    offset?: string;
    timezoneKnown: boolean;
    source?: "exif-offset" | "gps-utc" | "xmp-offset";
  };
  position?: {
    latitude: number;
    longitude: number;
    source: "exif" | "xmp";
    datum?: string;
    horizontalAccuracyM?: number;
    dop?: number;
    differential?: number;
  };
  altitude: {
    gpsM?: number;
    gpsRef?: number;
    absoluteM?: number;
    relativeTakeoffM?: number;
  };
  orientation: {
    imageOrientation?: number;
    imageDirectionDeg?: number;
    imageDirectionRef?: "T" | "M";
    drone?: { yawDeg?: number; pitchDeg?: number; rollDeg?: number };
    gimbal?: { yawDeg?: number; pitchDeg?: number; rollDeg?: number };
    viewDirectionDeg?: number;
    reference: "true_north" | "magnetic" | "vendor_reported" | "unknown";
  };
  camera: {
    make?: string;
    model?: string;
    serial?: string;
    lensMake?: string;
    lensModel?: string;
    lensSerial?: string;
    focalLengthMm?: number;
    focalLength35Mm?: number;
    widthPx?: number;
    heightPx?: number;
    calibratedFocalLength?: number;
    opticalCenterX?: number;
    opticalCenterY?: number;
    dewarpData?: string;
  };
  rtk: {
    flagRaw?: string | number;
    stdLatRaw?: number;
    stdLonRaw?: number;
    stdHeightRaw?: number;
    gpsDifferential?: number;
  };
  footprintReadiness:
    | "ready"
    | "needs_ground_elevation"
    | "needs_intrinsics"
    | "needs_orientation"
    | "insufficient";
  qa: {
    status: DroneMetadataQaStatus;
    errors: DroneMetadataIssue[];
    warnings: DroneMetadataIssue[];
  };
}

interface MetadataReader {
  parse: typeof exifr.parse;
  sidecar: typeof exifr.sidecar;
}

interface MetadataDependencies {
  reader?: MetadataReader;
  subtle?: SubtleCrypto;
}

interface FileInfo {
  name: string;
  sizeBytes: number;
  mimeType: string;
  lastModified: number;
}

interface Candidate {
  path: string;
  value: unknown;
}

interface PositionCandidate {
  path: string;
  source: "exif" | "xmp";
  latitude: number;
  longitude: number;
  datum?: string;
  horizontalAccuracyM?: number;
  dop?: number;
  differential?: number;
}

interface CaptureCandidate {
  path: string;
  value: unknown;
  offset?: string;
  subSeconds?: string;
  source: "exif-offset" | "xmp-offset";
}

interface ParsedOffsetTimestamp {
  capturedAtUtc: string;
  offset: string;
}

const EXIF_OPTIONS = {
  tiff: true,
  ifd0: {},
  ifd1: true,
  exif: true,
  gps: true,
  interop: true,
  xmp: false,
  iptc: true,
  jfif: true,
  ihdr: true,
  makerNote: true,
  userComment: true,
  mergeOutput: false,
  translateKeys: true,
  translateValues: false,
  reviveValues: false,
  sanitize: false,
} as const;

const RAW_XMP_OPTIONS = {
  tiff: false,
  xmp: { parse: false, multiSegment: true },
  mergeOutput: false,
  translateKeys: true,
  translateValues: false,
  reviveValues: false,
  sanitize: false,
} as const;

/**
 * Extracts the metadata needed to position a drone camera without discarding
 * the original evidence. Proprietary MakerNotes are retained in the source
 * file; binary metadata values are represented by type and byte length in the
 * JSON envelope so a later server-side extractor can safely reprocess them.
 */
export async function extractDroneImageMetadata(
  file: File,
  dependencies: MetadataDependencies = {},
): Promise<DroneImageMetadata> {
  const reader = dependencies.reader ?? exifr;
  const subtle = dependencies.subtle ?? crypto.subtle;
  const parseErrors: string[] = [];
  const sha256 = await sha256File(file, subtle);

  let exifOutput: unknown = null;
  try {
    exifOutput = await reader.parse(file, EXIF_OPTIONS);
    appendParserOutputErrors(exifOutput, "EXIF", parseErrors);
  } catch (error) {
    parseErrors.push(`EXIF: ${errorMessage(error)}`);
  }

  let xmpXml: string | null = null;
  let xmpOutput: unknown = null;
  try {
    const envelope = await reader.parse(file, RAW_XMP_OPTIONS);
    appendParserOutputErrors(envelope, "XMP", parseErrors);
    xmpXml = findFirstString(envelope, ["xmp"]);
    if (xmpXml) {
      xmpOutput = await reader.sidecar(
        new TextEncoder().encode(xmpXml),
        {
          xmp: true,
          mergeOutput: false,
          translateKeys: true,
          translateValues: false,
          reviveValues: false,
          sanitize: false,
        },
        "xmp",
      );
      appendParserOutputErrors(xmpOutput, "XMP sidecar", parseErrors);
    }
  } catch (error) {
    parseErrors.push(`XMP: ${errorMessage(error)}`);
  }

  return normaliseDroneImageMetadata(
    exifOutput,
    xmpOutput,
    {
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
      lastModified: file.lastModified,
    },
    sha256,
    { xmpXml, parseErrors },
  );
}

export async function sha256File(
  file: Blob,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normaliseDroneImageMetadata(
  exifOutput: unknown,
  xmpOutput: unknown,
  file: FileInfo,
  sha256: string,
  raw: { xmpXml?: string | null; parseErrors?: string[] } = {},
): DroneImageMetadata {
  const source = { exif: exifOutput, xmp: xmpOutput };
  const errors: DroneMetadataIssue[] = [];
  const warnings: DroneMetadataIssue[] = [];

  const position = normalisePosition(source, errors, warnings);
  const capture = normaliseCaptureTime(source, errors, warnings);

  const gpsAltitude = firstNumber(source, ["GPSAltitude"]);
  const gpsAltitudeRef = firstNumber(source, ["GPSAltitudeRef"]);
  const signedGpsAltitude =
    gpsAltitude == null ? undefined : gpsAltitudeRef === 1 ? -Math.abs(gpsAltitude) : gpsAltitude;
  const absoluteAltitude = firstNumber(source, ["AbsoluteAltitude"]);
  const relativeAltitude = firstNumber(source, ["RelativeAltitude"]);

  const imageDirection = normaliseDegrees(firstNumber(source, ["GPSImgDirection"]));
  const imageDirectionRef = normaliseDirectionRef(firstString(source, ["GPSImgDirectionRef"]));
  const droneYaw = normaliseDegrees(firstNumber(source, ["FlightYawDegree", "CameraYaw", "Yaw"]));
  const dronePitch = firstNumber(source, ["FlightPitchDegree", "CameraPitch", "Pitch"]);
  const droneRoll = firstNumber(source, ["FlightRollDegree", "CameraRoll", "Roll"]);
  const gimbalYaw = normaliseDegrees(firstNumber(source, ["GimbalYawDegree"]));
  const gimbalPitch = firstNumber(source, ["GimbalPitchDegree"]);
  const gimbalRoll = firstNumber(source, ["GimbalRollDegree"]);
  const viewDirection = gimbalYaw ?? imageDirection ?? droneYaw;

  let orientationReference: DroneImageMetadata["orientation"]["reference"] = "unknown";
  if (gimbalYaw != null || droneYaw != null) orientationReference = "vendor_reported";
  else if (imageDirectionRef === "T") orientationReference = "true_north";
  else if (imageDirectionRef === "M") {
    orientationReference = "magnetic";
    warnings.push({
      code: "MAGNETIC_DIRECTION_UNCORRECTED",
      message: "Billedretningen er magnetisk og er ikke korrigeret for deklination.",
    });
  }
  if (viewDirection == null) {
    warnings.push({
      code: "VIEW_DIRECTION_MISSING",
      message: "Billedets synsretning mangler; et præcist footprint kan ikke beregnes endnu.",
    });
  }

  const camera = compact({
    make: firstString(source, ["Make"]),
    model: firstString(source, ["Model"]),
    serial: firstString(source, ["BodySerialNumber", "SerialNumber", "DroneSerialNumber"]),
    lensMake: firstString(source, ["LensMake"]),
    lensModel: firstString(source, ["LensModel", "Lens"]),
    lensSerial: firstString(source, ["LensSerialNumber"]),
    focalLengthMm: firstNumber(source, ["FocalLength"]),
    focalLength35Mm: firstNumber(source, ["FocalLengthIn35mmFormat"]),
    widthPx: firstNumber(source, ["ExifImageWidth", "ImageWidth", "PixelXDimension"]),
    heightPx: firstNumber(source, ["ExifImageHeight", "ImageHeight", "PixelYDimension"]),
    calibratedFocalLength: firstNumber(source, ["CalibratedFocalLength"]),
    opticalCenterX: firstNumber(source, ["CalibratedOpticalCenterX"]),
    opticalCenterY: firstNumber(source, ["CalibratedOpticalCenterY"]),
    dewarpData: firstString(source, ["DewarpData"]),
  }) as DroneImageMetadata["camera"];

  if (!camera.make && !camera.model) {
    warnings.push({
      code: "CAMERA_IDENTITY_MISSING",
      message: "Kamera-/dronemodel kunne ikke aflæses.",
    });
  }

  const rtkFlag = firstScalar(source, ["RtkFlag"]);
  const rtkStdLat = firstNumber(source, ["RtkStdLat"]);
  const rtkStdLon = firstNumber(source, ["RtkStdLon"]);
  const rtkStdHeight = firstNumber(source, ["RtkStdHgt", "RtkStdHeight"]);
  const gpsDifferential = firstNumber(source, ["GPSDifferential"]);

  const hasIntrinsics =
    (camera.focalLengthMm != null || camera.calibratedFocalLength != null) &&
    camera.widthPx != null &&
    camera.heightPx != null;
  let footprintReadiness: DroneImageMetadata["footprintReadiness"] = "insufficient";
  if (position) {
    if (viewDirection == null || gimbalPitch == null) footprintReadiness = "needs_orientation";
    else if (!hasIntrinsics) footprintReadiness = "needs_intrinsics";
    else footprintReadiness = "needs_ground_elevation";
  }

  const parseErrors = raw.parseErrors ?? [];
  for (const parseError of parseErrors) {
    warnings.push({ code: "METADATA_PARSE_WARNING", message: parseError });
  }

  const status: DroneMetadataQaStatus = errors.length
    ? "blocked"
    : warnings.length
      ? "review_required"
      : "ready";

  return {
    schemaVersion: DRONE_METADATA_SCHEMA_VERSION,
    extractor: DRONE_METADATA_EXTRACTOR,
    file: { ...file, sha256 },
    raw: {
      exif: toJsonValue(exifOutput),
      xmpXml: raw.xmpXml ?? null,
      xmp: toJsonValue(xmpOutput),
      parseErrors,
    },
    capture,
    position,
    altitude: compact({
      gpsM: signedGpsAltitude,
      gpsRef: gpsAltitudeRef,
      absoluteM: absoluteAltitude,
      relativeTakeoffM: relativeAltitude,
    }),
    orientation: {
      ...compact({
        imageOrientation: firstNumber(source, ["Orientation"]),
        imageDirectionDeg: imageDirection,
        imageDirectionRef,
        drone: hasAny(droneYaw, dronePitch, droneRoll)
          ? compact({ yawDeg: droneYaw, pitchDeg: dronePitch, rollDeg: droneRoll })
          : undefined,
        gimbal: hasAny(gimbalYaw, gimbalPitch, gimbalRoll)
          ? compact({ yawDeg: gimbalYaw, pitchDeg: gimbalPitch, rollDeg: gimbalRoll })
          : undefined,
        viewDirectionDeg: viewDirection,
      }),
      reference: orientationReference,
    },
    camera,
    rtk: compact({
      flagRaw: typeof rtkFlag === "string" || typeof rtkFlag === "number" ? rtkFlag : undefined,
      stdLatRaw: rtkStdLat,
      stdLonRaw: rtkStdLon,
      stdHeightRaw: rtkStdHeight,
      gpsDifferential,
    }),
    footprintReadiness,
    qa: { status, errors, warnings },
  };
}

export function isReadyForAutomaticCameraPosition(metadata: DroneImageMetadata): boolean {
  return Boolean(
    metadata.position &&
    metadata.capture.capturedAtUtc &&
    metadata.qa.errors.length === 0 &&
    metadata.raw.parseErrors.length === 0,
  );
}

function normalisePosition(
  source: unknown,
  errors: DroneMetadataIssue[],
  warnings: DroneMetadataIssue[],
): DroneImageMetadata["position"] | undefined {
  const { complete, hasInvalidPair } = collectPositionCandidates(source);
  if (hasInvalidPair) {
    errors.push({
      code: "POSITION_INVALID",
      message: "Billedet indeholder ugyldige GPS-koordinater.",
    });
    return undefined;
  }

  const selected = complete.find((candidate) => candidate.source === "exif") ?? complete[0];
  if (!selected) {
    errors.push({
      code: "POSITION_MISSING",
      message: "Ingen gyldig kameraposition blev fundet i EXIF/XMP.",
    });
    return undefined;
  }

  const maxConflictM = maximumPairDistanceM(complete);
  if (maxConflictM > 5) {
    errors.push({
      code: "POSITION_CONFLICT",
      message: `EXIF/XMP-positioner afviger med cirka ${Math.round(maxConflictM)} m.`,
    });
  } else if (maxConflictM > 0.25) {
    warnings.push({
      code: "POSITION_VARIANTS",
      message: "Flere metadata-positioner findes og ligger inden for den automatiske tolerance.",
    });
  }

  return compact({
    latitude: selected.latitude,
    longitude: selected.longitude,
    source: selected.source,
    datum: selected.datum,
    horizontalAccuracyM: selected.horizontalAccuracyM,
    dop: selected.dop,
    differential: selected.differential,
  }) as DroneImageMetadata["position"];
}

function normaliseCaptureTime(
  source: unknown,
  errors: DroneMetadataIssue[],
  warnings: DroneMetadataIssue[],
): DroneImageMetadata["capture"] {
  const originalCandidates = collectCaptureCandidates(source);

  for (const candidate of originalCandidates) {
    const parsed = parseOffsetTimestamp(candidate.value, candidate.offset, candidate.subSeconds);
    if (parsed) {
      return {
        capturedAtUtc: parsed.capturedAtUtc,
        offset: parsed.offset,
        timezoneKnown: true,
        source: candidate.source,
      };
    }
  }

  for (const pair of collectGpsTimePairs(source)) {
    const gpsTimestamp = parseGpsTimestamp(pair.date, pair.time);
    if (gpsTimestamp) {
      return { capturedAtUtc: gpsTimestamp, timezoneKnown: true, source: "gps-utc" };
    }
  }

  const localTimestamp = originalCandidates
    .map((candidate) => normaliseLocalExifTimestamp(candidate.value, candidate.subSeconds))
    .find((value): value is string => Boolean(value));
  if (localTimestamp) {
    warnings.push({
      code: "CAPTURE_TIMEZONE_UNKNOWN",
      message: "Optagetidspunktet mangler tidszone og kan ikke kobles sikkert til en flyvelog.",
    });
    return { localTimestamp, timezoneKnown: false };
  }

  errors.push({
    code: "CAPTURE_TIME_MISSING",
    message: "Et sikkert optagetidspunkt blev ikke fundet.",
  });
  return { timezoneKnown: false };
}

function parseOffsetTimestamp(
  value: unknown,
  explicitOffset?: string,
  subSeconds?: string,
): ParsedOffsetTimestamp | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(
    /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (!match) return undefined;

  const embeddedOffset = normaliseOffset(match[8]);
  const siblingOffset = normaliseOffset(explicitOffset);
  if (embeddedOffset && siblingOffset && embeddedOffset !== siblingOffset) return undefined;
  const offset = embeddedOffset ?? siblingOffset;
  if (!offset) return undefined;

  const parts = timestampParts(match);
  if (!parts || !isValidCalendarDateTime(parts)) return undefined;
  const fraction = match[7] ?? subSeconds ?? "";
  const millis = fractionToMillis(fraction);
  const offsetMinutes = offset === "Z" ? 0 : offsetToMinutes(offset);
  if (offsetMinutes == null) return undefined;
  const epoch =
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      millis,
    ) -
    offsetMinutes * 60_000;
  return {
    capturedAtUtc: new Date(epoch).toISOString(),
    offset,
  };
}

function parseGpsTimestamp(dateValue: unknown, timeValue: unknown): string | undefined {
  if (typeof dateValue !== "string") return undefined;
  const date = dateValue.match(/^(\d{4})[:-](\d{2})[:-](\d{2})$/);
  if (!date) return undefined;

  let rawParts: unknown[] = [];
  if (Array.isArray(timeValue)) rawParts = timeValue;
  else if (ArrayBuffer.isView(timeValue))
    rawParts = Array.from(timeValue as unknown as ArrayLike<unknown>);
  else if (typeof timeValue === "string") rawParts = timeValue.split(":");
  if (rawParts.length !== 3) return undefined;
  const parsedParts = rawParts.map(numberValue);
  if (parsedParts.some((part) => part == null)) return undefined;
  const [hour, minute, second] = parsedParts as [number, number, number];
  const calendar = {
    year: Number(date[1]),
    month: Number(date[2]),
    day: Number(date[3]),
    hour,
    minute,
    second: Math.floor(second),
  };
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || second < 0 || second >= 60)
    return undefined;
  if (!isValidCalendarDateTime(calendar)) return undefined;
  const wholeSecond = Math.floor(second);
  const millis = Math.floor((second - wholeSecond) * 1000 + Number.EPSILON);
  const epoch = Date.UTC(
    calendar.year,
    calendar.month - 1,
    calendar.day,
    hour,
    minute,
    wholeSecond,
    millis,
  );
  return new Date(epoch).toISOString();
}

function normaliseLocalExifTimestamp(value: unknown, subSeconds?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(
    /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/,
  );
  if (!match) return undefined;
  const parts = timestampParts(match);
  if (!parts || !isValidCalendarDateTime(parts)) return undefined;
  const millis = normaliseFraction(match[7] ?? subSeconds ?? "");
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${millis ? `.${millis}` : ""}`;
}

function normaliseOffset(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.toUpperCase() === "Z") return "Z";
  const match = value.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return hours <= 23 && minutes <= 59 ? `${match[1]}${match[2]}:${match[3]}` : undefined;
}

function collectPositionCandidates(source: unknown): {
  complete: PositionCandidate[];
  hasInvalidPair: boolean;
} {
  const complete: PositionCandidate[] = [];
  let hasInvalidPair = false;

  visitRecords(source, (record, path) => {
    const latitude = ownNumber(record, ["latitude", "GPSLatitude", "GpsLatitude"]);
    const longitude = ownNumber(record, [
      "longitude",
      "GPSLongitude",
      "GpsLongitude",
      "GPSLongtitude",
    ]);
    if (latitude == null || longitude == null) return;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      hasInvalidPair = true;
      return;
    }

    const rtkStdLat = ownNumber(record, ["RtkStdLat"]);
    const rtkStdLon = ownNumber(record, ["RtkStdLon"]);
    const reportedAccuracy = ownNumber(record, ["GPSHPositioningError"]);
    const rtkAccuracy =
      rtkStdLat != null && rtkStdLat >= 0 && rtkStdLon != null && rtkStdLon >= 0
        ? Math.hypot(rtkStdLat, rtkStdLon)
        : undefined;
    const horizontalAccuracyM =
      rtkAccuracy ??
      (reportedAccuracy != null && reportedAccuracy >= 0 ? reportedAccuracy : undefined);

    complete.push(
      compact({
        path,
        source: path === "xmp" || path.startsWith("xmp.") ? "xmp" : "exif",
        latitude,
        longitude,
        datum: ownString(record, ["GPSMapDatum"]),
        horizontalAccuracyM,
        dop: ownNumber(record, ["GPSDOP"]),
        differential: ownNumber(record, ["GPSDifferential"]),
      }) as PositionCandidate,
    );
  });

  return { complete, hasInvalidPair };
}

function maximumPairDistanceM(candidates: PositionCandidate[]): number {
  let maximum = 0;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];
      if (!right) continue;
      maximum = Math.max(maximum, haversineDistanceM(left, right));
    }
  }
  return maximum;
}

function haversineDistanceM(
  left: Pick<PositionCandidate, "latitude" | "longitude">,
  right: Pick<PositionCandidate, "latitude" | "longitude">,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function collectCaptureCandidates(source: unknown): CaptureCandidate[] {
  const candidates: CaptureCandidate[] = [];
  visitRecords(source, (record, path) => {
    const value = ownValue(record, ["DateTimeOriginal", "CreateDate"]);
    if (value == null) return;
    candidates.push({
      path,
      value,
      offset: ownString(record, ["OffsetTimeOriginal", "OffsetTime"]),
      subSeconds: ownString(record, ["SubSecTimeOriginal", "SubSecTime"]),
      source: path === "xmp" || path.startsWith("xmp.") ? "xmp-offset" : "exif-offset",
    });
  });
  return candidates;
}

function collectGpsTimePairs(
  source: unknown,
): Array<{ path: string; date: unknown; time: unknown }> {
  const pairs: Array<{ path: string; date: unknown; time: unknown }> = [];
  visitRecords(source, (record, path) => {
    const date = ownValue(record, ["GPSDateStamp"]);
    const time = ownValue(record, ["GPSTimeStamp"]);
    if (date != null && time != null) pairs.push({ path, date, time });
  });
  return pairs;
}

function timestampParts(match: RegExpMatchArray):
  | {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second: number;
    }
  | undefined {
  const values = match.slice(1, 7).map(Number);
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return undefined;
  const [year, month, day, hour, minute, second] = values as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return { year, month, day, hour, minute, second };
}

function isValidCalendarDateTime(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): boolean {
  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.month) ||
    !Number.isInteger(parts.day) ||
    !Number.isInteger(parts.hour) ||
    !Number.isInteger(parts.minute) ||
    !Number.isInteger(parts.second) ||
    parts.year < 1000 ||
    parts.year > 9999 ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  ) {
    return false;
  }
  const leapYear = parts.year % 4 === 0 && (parts.year % 100 !== 0 || parts.year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return parts.day >= 1 && parts.day <= (daysPerMonth[parts.month - 1] ?? 0);
}

function normaliseFraction(value: string): string {
  if (!value) return "";
  if (!/^\d+$/.test(value)) return "";
  return value.slice(0, 3).padEnd(3, "0");
}

function fractionToMillis(value: string): number {
  const normalised = normaliseFraction(value);
  return normalised ? Number(normalised) : 0;
}

function offsetToMinutes(value: string): number | undefined {
  const match = value.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -magnitude : magnitude;
}

function visitRecords(
  source: unknown,
  visitor: (record: Record<string, unknown>, path: string) => void,
): void {
  const seen = new WeakSet<object>();
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value))
      return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    const record = value as Record<string, unknown>;
    visitor(record, path);
    for (const [key, child] of Object.entries(record)) {
      visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(source, "");
}

function ownValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const wantedKey of keys) {
    const wanted = normaliseKey(wantedKey);
    const entry = Object.entries(record).find(([key]) => normaliseKey(key) === wanted);
    if (entry && entry[1] != null) return entry[1];
  }
  return undefined;
}

function ownString(record: Record<string, unknown>, keys: string[]): string | undefined {
  const value = ownValue(record, keys);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ownNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  return numberValue(ownValue(record, keys));
}

function findCandidates(source: unknown, keys: string[]): Candidate[] {
  const wanted = new Set(keys.map(normaliseKey));
  const found: Candidate[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object") return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    if (Array.isArray(value) || ArrayBuffer.isView(value)) return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (wanted.has(normaliseKey(key))) found.push({ path: childPath, value: child });
      visit(child, childPath);
    }
  };

  visit(source, "");
  return found;
}

function firstScalar(source: unknown, keys: string[]): unknown {
  return findCandidates(source, keys)
    .map((candidate) => candidate.value)
    .find((value) => value != null);
}

function firstString(source: unknown, keys: string[]): string | undefined {
  const value = findCandidates(source, keys)
    .map((candidate) => candidate.value)
    .find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
  return typeof value === "string" ? value.trim() : undefined;
}

function findFirstString(source: unknown, keys: string[]): string | null {
  return firstString(source, keys) ?? null;
}

function firstNumber(source: unknown, keys: string[]): number | undefined {
  for (const candidate of findCandidates(source, keys)) {
    const value = numberValue(candidate.value);
    if (value != null) return value;
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^[+-]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : undefined;
}

function normaliseDegrees(value?: number): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const normalised = ((value % 360) + 360) % 360;
  // Modulo on negative decimal headings can introduce binary floating-point
  // noise (for example -184.4 -> 175.60000000000002). Retain more precision
  // than the source sensors provide while keeping the evidentiary value stable.
  return Math.round(normalised * 1e10) / 1e10;
}

function normaliseDirectionRef(value?: string): "T" | "M" | undefined {
  const ref = value?.trim().toUpperCase();
  if (ref === "T" || ref === "TRUE NORTH") return "T";
  if (ref === "M" || ref === "MAGNETIC NORTH") return "M";
  return undefined;
}

function normaliseKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasAny(...values: unknown[]): boolean {
  return values.some((value) => value != null);
}

function compact<T extends Record<string, unknown>>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T;
}

export function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value instanceof ArrayBuffer) return { type: "ArrayBuffer", byteLength: value.byteLength };
  if (ArrayBuffer.isView(value)) {
    return { type: value.constructor.name, byteLength: value.byteLength };
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
    const result: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child !== "function" && typeof child !== "symbol" && child !== undefined) {
        result[key] = toJsonValue(child, seen);
      }
    }
    return result;
  }
  return String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendParserOutputErrors(output: unknown, label: string, target: string[]): void {
  if (!output || typeof output !== "object" || Array.isArray(output)) return;
  const reported = (output as Record<string, unknown>)["errors"];
  if (reported == null) return;
  const values = Array.isArray(reported) ? reported : [reported];
  for (const value of values) {
    const message = `${label}: ${errorMessage(value)}`;
    if (!target.includes(message)) target.push(message);
  }
}
