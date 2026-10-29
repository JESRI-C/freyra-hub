import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), tus: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: "fd300000-0000-4000-8000-000000000001" },
            access_token: "synthetic-token",
          },
        },
      }),
    },
  },
  requireSupabaseUrl: () => "https://synthetic.supabase.co",
}));
vi.mock("@/lib/field-photo-verification.functions", () => ({ verifyFieldPhoto: mocks.verify }));
vi.mock("../monitoring/resumable-upload-service", () => ({ uploadWithTus: mocks.tus }));
import { uploadFieldPhoto } from "../field-photo-upload-service";
import { received, verified, payload, projectId, uploadId } from "./field-photo-fixture";
const draft = {
  ...received,
  received_at: null,
  object_id: null,
  object_version: null,
  object_updated_at: null,
};
const input = () => ({
  projectId,
  uploadId,
  payload,
  file: new File(["original"], "photo.jpg", { type: "image/jpeg" }),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue(verified);
  mocks.tus.mockResolvedValue(undefined);
});
describe("resumable field uploads", () => {
  it("sends untouched bytes only after the durable intent and missing-object response", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [draft], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "P0002" } })
      .mockResolvedValueOnce({ data: [received], error: null });
    const params = input();
    expect((await uploadFieldPhoto(params)).receipt).toEqual(verified);
    expect(mocks.tus).toHaveBeenCalledWith(
      expect.objectContaining({
        file: params.file,
        objectName: received.storage_path,
        bucketName: "project-media",
      }),
    );
  });
  it("recovers a lost transfer response by finalizing the existing object without reupload", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [draft], error: null })
      .mockResolvedValueOnce({ data: [received], error: null });
    await uploadFieldPhoto(input());
    expect(mocks.tus).not.toHaveBeenCalled();
  });
  it("retries verification alone after the original was already received", async () => {
    mocks.rpc.mockResolvedValue({ data: [received], error: null });
    await uploadFieldPhoto(input());
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.tus).not.toHaveBeenCalled();
  });
  it("does not treat permission or binding failures as a missing file", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [draft], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "23514" } });
    await expect(uploadFieldPhoto(input())).rejects.toThrow("ikke kvitteret");
    expect(mocks.tus).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("requires a server receipt, even after successful TUS completion", async () => {
    mocks.rpc.mockResolvedValue({ data: [received], error: null });
    mocks.verify.mockRejectedValue(new Error("verification pending"));
    await expect(uploadFieldPhoto(input())).rejects.toThrow("pending");
  });
  it("does not accept a checksum mismatch or a receipt for another version", async () => {
    mocks.rpc.mockResolvedValue({ data: [received], error: null });
    mocks.verify.mockResolvedValue({
      ...verified,
      sha256: "b".repeat(64),
      status: "hash_mismatch",
    });
    await expect(uploadFieldPhoto(input())).rejects.toThrow("kræver afklaring");
    mocks.verify.mockResolvedValue({ ...verified, object_version: "v2" });
    await expect(uploadFieldPhoto(input())).rejects.toThrow("matcher ikke");
  });
  it("rejects reused upload ids whose metadata or actor differs", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...draft, payload: { ...payload, title: "Other capture" } }],
      error: null,
    });
    await expect(uploadFieldPhoto(input())).rejects.toThrow("matcher ikke");
    expect(mocks.tus).not.toHaveBeenCalled();
  });
});
