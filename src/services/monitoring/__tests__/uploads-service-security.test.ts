import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbFrom: vi.fn(),
  storageFrom: vi.fn(),
  authGetUser: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: mocks.dbFrom,
    auth: { getUser: mocks.authGetUser },
    storage: { from: mocks.storageFrom },
  },
}));

vi.mock("@/services/monitoring/audit-service", () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

import {
  createSignedUrl,
  deleteUpload,
  SIGNED_UPLOAD_URL_TTL_SECONDS,
  uploadFile,
  UPLOAD_BUCKET,
} from "@/services/monitoring/uploads-service";

const UPLOAD_ID = "a5000000-0000-4000-8000-000000000001";
const USER_ID = "a1000000-0000-4000-8000-000000000001";
const STORAGE_PATH = `${USER_ID}/staging/drone.tif`;

const uploadRow = {
  id: UPLOAD_ID,
  organization_id: null,
  project_id: "a2000000-0000-4000-8000-000000000001",
  zone_id: null,
  uploaded_by: USER_ID,
  file_name: "drone.tif",
  original_file_name: "drone.tif",
  mime_type: "image/tiff",
  file_size: 1024,
  storage_path: STORAGE_PATH,
  upload_type: "orthophoto",
  status: "ready",
  detected_metadata: {},
  user_metadata: {},
  validation_result: {},
  import_result: {},
  source_reference: null,
  created_at: "2026-08-31T10:00:00.000Z",
  updated_at: "2026-08-31T10:00:00.000Z",
};

function getQuery(result = { data: uploadRow, error: null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function deleteQuery(result: { data: { id: string } | null; error: { message: string } | null }) {
  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  };
  query.delete.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function insertQuery(result: { data: typeof uploadRow | null; error: { message: string } | null }) {
  const query = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  };
  query.insert.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbFrom.mockReset();
  mocks.storageFrom.mockReset();
  mocks.authGetUser.mockReset();
  mocks.upload.mockReset();
  mocks.remove.mockReset();
  mocks.createSignedUrl.mockReset();
  mocks.logAuditEvent.mockReset();
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload,
    remove: mocks.remove,
    createSignedUrl: mocks.createSignedUrl,
  });
  mocks.authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mocks.upload.mockResolvedValue({ data: { path: STORAGE_PATH }, error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.example/short-lived" },
    error: null,
  });
  mocks.logAuditEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("monitoring upload creation", () => {
  it("reports a failed orphan cleanup instead of hiding it", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_000);
    const insertion = insertQuery({
      data: null,
      error: { message: "Upload metadata insert denied" },
    });
    mocks.dbFrom.mockReturnValue(insertion);
    mocks.remove.mockResolvedValue({
      data: null,
      error: { message: "Storage cleanup denied" },
    });
    const file = {
      name: "drone.tif",
      size: 1024,
      type: "image/tiff",
    } as File;

    await expect(
      uploadFile({
        file,
        projectId: uploadRow.project_id,
        userMetadata: { client_preview: { gps: "untrusted" } },
      }),
    ).rejects.toThrow(
      `Uploadmetadata kunne ikke gemmes (Upload metadata insert denied), og Storage-oprydning fejlede for ${USER_ID}/1777777777000-drone.tif: Storage cleanup denied`,
    );

    expect(mocks.remove).toHaveBeenCalledWith([`${USER_ID}/1777777777000-drone.tif`]);
    expect(insertion.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_metadata: { client_preview: { gps: "untrusted" } },
      }),
    );
    expect(insertion.insert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        status: expect.anything(),
        detected_metadata: expect.anything(),
        validation_result: expect.anything(),
        import_result: expect.anything(),
      }),
    );
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("issues monitoring download links with a fixed five-minute lifetime", async () => {
    await expect(createSignedUrl(STORAGE_PATH)).resolves.toBe(
      "https://storage.example/short-lived",
    );

    expect(SIGNED_UPLOAD_URL_TTL_SECONDS).toBe(300);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(STORAGE_PATH, 300);
  });
});

describe("monitoring upload deletion", () => {
  it("stops before metadata deletion when Storage refuses the delete", async () => {
    const get = getQuery();
    const deletion = deleteQuery({ data: { id: UPLOAD_ID }, error: null });
    mocks.dbFrom.mockReturnValueOnce(get).mockReturnValueOnce(deletion);
    mocks.remove.mockResolvedValue({
      data: null,
      error: { message: "Storage RLS denied deletion" },
    });

    await expect(deleteUpload(UPLOAD_ID)).rejects.toMatchObject({
      message: "Storage RLS denied deletion",
    });

    expect(mocks.storageFrom).toHaveBeenCalledWith(UPLOAD_BUCKET);
    expect(mocks.remove).toHaveBeenCalledWith([STORAGE_PATH]);
    expect(deletion.delete).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("verifies that RLS actually deleted one metadata row", async () => {
    const get = getQuery();
    const deletion = deleteQuery({
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned" },
    });
    mocks.dbFrom.mockReturnValueOnce(get).mockReturnValueOnce(deletion);

    await expect(deleteUpload(UPLOAD_ID)).rejects.toMatchObject({
      message: "JSON object requested, multiple (or no) rows returned",
    });

    expect(deletion.select).toHaveBeenCalledWith("id");
    expect(deletion.single).toHaveBeenCalledOnce();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("deletes the authorized object and matching row before auditing", async () => {
    const get = getQuery();
    const deletion = deleteQuery({ data: { id: UPLOAD_ID }, error: null });
    mocks.dbFrom.mockReturnValueOnce(get).mockReturnValueOnce(deletion);

    await expect(deleteUpload(UPLOAD_ID)).resolves.toBeUndefined();

    expect(mocks.remove).toHaveBeenCalledWith([STORAGE_PATH]);
    expect(deletion.eq).toHaveBeenCalledWith("id", UPLOAD_ID);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "upload_deleted",
        entityId: UPLOAD_ID,
      }),
    );
  });
});
