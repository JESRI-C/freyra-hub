import {
  FieldPhotoUploadPayload,
  type FieldPhotoUpload,
  type FieldPhotoReceipt,
} from "@/lib/field-photo-upload";
export const projectId = "fd302000-0000-4000-8000-000000000001";
export const uploadId = "fd304000-0000-4000-8000-000000000001";
export const actorId = "fd300000-0000-4000-8000-000000000001";
export const leaseId = "fd305000-0000-4000-8000-000000000001";
export const checksum = "0682c5f2076f099c34cfdd15a9e063849ed437a49677e6fcc5b4198c76575be5";
export const payload = FieldPhotoUploadPayload.parse({
  title: "Synthetic photo",
  description: null,
  category: "field_photo",
  tags: [],
  originalName: "photo.jpg",
  sha256: checksum,
  sizeBytes: 8,
  mimeType: "image/jpeg",
  capturedAt: null,
  capture: {
    schema: "freyra.field-photo/v1",
    originalPosition: null,
    initialPosition: null,
    correctionReason: "",
  },
});
export const received: FieldPhotoUpload = {
  id: uploadId,
  project_id: projectId,
  created_by: actorId,
  created_at: "2026-10-29T10:00:00+00:00",
  storage_path: `${projectId}/field-uploads/${uploadId}/original`,
  payload,
  received_at: "2026-10-29T10:00:01+00:00",
  object_id: "fd303000-0000-4000-8000-000000000001",
  object_version: "v1",
  object_updated_at: "2026-10-29T10:00:00+00:00",
};
export const verified: FieldPhotoReceipt = {
  upload_id: uploadId,
  project_id: projectId,
  object_id: received.object_id!,
  object_version: received.object_version,
  object_updated_at: received.object_updated_at!,
  sha256: checksum,
  size_bytes: 8,
  status: "verified",
  verified_by: actorId,
  verified_at: "2026-10-29T10:00:02+00:00",
  validator_version: "stream-sha256/v1",
};
