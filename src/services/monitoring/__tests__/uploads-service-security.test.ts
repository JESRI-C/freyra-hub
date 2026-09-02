import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbFrom: vi.fn(),
  storageFrom: vi.fn(),
  authGetSession: vi.fn(),
  rpc: vi.fn(),
  uploadWithTus: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: mocks.dbFrom,
    auth: { getSession: mocks.authGetSession },
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  },
  requireSupabaseUrl: () => "https://project-ref.supabase.co",
}));

vi.mock("@/services/monitoring/resumable-upload-service", () => ({
  uploadWithTus: mocks.uploadWithTus,
}));

vi.mock("@/services/monitoring/audit-service", () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

import {
  createSignedUrl,
  deleteUpload,
  SIGNED_UPLOAD_URL_TTL_SECONDS,
  uploadFile,
  UploadTransferError,
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
  mocks.authGetSession.mockReset();
  mocks.rpc.mockReset();
  mocks.uploadWithTus.mockReset();
  mocks.remove.mockReset();
  mocks.createSignedUrl.mockReset();
  mocks.logAuditEvent.mockReset();
  mocks.storageFrom.mockReturnValue({
    remove: mocks.remove,
    createSignedUrl: mocks.createSignedUrl,
  });
  mocks.authGetSession.mockResolvedValue({
    data: { session: { access_token: "user-access-token" } },
    error: null,
  });
  mocks.uploadWithTus.mockResolvedValue(undefined);
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
  it("creates one exact project intent before TUS and finalizes after transfer", async () => {
    const intent = {
      upload_id: UPLOAD_ID,
      storage_path: STORAGE_PATH,
      intent_expires_at: "2026-09-02T12:00:00.000Z",
    };
    mocks.rpc.mockResolvedValueOnce({ data: [intent], error: null }).mockResolvedValueOnce({
      data: [{ upload_id: UPLOAD_ID, storage_path: STORAGE_PATH, status: "awaiting_validation" }],
      error: null,
    });
    mocks.dbFrom.mockReturnValue(getQuery());
    const file = {
      name: "drone.tif",
      size: 1024,
      type: "image/tiff",
      lastModified: 1,
    } as File;

    await expect(
      uploadFile({
        file,
        projectId: uploadRow.project_id,
        userMetadata: { client_preview: { gps: "untrusted" } },
      }),
    ).resolves.toEqual(uploadRow);

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "create_upload_intent", {
      p_project_id: uploadRow.project_id,
      p_original_file_name: "drone.tif",
      p_mime_type: "image/tiff",
      p_file_size: 1024,
      p_client_request_id: expect.any(String),
      p_zone_id: undefined,
      p_upload_type: "orthophoto",
      p_user_metadata: { client_preview: { gps: "untrusted" } },
    });
    expect(mocks.uploadWithTus).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "user-access-token",
        bucketName: UPLOAD_BUCKET,
        objectName: STORAGE_PATH,
        contentType: "image/tiff",
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "finalize_upload_intent", {
      p_upload_id: UPLOAD_ID,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps a failed resumable transfer as a visible pending intent", async () => {
    const intent = {
      upload_id: UPLOAD_ID,
      storage_path: STORAGE_PATH,
      intent_expires_at: "2026-09-02T12:00:00.000Z",
    };
    mocks.rpc.mockResolvedValueOnce({ data: [intent], error: null });
    mocks.uploadWithTus.mockRejectedValue(new Error("network interrupted"));
    const file = {
      name: "drone.tif",
      size: 1024,
      type: "image/tiff",
      lastModified: 1,
    } as File;

    const failure = await uploadFile({ file, projectId: uploadRow.project_id }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(UploadTransferError);
    expect(failure).toMatchObject({
      intent: {
        uploadId: intent.upload_id,
        storagePath: intent.storage_path,
        intentExpiresAt: intent.intent_expires_at,
      },
      message: "network interrupted",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("retries the same intent and object path without creating a second row", async () => {
    const intent = {
      upload_id: UPLOAD_ID,
      storage_path: STORAGE_PATH,
      intent_expires_at: "2026-09-02T12:00:00.000Z",
    };
    mocks.rpc
      .mockResolvedValueOnce({ data: [intent], error: null })
      .mockResolvedValueOnce({ data: [intent], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "55000", message: "Completed upload object not found" },
      })
      .mockResolvedValueOnce({
        data: [{ upload_id: UPLOAD_ID, storage_path: STORAGE_PATH, status: "awaiting_validation" }],
        error: null,
      });
    mocks.dbFrom.mockReturnValue(getQuery());
    mocks.uploadWithTus.mockRejectedValueOnce(new Error("network interrupted"));
    const file = {
      name: "drone.tif",
      size: 1024,
      type: "image/tiff",
      lastModified: 1,
    } as File;

    const firstFailure = await uploadFile({
      file,
      projectId: uploadRow.project_id,
      clientRequestId: "b9000000-0000-4000-8000-000000000001",
    }).catch((error: unknown) => error);
    expect(firstFailure).toBeInstanceOf(UploadTransferError);

    await expect(
      uploadFile({
        file,
        projectId: uploadRow.project_id,
        clientRequestId: "b9000000-0000-4000-8000-000000000001",
        resumeIntent: (firstFailure as UploadTransferError).intent,
      }),
    ).resolves.toEqual(uploadRow);

    expect(mocks.rpc.mock.calls.filter(([name]) => name === "create_upload_intent")).toHaveLength(
      2,
    );
    expect(mocks.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_client_request_id: "b9000000-0000-4000-8000-000000000001",
    });
    expect(mocks.rpc.mock.calls[1]?.[1]).toMatchObject({
      p_client_request_id: "b9000000-0000-4000-8000-000000000001",
    });
    expect(mocks.uploadWithTus).toHaveBeenCalledTimes(2);
    expect(mocks.uploadWithTus.mock.calls[0]?.[0]).toMatchObject({ objectName: STORAGE_PATH });
    expect(mocks.uploadWithTus.mock.calls[1]?.[0]).toMatchObject({ objectName: STORAGE_PATH });
  });

  it.each(["validating", "ready"])(
    "recovers an already-finalized intent after it advanced to %s",
    async (status) => {
      const intent = {
        uploadId: UPLOAD_ID,
        storagePath: STORAGE_PATH,
        intentExpiresAt: "2026-09-02T12:00:00.000Z",
      };
      mocks.rpc
        .mockResolvedValueOnce({
          data: [
            {
              upload_id: UPLOAD_ID,
              storage_path: STORAGE_PATH,
              intent_expires_at: intent.intentExpiresAt,
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ upload_id: UPLOAD_ID, storage_path: STORAGE_PATH, status }],
          error: null,
        });
      const progressedRow = { ...uploadRow, status };
      mocks.dbFrom.mockReturnValue(getQuery({ data: progressedRow, error: null }));
      const file = {
        name: "drone.tif",
        size: 1024,
        type: "image/tiff",
        lastModified: 1,
      } as File;

      await expect(
        uploadFile({ file, projectId: uploadRow.project_id, resumeIntent: intent }),
      ).resolves.toEqual(progressedRow);

      expect(mocks.rpc).toHaveBeenCalledTimes(2);
      expect(mocks.rpc).toHaveBeenNthCalledWith(2, "finalize_upload_intent", {
        p_upload_id: UPLOAD_ID,
      });
      expect(mocks.uploadWithTus).not.toHaveBeenCalled();
    },
  );

  it("rejects a retry whose current scope no longer matches the persisted intent", async () => {
    const originalIntent = {
      uploadId: UPLOAD_ID,
      storagePath: STORAGE_PATH,
      intentExpiresAt: "2026-09-02T12:00:00.000Z",
    };
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          upload_id: "b5000000-0000-4000-8000-000000000002",
          storage_path: `${USER_ID}/intents/other/drone.tif`,
          intent_expires_at: originalIntent.intentExpiresAt,
        },
      ],
      error: null,
    });
    const file = {
      name: "drone.tif",
      size: 1024,
      type: "image/tiff",
      lastModified: 1,
    } as File;

    await expect(
      uploadFile({
        file,
        projectId: "b2000000-0000-4000-8000-000000000001",
        clientRequestId: "b9000000-0000-4000-8000-000000000001",
        resumeIntent: originalIntent,
      }),
    ).rejects.toThrow("matcher ikke den oprindelige fil og projektkontekst");

    expect(mocks.uploadWithTus).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "finalize_upload_intent")).toHaveLength(
      0,
    );
  });

  it("refuses to create an unscoped upload", async () => {
    const file = { name: "drone.tif", size: 1024, type: "image/tiff" } as File;

    await expect(uploadFile({ file, projectId: null })).rejects.toThrow(
      "Vælg et projekt før upload.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
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
