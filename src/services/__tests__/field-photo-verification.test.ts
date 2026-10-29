import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  downloadAndHashFieldPhoto,
  executeVerifyFieldPhoto,
  hashFieldPhotoStream,
  type RequestClient,
} from "../field-photo-verification.server";
import { received, verified, projectId, uploadId, actorId, leaseId } from "./field-photo-fixture";
const input = { projectId, uploadId };
const requestClient = (
  url = `https://synthetic.supabase.co/storage/v1/object/sign/project-media/${received.storage_path}?token=synthetic`,
) =>
  ({
    storage: {
      from: () => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: url }, error: null }),
      }),
    },
  }) as unknown as RequestClient;

describe("streaming field photo verification", () => {
  it("hashes actual chunks and verifies the complete byte count", async () => {
    const bytes = new TextEncoder().encode("original");
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, 2));
        c.enqueue(bytes.slice(2));
        c.close();
      },
    });
    expect(await hashFieldPhotoStream(new Response(stream), 8)).toEqual({
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: 8,
    });
  });
  it.each([7, 9])("rejects a truncated or overflowing stream of %i bytes", async (size) => {
    await expect(hashFieldPhotoStream(new Response("x".repeat(size)), 8)).rejects.toThrow();
  });
  it("rejects a false content length before consuming the original", async () => {
    await expect(
      hashFieldPhotoStream(new Response("original", { headers: { "content-length": "9" } }), 8),
    ).rejects.toThrow("størrelse");
  });
  it("rejects redirects and a stream interrupted after a valid prefix", async () => {
    await expect(hashFieldPhotoStream(new Response(null, { status: 302 }), 8)).rejects.toThrow();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1]));
        c.error(new Error("connection lost"));
      },
    });
    await expect(hashFieldPhotoStream(new Response(stream), 8)).rejects.toThrow("connection lost");
  });
  it.each([
    "https://foreign.test/storage/v1/object/sign/project-media/x?token=x",
    "https://synthetic.supabase.co/storage/v1/object/sign/project-media/other?token=x",
  ])("never fetches a signed URL outside the configured object: %s", async (url) => {
    const fetcher = vi.fn();
    await expect(
      downloadAndHashFieldPhoto(requestClient(url), received, {
        supabaseUrl: "https://synthetic.supabase.co",
        fetch: fetcher,
      }),
    ).rejects.toThrow("ugyldig");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps private signed downloads on the server and prevents redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("original"));
    await downloadAndHashFieldPhoto(requestClient(), received, {
      supabaseUrl: "https://synthetic.supabase.co",
      fetch: fetcher,
    });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "manual", cache: "no-store" });
  });
});
describe("durable verification requests", () => {
  function deps() {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { upload: received, receipt: null, leaseId }, error: null })
      .mockResolvedValueOnce({ data: [verified], error: null })
      .mockResolvedValue({ data: null, error: null });
    return {
      rpc,
      authorize: vi.fn().mockResolvedValue({ canPersist: true, role: "editor" }),
      writer: async () => ({ rpc }),
      hash: vi.fn().mockResolvedValue({ sha256: verified.sha256, sizeBytes: 8 }),
    };
  }
  it("blocks readers before acquiring a privileged writer", async () => {
    const d = deps();
    d.authorize.mockResolvedValue({ canPersist: false, role: "viewer" });
    await expect(executeVerifyFieldPhoto(input, actorId, requestClient(), d)).rejects.toThrow(
      "ikke kontrollere",
    );
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("recovers the same existing receipt without downloading again", async () => {
    const d = deps();
    d.rpc.mockReset().mockResolvedValue({
      data: { upload: received, receipt: verified, leaseId: null },
      error: null,
    });
    expect(await executeVerifyFieldPhoto(input, actorId, requestClient(), d)).toEqual(verified);
    expect(d.hash).not.toHaveBeenCalled();
  });
  it("uses a lease and the server-computed checksum for the receipt", async () => {
    const d = deps();
    expect(await executeVerifyFieldPhoto(input, actorId, requestClient(), d)).toEqual(verified);
    expect(d.rpc).toHaveBeenNthCalledWith(
      2,
      "complete_field_photo_verification",
      expect.objectContaining({
        p_lease_id: leaseId,
        p_sha256: verified.sha256,
        p_actor_id: actorId,
      }),
    );
  });
  it("leaves a retryable job when downloading fails", async () => {
    const d = deps();
    d.hash.mockRejectedValue(new Error("disconnect"));
    await expect(executeVerifyFieldPhoto(input, actorId, requestClient(), d)).rejects.toThrow(
      "serverkontrollen mangler",
    );
    expect(d.rpc).toHaveBeenLastCalledWith(
      "release_field_photo_verification",
      expect.objectContaining({ p_upload_id: uploadId, p_lease_id: leaseId }),
    );
    expect(d.rpc.mock.calls.some((c) => c[0] === "complete_field_photo_verification")).toBe(false);
  });
  it("does not claim success when access or object version changes before commit", async () => {
    const d = deps();
    d.rpc
      .mockReset()
      .mockResolvedValueOnce({ data: { upload: received, receipt: null, leaseId }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42501" } })
      .mockResolvedValue({ data: null, error: null });
    await expect(executeVerifyFieldPhoto(input, actorId, requestClient(), d)).rejects.toThrow(
      "serverkontrollen mangler",
    );
  });
  it("rejects a falsely verified receipt with another stored object", async () => {
    const d = deps();
    d.rpc.mockReset().mockResolvedValue({
      data: { upload: received, receipt: { ...verified, object_version: "v2" }, leaseId: null },
      error: null,
    });
    await expect(executeVerifyFieldPhoto(input, actorId, requestClient(), d)).rejects.toThrow(
      "matcher ikke",
    );
  });
});
