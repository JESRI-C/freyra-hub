import { describe, expect, it, vi } from "vitest";
import {
  executeValidateDroneOriginal,
  downloadCanonicalDroneOriginal,
  type DroneOriginalDependencies,
} from "../drone-original-validation.functions";
import { ProjectAccessDeniedError } from "../project-nature-access.server";
import { validateDroneOriginalBytes } from "@/services/monitoring/drone-original-validation.server";
import {
  ACTOR_ID,
  PROJECT_ID,
  UPLOAD_ID,
  canonicalUpload,
  originalJpeg,
  storageObject,
} from "@/services/monitoring/__tests__/drone-original-validation.fixtures";

const CLIENT = {} as never;
const INPUT = { projectId: PROJECT_ID, uploadId: UPLOAD_ID };
function dependencies() {
  const bytes = originalJpeg();
  const authorize = vi.fn().mockResolvedValue({ role: "editor", canPersist: true, centroid: null });
  const getWriter = vi.fn().mockResolvedValue(CLIENT);
  const prepare = vi.fn().mockResolvedValue({
    upload: canonicalUpload(bytes),
    object: storageObject(bytes),
    existing: null,
    existingSha256: null,
  });
  const download = vi.fn().mockResolvedValue(bytes);
  const validate = vi.fn<DroneOriginalDependencies["validate"]>(validateDroneOriginalBytes);
  const persist = vi
    .fn<DroneOriginalDependencies["persist"]>()
    .mockImplementation(async (_writer, _input, _actor, _prepared, result) => result);
  return {
    authorize,
    getWriter,
    prepare,
    download,
    validate,
    persist,
  } satisfies DroneOriginalDependencies;
}

describe("server original validation authorization and canonical binding", () => {
  it("rejects caller-supplied file identity, EXIF, hash, status and approval before any authority", async () => {
    for (const patch of [
      { storagePath: "other/file.jpg" },
      { sha256: "a".repeat(64) },
      { metadata: { latitude: 55 } },
      { approved: true },
      { status: "ready" },
    ]) {
      const calls = dependencies();
      await expect(
        executeValidateDroneOriginal({ ...INPUT, ...patch } as never, ACTOR_ID, CLIENT, calls),
      ).rejects.toThrow();
      expect(calls.authorize).not.toHaveBeenCalled();
      expect(calls.getWriter).not.toHaveBeenCalled();
      expect(calls.download).not.toHaveBeenCalled();
    }
  });

  it("denies foreign tenants and readers before privileged RPC or private Storage", async () => {
    const foreign = dependencies();
    foreign.authorize.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(executeValidateDroneOriginal(INPUT, ACTOR_ID, CLIENT, foreign)).rejects.toThrow();
    expect(foreign.getWriter).not.toHaveBeenCalled();
    const viewer = dependencies();
    viewer.authorize.mockResolvedValue({ role: "viewer", canPersist: false, centroid: null });
    await expect(executeValidateDroneOriginal(INPUT, ACTOR_ID, CLIENT, viewer)).rejects.toThrow(
      "ikke rettighed",
    );
    expect(viewer.getWriter).not.toHaveBeenCalled();
  });

  it("authorizes and binds canonical Storage before extracting or persisting actual bytes", async () => {
    const calls = dependencies();
    const result = await executeValidateDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls);
    expect(calls.authorize).toHaveBeenCalledWith(CLIENT, ACTOR_ID, PROJECT_ID);
    expect(calls.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      calls.getWriter.mock.invocationCallOrder[0],
    );
    expect(calls.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      calls.download.mock.invocationCallOrder[0],
    );
    expect(calls.download.mock.invocationCallOrder[0]).toBeLessThan(
      calls.validate.mock.invocationCallOrder[0],
    );
    expect(calls.validate.mock.invocationCallOrder[0]).toBeLessThan(
      calls.persist.mock.invocationCallOrder[0],
    );
    expect(result.reportEligible).toBe(false);
  });

  it("replays a validated original without further download, parsing or mutation", async () => {
    const calls = dependencies(),
      prepared = await calls.prepare(CLIENT, INPUT, ACTOR_ID);
    const saved = await validateDroneOriginalBytes(
      prepared.upload,
      prepared.object,
      originalJpeg(),
      ACTOR_ID,
    );
    calls.prepare.mockResolvedValue({ ...prepared, existing: saved });
    await expect(executeValidateDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls)).resolves.toEqual(
      saved,
    );
    expect(calls.download).not.toHaveBeenCalled();
    expect(calls.validate).not.toHaveBeenCalled();
    expect(calls.persist).not.toHaveBeenCalled();
  });

  it("does not claim success after download denial or revoked membership at final commit", async () => {
    const downloadDenied = dependencies();
    downloadDenied.download.mockRejectedValue(new Error("Storage access denied"));
    await expect(
      executeValidateDroneOriginal(INPUT, ACTOR_ID, CLIENT, downloadDenied),
    ).rejects.toThrow("Storage access denied");
    expect(downloadDenied.persist).not.toHaveBeenCalled();
    const revoked = dependencies();
    revoked.persist.mockRejectedValue(new Error("Current membership revoked"));
    await expect(executeValidateDroneOriginal(INPUT, ACTOR_ID, CLIENT, revoked)).rejects.toThrow(
      "Current membership revoked",
    );
    expect(revoked.download).toHaveBeenCalledOnce();
  });
});

describe("bounded private original download", () => {
  const origin = "https://test-project.supabase.co";
  function downloadCase(signedUrl?: string) {
    const bytes = originalJpeg();
    const upload = canonicalUpload(bytes);
    const prepared = { upload, object: storageObject(bytes), existing: null, existingSha256: null };
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl:
          signedUrl ??
          `${origin}/storage/v1/object/sign/monitoring-uploads/${upload.storage_path}?token=private-test-token`,
      },
      error: null,
    });
    const client = { storage: { from: vi.fn(() => ({ createSignedUrl })) } } as never;
    return { bytes, prepared, createSignedUrl, client };
  }

  it("signs via the caller and reads only the exact bounded canonical object", async () => {
    const fixture = downloadCase();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(fixture.bytes.slice().buffer));
    await expect(
      downloadCanonicalDroneOriginal(fixture.client, fixture.prepared, {
        supabaseUrl: origin,
        fetch: fetcher,
      }),
    ).resolves.toEqual(fixture.bytes);
    expect(fixture.createSignedUrl).toHaveBeenCalledExactlyOnceWith(
      fixture.prepared.upload.storage_path,
      60,
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "manual", cache: "no-store" });
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses unexpected Storage hosts and paths without fetching them", async () => {
    for (const signedUrl of [
      `https://foreign.invalid/storage/v1/object/sign/monitoring-uploads/file.jpg?token=secret`,
      `${origin}/storage/v1/object/sign/monitoring-uploads/another/file.jpg?token=secret`,
    ]) {
      const fixture = downloadCase(signedUrl),
        fetcher = vi.fn<typeof fetch>();
      await expect(
        downloadCanonicalDroneOriginal(fixture.client, fixture.prepared, {
          supabaseUrl: origin,
          fetch: fetcher,
        }),
      ).rejects.toThrow("kanoniske originalfil");
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("rejects redirects without following the signed URL or leaking its token", async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const fixture = downloadCase();
      const cancel = vi.fn();
      const response = new Response(new ReadableStream({ cancel }), {
        status,
        headers: { location: "https://foreign.invalid/?token=private-test-token" },
      });
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(
        downloadCanonicalDroneOriginal(fixture.client, fixture.prepared, {
          supabaseUrl: origin,
          fetch: fetcher,
        }),
      ).rejects.toThrow("Den private originalfil kunne ikke hentes.");
      expect(fetcher).toHaveBeenCalledOnce();
      expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
      expect(cancel).toHaveBeenCalledOnce();
    }
  });

  it("rejects an oversized declared body before buffering it", async () => {
    const fixture = downloadCase();
    const response = new Response(fixture.bytes.slice().buffer, {
      headers: { "content-length": String(fixture.bytes.length + 1) },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      downloadCanonicalDroneOriginal(fixture.client, fixture.prepared, {
        supabaseUrl: origin,
        fetch: fetcher,
      }),
    ).rejects.toThrow("filstørrelse");
  });

  it("also rejects oversized chunked and incomplete bodies without relying on Content-Length", async () => {
    const fixture = downloadCase();
    for (const bytes of [new Uint8Array([...fixture.bytes, 0]), fixture.bytes.slice(1)]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes.slice().buffer));
      await expect(
        downloadCanonicalDroneOriginal(fixture.client, fixture.prepared, {
          supabaseUrl: origin,
          fetch: fetcher,
        }),
      ).rejects.toThrow("Storage-download");
    }
  });

  it("does not expose the private URL or token in a network failure", async () => {
    const fixture = downloadCase();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network failed for ?token=private-test-token"));
    await expect(
      downloadCanonicalDroneOriginal(fixture.client, fixture.prepared, {
        supabaseUrl: origin,
        fetch: fetcher,
      }),
    ).rejects.toThrow("20 sekunder");
    try {
      await downloadCanonicalDroneOriginal(fixture.client, fixture.prepared, {
        supabaseUrl: origin,
        fetch: fetcher,
      });
    } catch (error) {
      expect((error as Error).message).not.toContain("private-test-token");
    }
  });
});
