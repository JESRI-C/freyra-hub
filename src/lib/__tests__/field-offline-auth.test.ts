import { describe, expect, it, vi } from "vitest";
import { fieldPhotoVerificationForActor } from "../field-photo-upload";
import { lockOfflineActor, readOfflineActor, unlockOfflineActor } from "../field-offline";
const actor = "11111111-1111-4111-8111-111111111111",
  projectId = "22222222-2222-4222-8222-222222222222",
  uploadId = "33333333-3333-4333-8333-333333333333";
describe("offline identity is not server authority", () => {
  it("rejects a queued verification after the server-authenticated caller changes", () => {
    expect(() =>
      fieldPhotoVerificationForActor({ projectId, uploadId, expectedActorId: actor }, uploadId),
    ).toThrow("Sessionen er ændret");
    expect(
      fieldPhotoVerificationForActor({ projectId, uploadId, expectedActorId: actor }, actor),
    ).toEqual({ projectId, uploadId });
    expect(fieldPhotoVerificationForActor({ projectId, uploadId }, actor)).toEqual({
      projectId,
      uploadId,
    });
  });
  it("locks a device without deleting pending records or storing tokens", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
      removeItem: (k: string) => {
        values.delete(k);
      },
    };
    unlockOfflineActor(actor, storage);
    expect([...values.values()]).toEqual([actor]);
    expect(readOfflineActor(storage)).toBe(actor);
    lockOfflineActor(storage);
    expect(readOfflineActor(storage)).toBeNull();
    const denied = {
      getItem: vi.fn(() => {
        throw new Error("storage denied");
      }),
    };
    expect(readOfflineActor(denied)).toBeNull();
  });
});
