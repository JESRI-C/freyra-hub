import { describe, expect, it, vi } from "vitest";
import {
  executeGetCanonicalDroneMediaUrl,
  signCanonicalDroneMedia,
  type CanonicalDroneMediaDependencies,
} from "../canonical-drone-media.functions";
import { ProjectAccessDeniedError } from "../project-nature-access.server";
import {
  canonicalDroneMediaReference,
  validateCanonicalDroneMediaRead,
} from "@/services/monitoring/canonical-drone-media-reference";

const PROJECT = "10000000-0000-4000-8000-000000000001";
const MEDIA = "20000000-0000-4000-8000-000000000001";
const UPLOAD = "30000000-0000-4000-8000-000000000001";
const ACTOR = "40000000-0000-4000-8000-000000000001";
const OBJECT = "50000000-0000-4000-8000-000000000001";
const AT = "2026-10-13T10:00:00.000Z";
const PATH = `${ACTOR}/intents/${UPLOAD}/original.JPG`;
const INPUT = { projectId: PROJECT, mediaId: MEDIA };
const CLIENT = {} as never;
function reference() {
  return canonicalDroneMediaReference(
    {
      id: MEDIA,
      project_id: PROJECT,
      source_upload_id: UPLOAD,
      original_role: "drone_original",
      original_sha256: "a".repeat(64),
      original_validation_sha256: "b".repeat(64),
      original_validation_status: "review_required",
      storage_bucket: "monitoring-uploads",
      file_path: PATH,
      storage_object_id: OBJECT,
      storage_object_version: "version-1",
      storage_object_updated_at: AT,
      file_size_bytes: 150,
      mime_type: "image/jpeg",
      category: "drone_image",
      source: "drone",
      status: "uploaded",
      is_report_ready: false,
    },
    PROJECT,
    MEDIA,
  );
}
function preparedRead() {
  return {
    media: reference(),
    upload: {
      id: UPLOAD,
      project_id: PROJECT,
      uploaded_by: ACTOR,
      storage_path: PATH,
      original_sha256: "a".repeat(64),
      original_validation_sha256: "b".repeat(64),
    },
    object: {
      id: OBJECT,
      version: "version-1",
      updated_at: AT,
      owner_id: ACTOR,
      size: 150,
      mimetype: "image/jpeg",
    },
  };
}
function dependencies() {
  return {
    authorize: vi
      .fn<CanonicalDroneMediaDependencies["authorize"]>()
      .mockResolvedValue({ role: "viewer", canPersist: false, centroid: null }),
    loadMedia: vi.fn<CanonicalDroneMediaDependencies["loadMedia"]>().mockResolvedValue(reference()),
    getReader: vi.fn<CanonicalDroneMediaDependencies["getReader"]>().mockResolvedValue(CLIENT),
    prepare: vi.fn<CanonicalDroneMediaDependencies["prepare"]>().mockResolvedValue(undefined),
    sign: vi
      .fn<CanonicalDroneMediaDependencies["sign"]>()
      .mockResolvedValue("https://fixed.supabase.co/signed?token=ephemeral-test"),
  };
}

describe("canonical original caller-bound private reads", () => {
  it("allows a current viewer while authorizing before privileged metadata lookup", async () => {
    const calls = dependencies();
    const result = await executeGetCanonicalDroneMediaUrl(INPUT, ACTOR, CLIENT, calls);
    expect(calls.authorize).toHaveBeenCalledWith(CLIENT, ACTOR, PROJECT);
    expect(calls.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      calls.loadMedia.mock.invocationCallOrder[0],
    );
    expect(calls.loadMedia.mock.invocationCallOrder[0]).toBeLessThan(
      calls.getReader.mock.invocationCallOrder[0],
    );
    expect(calls.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      calls.sign.mock.invocationCallOrder[0],
    );
    expect(calls.sign.mock.invocationCallOrder[0]).toBeLessThan(
      calls.prepare.mock.invocationCallOrder[1],
    );
    expect(result).toMatchObject({
      projectId: PROJECT,
      mediaId: MEDIA,
      expiresInSeconds: 60,
      reportEligible: false,
      georeferenced: false,
    });
  });
  it("rejects free caller paths/buckets/versions and foreign tenants before reading or signing", async () => {
    for (const extra of [
      { path: PATH },
      { bucket: "monitoring-uploads" },
      { version: "new" },
      { url: "https://foreign.invalid/" },
    ]) {
      const calls = dependencies();
      await expect(
        executeGetCanonicalDroneMediaUrl({ ...INPUT, ...extra } as never, ACTOR, CLIENT, calls),
      ).rejects.toThrow();
      expect(calls.authorize).not.toHaveBeenCalled();
    }
    const calls = dependencies();
    calls.authorize.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(executeGetCanonicalDroneMediaUrl(INPUT, ACTOR, CLIENT, calls)).rejects.toThrow(
      "Project access denied",
    );
    expect(calls.getReader).not.toHaveBeenCalled();
    expect(calls.sign).not.toHaveBeenCalled();
  });
  it("rejects a mismatched RLS media row before loading the privileged reader", async () => {
    const calls = dependencies();
    calls.loadMedia.mockResolvedValue({
      ...reference(),
      project_id: "90000000-0000-4000-8000-000000000001",
    });
    await expect(executeGetCanonicalDroneMediaUrl(INPUT, ACTOR, CLIENT, calls)).rejects.toThrow();
    expect(calls.getReader).not.toHaveBeenCalled();
  });
  it("does not sign an unavailable pin or return a URL after revocation during signing", async () => {
    const unavailable = dependencies();
    unavailable.prepare.mockRejectedValue(new Error("Object version changed"));
    await expect(
      executeGetCanonicalDroneMediaUrl(INPUT, ACTOR, CLIENT, unavailable),
    ).rejects.toThrow("version changed");
    expect(unavailable.sign).not.toHaveBeenCalled();
    const revoked = dependencies();
    revoked.prepare
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Read membership revoked"));
    await expect(executeGetCanonicalDroneMediaUrl(INPUT, ACTOR, CLIENT, revoked)).rejects.toThrow(
      "revoked",
    );
    expect(revoked.sign).toHaveBeenCalledOnce();
  });
  it("retries a read from current authority/object state without mutating intake or media", async () => {
    const calls = dependencies();
    calls.sign.mockRejectedValueOnce(new Error("Storage temporarily unavailable"));
    await expect(executeGetCanonicalDroneMediaUrl(INPUT, ACTOR, CLIENT, calls)).rejects.toThrow(
      "unavailable",
    );
    await expect(
      executeGetCanonicalDroneMediaUrl(INPUT, ACTOR, CLIENT, calls),
    ).resolves.toMatchObject({ mediaId: MEDIA, reportEligible: false });
    expect(calls.authorize).toHaveBeenCalledTimes(2);
    expect(calls.loadMedia).toHaveBeenCalledTimes(2);
    expect(calls.prepare).toHaveBeenCalledTimes(3);
  });
  it("the real reader contract binds both checks to the verified actor and exact canonical row", async () => {
    const calls = dependencies();
    const rpc = vi.fn().mockResolvedValue({ data: preparedRead(), error: null });
    const result = await executeGetCanonicalDroneMediaUrl(INPUT, ACTOR, CLIENT, {
      authorize: calls.authorize,
      loadMedia: calls.loadMedia,
      getReader: async () => ({ rpc }),
      sign: calls.sign,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    for (const invocation of rpc.mock.calls)
      expect(invocation).toEqual([
        "prepare_project_media_original_read",
        { p_project_id: PROJECT, p_media_id: MEDIA, p_actor_id: ACTOR },
      ]);
    expect(result.originalSha256).toBe("a".repeat(64));
  });
});

describe("canonical pinned metadata and short Storage signatures", () => {
  it("checks exact object/version/updated_at, upload hash and project identity", () => {
    validateCanonicalDroneMediaRead(preparedRead(), reference());
    for (const mutate of [
      (row: ReturnType<typeof preparedRead>) => {
        row.object.id = "90000000-0000-4000-8000-000000000001";
      },
      (row: ReturnType<typeof preparedRead>) => {
        row.object.version = "replacement";
      },
      (row: ReturnType<typeof preparedRead>) => {
        row.object.updated_at = "2026-10-13T10:00:00.001Z";
      },
      (row: ReturnType<typeof preparedRead>) => {
        row.object.owner_id = "90000000-0000-4000-8000-000000000002";
      },
      (row: ReturnType<typeof preparedRead>) => {
        row.upload.original_sha256 = "c".repeat(64);
      },
      (row: ReturnType<typeof preparedRead>) => {
        row.media.project_id = "90000000-0000-4000-8000-000000000003";
      },
    ]) {
      const row = preparedRead();
      mutate(row);
      expect(() => validateCanonicalDroneMediaRead(row, reference())).toThrow();
    }
  });
  it("refuses an untrusted path/bucket/report-ready row", () => {
    for (const extra of [
      { file_path: "https://foreign.invalid/a.JPG" },
      { file_path: `${ACTOR}/intents/${UPLOAD}/../file.JPG` },
      { file_path: `${ACTOR}/intents/90000000-0000-4000-8000-000000000001/original.JPG` },
      { storage_bucket: "project-media" },
      { is_report_ready: true },
      { status: "report_ready" },
    ])
      expect(() =>
        canonicalDroneMediaReference({ ...reference(), ...extra }, PROJECT, MEDIA),
      ).toThrow();
  });
  it("signs only caller-authorized monitoring bytes at the fixed origin with a 60 second TTL", async () => {
    const url = `https://fixed.supabase.co/storage/v1/object/sign/monitoring-uploads/${PATH}?token=ephemeral-test`;
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: url }, error: null });
    const from = vi.fn(() => ({ createSignedUrl }));
    await expect(
      signCanonicalDroneMedia(
        { storage: { from } } as never,
        reference(),
        "https://fixed.supabase.co",
      ),
    ).resolves.toBe(url);
    expect(from).toHaveBeenCalledExactlyOnceWith("monitoring-uploads");
    expect(createSignedUrl).toHaveBeenCalledExactlyOnceWith(PATH, 60);
  });
  it("never returns a foreign or swapped-path Storage URL", async () => {
    for (const url of [
      "https://foreign.invalid/file?token=bad",
      "https://fixed.supabase.co/storage/v1/object/sign/monitoring-uploads/wrong.JPG?token=bad",
      `https://fixed.supabase.co/storage/v1/object/sign/monitoring-uploads/${PATH}`,
    ]) {
      const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: url }, error: null });
      await expect(
        signCanonicalDroneMedia(
          { storage: { from: () => ({ createSignedUrl }) } } as never,
          reference(),
          "https://fixed.supabase.co",
        ),
      ).rejects.toThrow("Storage-adressen");
    }
  });
});
