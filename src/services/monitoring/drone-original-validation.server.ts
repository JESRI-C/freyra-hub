import { z } from "zod";
import {
  extractDroneImageMetadata,
  isReadyForAutomaticCameraPosition,
  type DroneImageMetadata,
} from "./drone-image-metadata";

export const ORIGINAL_VALIDATION_SCHEMA = "gofreyra.drone-original-validation/v1" as const;
export const ORIGINAL_VALIDATOR_VERSION = "jpeg-structure-exifr/v1" as const;
export const MAX_ORIGINAL_JPEG_BYTES = 32 * 1024 * 1024;
export const MAX_ORIGINAL_VALIDATION_BYTES = 1024 * 1024;
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);

const UploadSchema = z.object({
  id: Uuid,
  project_id: Uuid,
  uploaded_by: Uuid,
  file_name: z.string().min(1).max(180),
  original_file_name: z.string().min(1).max(255),
  file_size: z.number().int().positive().max(MAX_ORIGINAL_JPEG_BYTES),
  mime_type: z.literal("image/jpeg"),
  upload_type: z.literal("drone_photo"),
  storage_path: z.string().min(1),
  intent_request_id: Uuid,
  received_at: z.string().datetime({ offset: true }),
  status: z.enum(["awaiting_validation", "validating", "rejected"]),
});
export type CanonicalDroneUpload = z.infer<typeof UploadSchema>;
const ObjectSchema = z.object({
  id: Uuid,
  version: z.string().nullable(),
  updated_at: z.string().datetime({ offset: true }),
  owner_id: Uuid,
  size: z.number().int().positive().max(MAX_ORIGINAL_JPEG_BYTES),
  mimetype: z.literal("image/jpeg"),
});
export type OriginalStorageBinding = z.infer<typeof ObjectSchema>;

export interface JpegStructure {
  widthPx: number;
  heightPx: number;
  components: number;
  encoding: "baseline" | "progressive";
  scans: number;
}
export interface OriginalValidationIssue {
  code: string;
  message: string;
}
export interface DroneOriginalValidation {
  schema: typeof ORIGINAL_VALIDATION_SCHEMA;
  validatorVersion: typeof ORIGINAL_VALIDATOR_VERSION;
  uploadId: string;
  projectId: string;
  validatedAt: string;
  validatedBy: string;
  original: {
    sha256: string;
    sizeBytes: number;
    mimeType: "image/jpeg";
    storagePath: string;
    receivedAt: string;
    object: OriginalStorageBinding;
  };
  status: "raw_original_validated" | "review_required" | "rejected";
  jpegStructure: JpegStructure | null;
  metadata: DroneImageMetadata | null;
  cameraPositionEligible: boolean;
  pixelDecoded: false;
  georeferenced: false;
  reportEligible: false;
  errors: OriginalValidationIssue[];
  warnings: OriginalValidationIssue[];
}

export interface PreparedDroneOriginal {
  upload: CanonicalDroneUpload;
  object: OriginalStorageBinding;
  existing: DroneOriginalValidation | null;
  existingSha256: string | null;
}

export function assertCanonicalDroneOriginal(
  value: unknown,
  projectId: string,
  uploadId: string,
): CanonicalDroneUpload {
  const upload = UploadSchema.parse(value);
  const expected = `${upload.uploaded_by}/intents/${upload.id}/${upload.file_name}`;
  if (
    upload.project_id !== projectId ||
    upload.id !== uploadId ||
    upload.storage_path !== expected ||
    !/^[a-zA-Z0-9._-]+$/.test(upload.file_name) ||
    !/\.jpe?g$/i.test(upload.file_name)
  ) {
    throw new Error("Originalfilen matcher ikke projektets færdigmodtagne upload-intent.");
  }
  return upload;
}

interface MpfImageSpan {
  offset: number;
  size: number;
}
/** CIPA DC-007 MP Index: TIFF byte order, B000 version, B001 image count,
 * B002 array of 16-byte MP entries. Offsets of secondary images are relative
 * to the TIFF header, as in Pillow's JpegImagePlugin/MpoImagePlugin readers. */
function readMpfImageSpans(bytes: Uint8Array, start: number, end: number): MpfImageSpan[] {
  const fail = (): never => {
    throw new Error("MPF-indekset er ugyldigt eller ikke understøttet.");
  };
  const base = start + 4;
  if (end - base < 8) fail();
  const little = bytes[base] === 0x49 && bytes[base + 1] === 0x49;
  if (!little && !(bytes[base] === 0x4d && bytes[base + 1] === 0x4d)) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset + base, end - base);
  const u16 = (at: number) => {
    if (at < 0 || at + 2 > view.byteLength) fail();
    return view.getUint16(at, little);
  };
  const u32 = (at: number) => {
    if (at < 0 || at + 4 > view.byteLength) fail();
    return view.getUint32(at, little);
  };
  if (u16(2) !== 42) fail();
  const ifd = u32(4),
    count = u16(ifd),
    ifdEnd = ifd + 2 + count * 12 + 4;
  if (ifd < 8 || ifd % 2 || count < 3 || count > 64 || ifdEnd > view.byteLength) fail();
  let imageCount = 0,
    tableOffset = -1,
    tableBytes = 0,
    hasVersion = false;
  const tags = new Set<number>();
  for (let index = 0; index < count; index++) {
    const at = ifd + 2 + index * 12,
      tag = u16(at),
      type = u16(at + 2),
      values = u32(at + 4);
    if (tags.has(tag)) fail();
    tags.add(tag);
    if (tag === 0xb000) {
      if (
        type !== 7 ||
        values !== 4 ||
        bytes[base + at + 8] !== 0x30 ||
        bytes[base + at + 9] !== 0x31 ||
        bytes[base + at + 10] !== 0x30 ||
        bytes[base + at + 11] !== 0x30
      )
        fail();
      hasVersion = true;
    } else if (tag === 0xb001) {
      if (type !== 4 || values !== 1) fail();
      imageCount = u32(at + 8);
    } else if (tag === 0xb002) {
      if (type !== 7) fail();
      tableBytes = values;
      tableOffset = u32(at + 8);
    }
  }
  if (
    !hasVersion ||
    imageCount < 2 ||
    imageCount > 8 ||
    tableBytes !== imageCount * 16 ||
    tableOffset < ifdEnd ||
    tableOffset + tableBytes > view.byteLength
  )
    fail();
  const spans: MpfImageSpan[] = [];
  for (let index = 0; index < imageCount; index++) {
    const at = tableOffset + index * 16,
      attributes = u32(at),
      size = u32(at + 4),
      relative = u32(at + 8);
    if (
      ((attributes >>> 24) & 7) !== 0 ||
      size < 20 ||
      u16(at + 12) > imageCount ||
      u16(at + 14) > imageCount ||
      (index === 0 ? relative !== 0 : relative === 0)
    )
      fail();
    spans.push({ offset: index === 0 ? 0 : base + relative, size });
  }
  return spans;
}

/** Validate JPEG framing, bounded dimensions and scan structure; this is not a pixel decoder.
 * A bounded MPO may contain explicitly indexed secondary JPEGs. All bytes must
 * belong to contiguous, individually valid JPEG images; arbitrary trailers fail. */
export function validateJpegStructure(
  bytes: Uint8Array,
  warnings: OriginalValidationIssue[] = [],
): JpegStructure {
  return validateJpegImage(bytes, warnings, true, { markers: 0, metadataBytes: 0 });
}
function validateJpegImage(
  bytes: Uint8Array,
  warnings: OriginalValidationIssue[],
  allowMpf: boolean,
  budget: { markers: number; metadataBytes: number },
): JpegStructure {
  const fail = (): never => {
    throw new Error("Originalfilen er ikke en komplet understøttet JPEG-container.");
  };
  if (
    bytes.length < 20 ||
    bytes.length > MAX_ORIGINAL_JPEG_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  )
    fail();
  let offset = 2,
    entropyBytes = 0;
  let frame: Omit<JpegStructure, "scans"> | null = null;
  let scans = 0;
  const componentIds = new Set<number>();
  const quantTables = new Set<number>();
  const quantNeeded = new Set<number>();
  const huffmanTables = new Set<number>();
  const mpfSegments: { start: number; end: number }[] = [];
  while (offset < bytes.length) {
    if (++budget.markers > 4096 || bytes[offset++] !== 0xff) fail();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!frame || !scans || !entropyBytes || [...quantNeeded].some((id) => !quantTables.has(id)))
        fail();
      if (offset !== bytes.length) {
        if (!allowMpf || mpfSegments.length !== 1) fail();
        const segment = mpfSegments[0],
          spans = readMpfImageSpans(bytes, segment.start, segment.end);
        // DJI MPOs can retain an outdated primary size after metadata grows.
        // That advisory value never authorizes bytes: the parsed EOI and exact
        // secondary offsets/sizes must account for the entire file instead.
        if (spans[0].size > offset) fail();
        let consumed = offset;
        for (const span of spans.slice(1)) {
          if (span.offset !== consumed || span.offset + span.size > bytes.length) fail();
          validateJpegImage(
            bytes.subarray(span.offset, span.offset + span.size),
            warnings,
            false,
            budget,
          );
          consumed += span.size;
        }
        if (consumed !== bytes.length) fail();
        if (spans[0].size !== offset)
          warnings.push({
            code: "MPF_PRIMARY_SIZE_ADVISORY",
            message:
              "MPF-indeksets primære størrelsesfelt afviger fra den fuldt parsede JPEG-grænse. Alle sekundære JPEG-billeder og deres eksakte offset/længder er strukturelt kontrolleret; pixels er ikke dekodet.",
          });
      }
      return { ...frame!, scans };
    }
    if (marker === 0xd8 || marker === 0x00 || marker == null || (marker >= 0xd0 && marker <= 0xd7))
      fail();
    if (marker === 0x01) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    const start = offset + 2,
      end = offset + length;
    if (length < 2 || end > bytes.length) fail();
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      budget.metadataBytes += length;
      if (budget.metadataBytes > MAX_ORIGINAL_VALIDATION_BYTES)
        throw new Error("JPEG-metadata overskrider 1 MiB.");
      if (
        marker === 0xe2 &&
        bytes[start] === 0x4d &&
        bytes[start + 1] === 0x50 &&
        bytes[start + 2] === 0x46 &&
        bytes[start + 3] === 0
      )
        mpfSegments.push({ start, end });
    }
    if (marker === 0xdb) {
      let position = start;
      while (position < end) {
        const table = bytes[position++],
          precision = table >> 4,
          id = table & 15;
        if (precision > 1 || id > 3) fail();
        position += precision === 0 ? 64 : 128;
        if (position > end) fail();
        quantTables.add(id);
      }
      if (position === start) fail();
    } else if (marker === 0xc4) {
      let position = start;
      while (position < end) {
        const table = bytes[position++];
        if (table >> 4 > 1 || (table & 15) > 3 || position + 16 > end) fail();
        let count = 0;
        let availableCodes = 1;
        for (let index = 0; index < 16; index++) {
          const symbols = bytes[position++];
          availableCodes = availableCodes * 2 - symbols;
          if (availableCodes < 0) fail();
          count += symbols;
        }
        if (!count || count > 256 || position + count > end) fail();
        position += count;
        huffmanTables.add(table);
      }
      if (position === start) fail();
    } else if (marker === 0xc0 || marker === 0xc2) {
      const height = (bytes[start + 1] << 8) | bytes[start + 2];
      const width = (bytes[start + 3] << 8) | bytes[start + 4];
      const count = bytes[start + 5];
      if (
        frame ||
        bytes[start] !== 8 ||
        !width ||
        !height ||
        width * height > 100_000_000 ||
        ![1, 3].includes(count) ||
        length !== 8 + count * 3
      )
        fail();
      for (let index = 0; index < count; index++) {
        const position = start + 6 + index * 3,
          id = bytes[position],
          sampling = bytes[position + 1];
        if (
          componentIds.has(id) ||
          sampling >> 4 < 1 ||
          sampling >> 4 > 4 ||
          (sampling & 15) < 1 ||
          (sampling & 15) > 4 ||
          bytes[position + 2] > 3
        )
          fail();
        componentIds.add(id);
        quantNeeded.add(bytes[position + 2]);
      }
      frame = {
        widthPx: width,
        heightPx: height,
        components: count,
        encoding: marker === 0xc0 ? "baseline" : "progressive",
      };
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) fail();
    else if (marker === 0xda) {
      const count = bytes[start],
        scanIds = new Set<number>();
      const spectralStart = bytes[end - 3],
        spectralEnd = bytes[end - 2],
        approximation = bytes[end - 1];
      if (
        !frame ||
        !count ||
        count > frame.components ||
        length !== 6 + 2 * count ||
        spectralStart > spectralEnd ||
        spectralEnd > 63 ||
        approximation >> 4 > 13 ||
        (approximation & 15) > 13 ||
        (frame.encoding === "baseline" &&
          (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0)) ||
        (frame.encoding === "progressive" &&
          ((spectralStart === 0 && spectralEnd !== 0) || (spectralStart > 0 && count !== 1)))
      )
        fail();
      for (let index = 0; index < count; index++) {
        const id = bytes[start + 1 + index * 2],
          tables = bytes[start + 2 + index * 2];
        if (
          !componentIds.has(id) ||
          scanIds.has(id) ||
          tables >> 4 > 3 ||
          (tables & 15) > 3 ||
          (spectralStart === 0 && approximation >> 4 === 0 && !huffmanTables.has(tables >> 4)) ||
          (spectralEnd > 0 && !huffmanTables.has(0x10 | (tables & 15)))
        )
          fail();
        scanIds.add(id);
      }
      scans++;
      offset = end;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          entropyBytes++;
          offset++;
          continue;
        }
        const next = bytes[offset + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          entropyBytes++;
          offset += 2;
          continue;
        }
        break;
      }
      continue;
    }
    offset = end;
  }
  return fail();
}

function canonicalJson(value: unknown): string {
  const json = z.json().parse(value);
  if (json === null || typeof json !== "object") return JSON.stringify(json);
  if (Array.isArray(json)) return `[${json.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(json)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(json[key])}`)
    .join(",")}}`;
}
export async function originalValidationSha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  return hashBytes(bytes);
}
async function hashBytes(bytes: Uint8Array): Promise<string> {
  const buffer = exactArrayBuffer(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer;
  if (
    buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === buffer.byteLength
  )
    return buffer;
  return new Uint8Array(bytes).buffer;
}

export async function parsePreparedDroneOriginal(
  value: unknown,
  projectId: string,
  uploadId: string,
): Promise<PreparedDroneOriginal> {
  const parsed = z
    .object({
      upload: z.unknown(),
      object: ObjectSchema,
      existing: z.unknown().nullable(),
      existing_sha256: Hash.nullable(),
    })
    .parse(value);
  const upload = assertCanonicalDroneOriginal(parsed.upload, projectId, uploadId);
  if (parsed.object.owner_id !== upload.uploaded_by || parsed.object.size !== upload.file_size) {
    throw new Error("Storage-originalen matcher ikke upload-intentets ejer og størrelse.");
  }
  const existing =
    parsed.existing === null
      ? null
      : await parseStoredDroneOriginalValidation(parsed.existing, parsed.existing_sha256, upload);
  if (existing && canonicalJson(existing.original.object) !== canonicalJson(parsed.object)) {
    throw new Error("Originalfilens Storage-version er ændret siden valideringen.");
  }
  return { upload, object: parsed.object, existing, existingSha256: parsed.existing_sha256 };
}

const MetadataSchema = z
  .object({
    schemaVersion: z.literal("drone-image-metadata/v1"),
    extractor: z.literal("exifr@7.1.3"),
    file: z
      .object({
        name: z.string(),
        sizeBytes: z.number().int().positive(),
        mimeType: z.literal("image/jpeg"),
        lastModified: z.literal(0),
        sha256: Hash,
      })
      .strict(),
    raw: z
      .object({
        exif: z.json(),
        xmp: z.json(),
        xmpXml: z.string().nullable(),
        parseErrors: z.array(z.string()),
      })
      .strict(),
    capture: z
      .object({
        capturedAtUtc: z.string().datetime({ offset: true }).optional(),
        localTimestamp: z.string().optional(),
        offset: z.string().optional(),
        timezoneKnown: z.boolean(),
        source: z.enum(["exif-offset", "gps-utc", "xmp-offset"]).optional(),
      })
      .strict(),
    position: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
        source: z.enum(["exif", "xmp"]),
      })
      .catchall(z.json())
      .optional(),
    altitude: z.record(z.string(), z.json()),
    orientation: z.record(z.string(), z.json()),
    camera: z.record(z.string(), z.json()),
    rtk: z.record(z.string(), z.json()),
    footprintReadiness: z.enum([
      "ready",
      "needs_ground_elevation",
      "needs_intrinsics",
      "needs_orientation",
      "insufficient",
    ]),
    qa: z
      .object({
        status: z.enum(["ready", "review_required", "blocked"]),
        errors: z.array(z.object({ code: z.string(), message: z.string() })),
        warnings: z.array(z.object({ code: z.string(), message: z.string() })),
      })
      .strict(),
  })
  .strict();

const ResultSchema = z
  .object({
    schema: z.literal(ORIGINAL_VALIDATION_SCHEMA),
    validatorVersion: z.literal(ORIGINAL_VALIDATOR_VERSION),
    uploadId: Uuid,
    projectId: Uuid,
    validatedAt: z.string().datetime({ offset: true }),
    validatedBy: Uuid,
    original: z.object({
      sha256: Hash,
      sizeBytes: z.number().int().positive().max(MAX_ORIGINAL_JPEG_BYTES),
      mimeType: z.literal("image/jpeg"),
      storagePath: z.string(),
      receivedAt: z.string(),
      object: ObjectSchema,
    }),
    status: z.enum(["raw_original_validated", "review_required", "rejected"]),
    jpegStructure: z
      .object({
        widthPx: z.number().int().positive(),
        heightPx: z.number().int().positive(),
        components: z.number().int(),
        encoding: z.enum(["baseline", "progressive"]),
        scans: z.number().int().positive(),
      })
      .nullable(),
    metadata: MetadataSchema.nullable(),
    cameraPositionEligible: z.boolean(),
    pixelDecoded: z.literal(false),
    georeferenced: z.literal(false),
    reportEligible: z.literal(false),
    errors: z.array(z.object({ code: z.string(), message: z.string() })),
    warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  })
  .strict();

export async function parseStoredDroneOriginalValidation(
  value: unknown,
  checksum: string | null,
  upload: Pick<
    CanonicalDroneUpload,
    | "id"
    | "project_id"
    | "storage_path"
    | "file_size"
    | "uploaded_by"
    | "received_at"
    | "original_file_name"
  >,
): Promise<DroneOriginalValidation> {
  if (
    !checksum ||
    new TextEncoder().encode(canonicalJson(value)).byteLength > MAX_ORIGINAL_VALIDATION_BYTES ||
    (await originalValidationSha256(value)) !== checksum
  )
    throw new Error("Originalvalideringens checksum er ugyldig.");
  const result = ResultSchema.parse(value) as DroneOriginalValidation;
  if (
    result.uploadId !== upload.id ||
    result.projectId !== upload.project_id ||
    result.original.storagePath !== upload.storage_path ||
    result.original.receivedAt !== upload.received_at ||
    result.original.sizeBytes !== upload.file_size ||
    result.original.object.owner_id !== upload.uploaded_by ||
    result.original.object.size !== upload.file_size ||
    (result.status === "rejected" &&
      (result.jpegStructure !== null ||
        result.metadata !== null ||
        result.cameraPositionEligible)) ||
    (result.status !== "rejected" && result.jpegStructure === null) ||
    (result.cameraPositionEligible && (!result.metadata || result.errors.length > 0)) ||
    (result.status === "raw_original_validated" &&
      (!result.cameraPositionEligible || result.metadata?.qa.status !== "ready"))
  )
    throw new Error("Originalvalideringen matcher ikke den kanoniske upload.");
  if (
    result.metadata &&
    (result.metadata.file.sha256 !== result.original.sha256 ||
      result.metadata.file.sizeBytes !== upload.file_size ||
      result.metadata.file.name !== upload.original_file_name ||
      result.metadata.file.mimeType !== "image/jpeg" ||
      (result.cameraPositionEligible &&
        (!isReadyForAutomaticCameraPosition(result.metadata) ||
          !result.metadata.capture.timezoneKnown)))
  ) {
    throw new Error("Serverens billedmetadata matcher ikke originalfilen.");
  }
  return result;
}

export async function validateDroneOriginalBytes(
  upload: CanonicalDroneUpload,
  object: OriginalStorageBinding,
  bytes: Uint8Array,
  actorId: string,
  dependencies: { extract?: typeof extractDroneImageMetadata; now?: () => string } = {},
): Promise<DroneOriginalValidation> {
  if (bytes.byteLength !== upload.file_size || bytes.byteLength > MAX_ORIGINAL_JPEG_BYTES)
    throw new Error("De modtagne originalbytes matcher ikke filstørrelsen.");
  const sha256 = await hashBytes(bytes);
  const warnings: OriginalValidationIssue[] = [
    {
      code: "RAW_ORIGINAL_ONLY",
      message:
        "JPEG-struktur og metadata er kontrolleret. Pixels er ikke dekodet, og kamera-position er ikke et georefereret footprint eller faglig godkendelse.",
    },
  ];
  const errors: OriginalValidationIssue[] = [];
  let jpegStructure: JpegStructure | null = null;
  let metadata: DroneImageMetadata | null = null;
  try {
    jpegStructure = validateJpegStructure(bytes, warnings);
  } catch (error) {
    errors.push({
      code: "JPEG_STRUCTURE_INVALID",
      message: error instanceof Error ? error.message : "JPEG-strukturen kunne ikke valideres.",
    });
  }
  if (jpegStructure) {
    const file = new File([exactArrayBuffer(bytes)], upload.original_file_name, {
      type: "image/jpeg",
      lastModified: 0,
    });
    metadata = await (dependencies.extract ?? extractDroneImageMetadata)(file);
    if (metadata.file.sha256 !== sha256)
      throw new Error("Metadataekstraktionen matcher ikke originalens SHA-256.");
    if (
      (metadata.camera.widthPx != null && metadata.camera.widthPx !== jpegStructure.widthPx) ||
      (metadata.camera.heightPx != null && metadata.camera.heightPx !== jpegStructure.heightPx)
    ) {
      errors.push({
        code: "DIMENSIONS_CONFLICT",
        message: "EXIF-dimensionerne matcher ikke JPEG-billedrammen; kræver gennemgang.",
      });
    }
  }
  const cameraPositionEligible = Boolean(
    metadata &&
    !errors.length &&
    metadata.capture.timezoneKnown &&
    isReadyForAutomaticCameraPosition(metadata),
  );
  const result: DroneOriginalValidation = {
    schema: ORIGINAL_VALIDATION_SCHEMA,
    validatorVersion: ORIGINAL_VALIDATOR_VERSION,
    uploadId: upload.id,
    projectId: upload.project_id,
    validatedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
    validatedBy: Uuid.parse(actorId),
    original: {
      sha256,
      sizeBytes: bytes.byteLength,
      mimeType: "image/jpeg",
      storagePath: upload.storage_path,
      receivedAt: upload.received_at,
      object,
    },
    status: !jpegStructure
      ? "rejected"
      : cameraPositionEligible && metadata?.qa.status === "ready"
        ? "raw_original_validated"
        : "review_required",
    jpegStructure,
    metadata,
    cameraPositionEligible,
    pixelDecoded: false,
    georeferenced: false,
    reportEligible: false,
    errors,
    warnings,
  };
  // Optional EXIF/XMP members are absent rather than fabricated JSON nulls.
  const json = JSON.parse(JSON.stringify(result));
  return parseStoredDroneOriginalValidation(json, await originalValidationSha256(json), upload);
}
