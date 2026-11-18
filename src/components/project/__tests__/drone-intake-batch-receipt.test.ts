import { describe, expect, it } from "vitest";
import {
  pendingDroneBatchKey,
  readPendingDroneBatches,
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
    expect(readPendingDroneBatches(s, actorId, projectId)).toEqual([batch]);
    expect(s.data.size).toBe(1);
    expect([...s.data.values()][0]).not.toContain("latitude");
  });
  it("does not expose an old actor's batch to another actor", () => {
    const s = storage();
    savePendingDroneBatch(s, actorId, batch);
    expect(readPendingDroneBatches(s, mediaId, projectId)).toEqual([]);
  });
  it("isolates neutral receipts, including an unpromoted series, from the historical BEFORE workflow", () => {
    const s = storage();
    const neutral = { ...batch, batchId: "drone-batch-1", mediaIds: [] };
    savePendingDroneBatch(s, actorId, neutral, "neutral");
    savePendingDroneBatch(s, actorId, batch);
    expect(readPendingDroneBatches(s, actorId, projectId)).toEqual([batch]);
    expect(readPendingDroneBatches(s, actorId, projectId, "neutral")).toEqual([neutral]);
    expect(readPendingDroneBatches(s, mediaId, projectId, "neutral")).toEqual([]);
    s.setItem(
      pendingDroneBatchKey(actorId, projectId),
      s.getItem(pendingDroneBatchKey(actorId, projectId, "neutral"))!,
    );
    expect(() => readPendingDroneBatches(s, actorId, projectId)).toThrow();
  });
  it("rejects copied cross-project receipt contents", () => {
    const s = storage();
    savePendingDroneBatch(s, actorId, batch);
    s.setItem(
      pendingDroneBatchKey(actorId, mediaId),
      s.getItem(pendingDroneBatchKey(actorId, projectId))!,
    );
    expect(() => readPendingDroneBatches(s, actorId, mediaId)).toThrow();
  });
  it("restores a v1 receipt and keeps 437 originals in three series on later saves", () => {
    const s = storage();
    const part = (from: number, size: number, batchId: string) => ({
      ...batch,
      batchId,
      receivedCount: size,
      mediaIds: Array.from(
        { length: size },
        (_, i) => `c0000000-0000-4000-8000-${String(from + i).padStart(12, "0")}`,
      ),
    });
    const first = part(1, 200, "first");
    const second = part(201, 200, "second");
    const third = part(401, 37, "third");
    s.setItem(
      pendingDroneBatchKey(actorId, projectId),
      JSON.stringify({
        schema: "gofreyra.pending-drone-batch/v1",
        actorId,
        batch: first,
      }),
    );
    savePendingDroneBatch(s, actorId, second);
    savePendingDroneBatch(s, actorId, third);
    savePendingDroneBatch(s, actorId, { ...first, mediaIds: first.mediaIds.slice(0, 20) });
    expect(readPendingDroneBatches(s, actorId, projectId)).toEqual([first, second, third]);
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
