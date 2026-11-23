import type {
  CanonicalDroneUpload,
  OriginalStorageBinding,
} from "../drone-original-validation.server";

export const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
export const UPLOAD_ID = "20000000-0000-4000-8000-000000000001";
export const ACTOR_ID = "30000000-0000-4000-8000-000000000001";
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 255,
  ...payload,
];

/** A minimal 1x1 baseline grayscale JPEG: DC zero + EOB + padding bits. */
export function originalJpeg(width = 1, height = 1): Uint8Array {
  const counts = [1, ...Array<number>(15).fill(0)];
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xdb, [0, ...Array<number>(64).fill(1)]),
    ...segment(0xc0, [8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, ...counts, 0, 0x10, ...counts, 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    0x3f,
    0xff,
    0xd9,
  ]);
}

export function canonicalUpload(bytes: Uint8Array = originalJpeg()): CanonicalDroneUpload {
  return {
    id: UPLOAD_ID,
    project_id: PROJECT_ID,
    uploaded_by: ACTOR_ID,
    file_name: "DJI_0001.JPG",
    original_file_name: "DJI_0001.JPG",
    file_size: bytes.byteLength,
    mime_type: "image/jpeg",
    upload_type: "drone_photo",
    storage_path: `${ACTOR_ID}/intents/${UPLOAD_ID}/DJI_0001.JPG`,
    intent_request_id: "40000000-0000-4000-8000-000000000001",
    received_at: "2026-10-13T10:00:00.000Z",
    status: "awaiting_validation",
  };
}
export function storageObject(bytes: Uint8Array = originalJpeg()): OriginalStorageBinding {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    version: "version-1",
    updated_at: "2026-10-13T10:00:00.000Z",
    owner_id: ACTOR_ID,
    size: bytes.byteLength,
    mimetype: "image/jpeg",
  };
}
