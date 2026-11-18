import { describe, expect, it, vi } from "vitest";
import { prepareSeededOriginals } from "../seeded-originals";

function fixture() {
  return {
    projectId: "project",
    actorId: "actor",
    uploadIds: ["upload1", "upload2"],
    isCurrent: () => true,
    onProgress: vi.fn(),
    validate: vi.fn(async () => undefined),
    promote: vi.fn(async ({ data }: { data: { uploadId: string; requestId: string } }) => ({
      mediaId: `media-${data.uploadId}`,
    })),
  };
}
describe("seeded original resumption", () => {
  it("preserves one idempotent request per actor/project/upload across retries", async () => {
    const input = fixture();
    const batch = await prepareSeededOriginals(input);
    await prepareSeededOriginals(input);
    expect(batch?.mediaIds).toEqual(["media-upload1", "media-upload2"]);
    expect(batch?.receivedCount).toBe(2);
    expect(input.promote.mock.calls[0][0].data.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(input.promote.mock.calls[0][0]).toEqual(input.promote.mock.calls[2][0]);
    expect(input.promote.mock.calls[0][0].data.requestId).not.toBe(
      input.promote.mock.calls[1][0].data.requestId,
    );
  });
  it("stops before promoting or delivering after navigation during validation", async () => {
    const input = fixture();
    let current = true;
    input.isCurrent = () => current;
    input.validate.mockImplementation(async () => {
      current = false;
    });
    expect(await prepareSeededOriginals(input)).toBeNull();
    expect(input.validate).toHaveBeenCalledTimes(1);
    expect(input.promote).not.toHaveBeenCalled();
  });
  it("does not process the next file or return a batch after identity changes during promotion", async () => {
    const input = fixture();
    let current = true;
    input.isCurrent = () => current;
    input.promote.mockImplementation(async () => {
      current = false;
      return { mediaId: "saved" };
    });
    expect(await prepareSeededOriginals(input)).toBeNull();
    expect(input.validate).toHaveBeenCalledTimes(1);
    expect(input.promote).toHaveBeenCalledTimes(1);
  });
  it("leaves unsuccessful validation resumable without promoting it", async () => {
    const input = fixture();
    input.validate.mockRejectedValueOnce(new Error("offline"));
    await expect(prepareSeededOriginals(input)).rejects.toThrow("offline");
    expect(input.promote).not.toHaveBeenCalled();
    expect(await prepareSeededOriginals(input)).toMatchObject({ receivedCount: 2 });
  });
  it("never begins after permission is revoked", async () => {
    const input = fixture();
    input.isCurrent = () => false;
    expect(await prepareSeededOriginals(input)).toBeNull();
    expect(input.validate).not.toHaveBeenCalled();
  });
});
