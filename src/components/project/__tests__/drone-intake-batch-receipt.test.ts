import { describe, expect, it } from "vitest";
import {
  pendingDroneBatchKey,
  readPendingDroneBatch,
  savePendingDroneBatch,
} from "../drone-intake-batch-receipt";
const actorId = "a0000000-0000-4000-8000-000000000001",
  projectId = "b0000000-0000-4000-8000-000000000001",
  mediaId = "c0000000-0000-4000-8000-000000000001";
const batch = {
  projectId,
  batchId: "before-batch-synthetic",
  mediaIds: [mediaId],
  receivedCount: 1,
};
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}
describe("pending upload batch across manual map navigation", () => {
  it("restores the exact IDs and actor/project after a new component mounts", () => {
    const s = storage();
    savePendingDroneBatch(s, actorId, batch);
    expect(readPendingDroneBatch(s, actorId, projectId)).toEqual(batch);
    expect(s.data.size).toBe(1);
    expect([...s.data.values()][0]).not.toContain("latitude");
  });
  it("does not expose an old actor's batch to another actor", () => {
    const s = storage();
    savePendingDroneBatch(s, actorId, batch);
    expect(readPendingDroneBatch(s, mediaId, projectId)).toBeUndefined();
  });
  it("rejects copied cross-project receipt contents", () => {
    const s = storage();
    savePendingDroneBatch(s, actorId, batch);
    s.setItem(
      pendingDroneBatchKey(actorId, mediaId),
      s.getItem(pendingDroneBatchKey(actorId, projectId))!,
    );
    expect(() => readPendingDroneBatch(s, actorId, mediaId)).toThrow();
  });
  it.each([
    { ...batch, mediaIds: [mediaId, mediaId] },
    { ...batch, mediaIds: [] },
    { ...batch, receivedCount: 0 },
    { ...batch, unexpected: true },
  ])("rejects corrupted or unbounded receipt input", (value) => {
    expect(() => savePendingDroneBatch(storage(), actorId, value)).toThrow();
  });
  it("requires actual durable readback", () => {
    expect(() =>
      savePendingDroneBatch({ getItem: () => null, setItem: () => {} }, actorId, batch),
    ).toThrow();
  });
});
