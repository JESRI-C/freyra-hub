import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  existing: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
  payload: {} as Record<string, unknown>,
  upload: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
  fieldUpload: vi.fn(),
}));
vi.mock("../field-photo-upload-service", () => ({ uploadFieldPhoto: mocks.fieldUpload }));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.signed }),
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: async (from: number, to: number) => ({
          data: mocks.existing.slice(from, to + 1),
          error: null,
        }),
        limit: async () => ({ data: mocks.existing, error: null }),
        insert: (p: Record<string, unknown>) => {
          mocks.payload = p;
          return query;
        },
        single: async () => ({
          data: { id: "media", uploaded_at: "2026-10-26", ...mocks.payload },
          error: mocks.insertError,
        }),
      };
      return query;
    },
  },
}));
vi.mock("../monitoring/drone-ingest", () => ({
  sha256: async () => "a".repeat(64),
  readOriginalMetadata: async () => ({
    latitude: null,
    longitude: null,
    altitudeM: null,
    direction: null,
    capturedAt: null,
    qualityFlags: ["missing_gps"],
    exif: {},
  }),
}));
import { uploadProjectMedia, listProjectMedia } from "../project-media-service";
const input = () => ({
  projectId: "project",
  file: new File(["original"], "photo.jpg", { type: "image/jpeg" }),
  title: "photo",
  category: "drone_image" as const,
  source: "drone" as const,
  isReportReady: false,
  tags: [],
  flightId: "flight",
});
beforeEach(() => {
  mocks.existing = [];
  mocks.insertError = null;
  mocks.payload = {};
  mocks.fieldUpload.mockReset().mockImplementation(async (input) => {
    mocks.payload = {
      project_id: input.projectId,
      file_path: `${input.projectId}/synthetic.jpg`,
      storage_bucket: "project-media",
      lat: null,
      lng: null,
      metadata: {
        original_name: input.payload.originalName,
        original_sha256: input.payload.sha256,
        field_photo_capture: input.payload.capture,
      },
    };
    return { upload: { id: "media" }, receipt: { status: "verified" } };
  });
  mocks.upload.mockReset().mockResolvedValue({ error: null });
  mocks.remove.mockReset();
  mocks.signed
    .mockReset()
    .mockResolvedValue({ data: { signedUrl: "private-signed-url" }, error: null });
});
describe("private original persistence", () => {
  it("requires a reason before uploading a manually positioned field photo", async () => {
    const result = await uploadProjectMedia({
      ...input(),
      category: "field_photo",
      source: "field_upload",
      coordinates: { lat: 55, lng: 10 },
    });
    expect(result.error).toContain("begrundelse");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("preserves missing original GPS while retaining the proposed manual point", async () => {
    await uploadProjectMedia({
      ...input(),
      category: "field_photo",
      source: "field_upload",
      coordinates: { lat: 55, lng: 10 },
      positionCorrectionReason: "Manual field location",
    });
    expect(mocks.payload.lat).toBeNull();
    expect(mocks.payload.lng).toBeNull();
    expect(mocks.payload.metadata).toMatchObject({
      field_photo_capture: {
        originalPosition: null,
        initialPosition: { lat: 55, lng: 10 },
        correctionReason: "Manual field location",
      },
    });
    expect(mocks.fieldUpload.mock.calls[0][0].file.name).toBe("photo.jpg");
  });
  it("preserves the exact original filename and checksum for ordinary field uploads", async () => {
    const original = {
      ...input(),
      category: "field_photo" as const,
      source: "field_upload" as const,
    };
    const result = await uploadProjectMedia(original);
    expect(mocks.payload.sha256).toBeUndefined();
    expect(mocks.payload.metadata).toMatchObject({
      original_name: "photo.jpg",
      original_sha256: "a".repeat(64),
      field_photo_capture: {
        schema: "freyra.field-photo/v1",
        originalPosition: null,
        initialPosition: null,
        correctionReason: "",
      },
    });
    expect(result.data?.sha256).toBe("a".repeat(64));
    expect(result.data?.metadata?.original_name).toBe("photo.jpg");
    expect(mocks.fieldUpload.mock.calls[0][0].file).toBe(original.file);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(result.fieldPhotoReceipt?.status).toBe("verified");
  });
  it("stores untouched file privately, no centroid or fabricated GPS", async () => {
    const original = input();
    const result = await uploadProjectMedia(original);
    expect(mocks.upload.mock.calls[0][1]).toBe(original.file);
    expect(mocks.upload.mock.calls[0][2].upsert).toBe(false);
    expect(mocks.payload.lat).toBeNull();
    expect(mocks.payload.lng).toBeNull();
    expect(mocks.payload.storage_bucket).toBe("project-originals");
    expect(mocks.payload.url).toBe("");
    expect(result.data?.url).toBe("private-signed-url");
  });
  it("deduplicates before uploading bytes", async () => {
    mocks.existing = [
      {
        id: "existing",
        project_id: "project",
        title: "photo",
        storage_bucket: "project-originals",
        file_path: `project/flight/${"a".repeat(64)}`,
        upload_scope: "flight",
        sha256: "a".repeat(64),
      },
    ];
    const result = await uploadProjectMedia(input());
    expect(result.duplicate).toBe(true);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("preserves bytes on metadata failure so a retry can finish", async () => {
    mocks.insertError = { message: "database unavailable" };
    expect((await uploadProjectMedia(input())).error).toBe("database unavailable");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("resumes metadata after storage already succeeded", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "The resource already exists" } });
    expect((await uploadProjectMedia(input())).error).toBeNull();
  });
});

it("lists all originals beyond a database page boundary", async () => {
  mocks.existing = Array.from({ length: 501 }, (_, i) => ({
    id: String(i),
    project_id: "project",
    title: `photo-${i}`,
    storage_bucket: "project-originals",
    upload_scope: "flight",
    sha256: i.toString(16).padStart(64, "0"),
    file_path: `project/flight/${i.toString(16).padStart(64, "0")}`,
    url: "",
    uploaded_at: "2026-10-26",
  }));
  const result = await listProjectMedia("project");
  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(501);
});
