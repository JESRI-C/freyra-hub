import { describe, expect, it, vi } from "vitest";
import {
  droneIntakeBaselinePeriod,
  droneIntakeAiPhotos,
  droneIntakeRecordingDate,
  droneIntakeReceiptKey,
  readOrCreateDroneIntakeRequests,
  runDroneIntakeImageChunk,
  type DroneIntakeScope,
} from "../drone-intake-run";
import type { DroneLocalizationResult } from "@/services/geospatial/drone-localization";
import { DRONE_VISION_MODEL } from "@/services/monitoring/drone-image-inspection-model";
const ACTOR = "10000000-0000-4000-8000-000000000001",
  PROJECT = "20000000-0000-4000-8000-000000000001";
const BASELINE = "40000000-0000-4000-8000-000000000001",
  BASELINE_HASH = "a".repeat(64);
const id = (index: number) => `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
function scope(count = 2): DroneIntakeScope {
  return {
    actorId: ACTOR,
    projectId: PROJECT,
    baselineSnapshotId: BASELINE,
    baselineSha256: BASELINE_HASH,
    batchId: "before-batch-test",
    mediaIds: Array.from({ length: count }, (_, index) => id(index + 1)),
  };
}
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
function sequence() {
  let index = 100;
  return () => id(index++);
}
function inspector() {
  return vi.fn(
    async ({
      data,
    }: {
      data: { projectId: string; mediaId: string; requestId: string; expectedCallerUserId: string };
    }) =>
      ({
        status: "completed",
        inspection: {
          projectId: data.projectId,
          mediaId: data.mediaId,
          sourceSnapshotId: BASELINE,
          sourceSnapshotHash: BASELINE_HASH,
          status: "completed",
          result: { status: "draft" },
        },
      }) as never,
  );
}
describe("bounded exact-batch image analysis", () => {
  it("preserves old Qwen receipts while issuing stable new Gemma request identities", () => {
    const target = scope(),
      saved = storage();
    const suffix = `${target.actorId}:${target.projectId}:${target.batchId}:${target.baselineSnapshotId}:${target.baselineSha256}:${target.mediaIds.join(",")}`;
    const legacyKey = `gofreyra.drone-intake-image-requests:${suffix}`;
    const qwenKey = `gofreyra.drone-intake-image-requests/v2:${encodeURIComponent("@cf/qwen/qwen3.8-27b")}:${suffix}`;
    const old = JSON.stringify({
      schema: "gofreyra.drone-intake-image-requests/v1",
      scope: target,
      requests: target.mediaIds.map((mediaId, index) => ({ mediaId, requestId: id(index + 100) })),
    });
    const oldQwen = JSON.stringify({
      ...JSON.parse(old),
      schema: "gofreyra.drone-intake-image-requests/v2",
      modelId: "@cf/qwen/qwen3.8-27b",
    });
    saved.setItem(legacyKey, old);
    saved.setItem(qwenKey, oldQwen);
    let nextId = 200;
    const current = readOrCreateDroneIntakeRequests(target, saved, () => id(nextId++));
    expect(current.modelId).toBe(DRONE_VISION_MODEL);
    expect(current.modelId).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(current.requests.map((request) => request.requestId)).toEqual([id(200), id(201)]);
    expect(
      readOrCreateDroneIntakeRequests(target, saved, () => {
        throw new Error("must reuse current model");
      }),
    ).toEqual(current);
    expect(saved.getItem(legacyKey)).toBe(old);
    expect(saved.getItem(qwenKey)).toBe(oldQwen);
    expect(saved.values.size).toBe(3);
  });
  it("rejects a mismatched model stored under the current receipt key without replacing it", () => {
    const saved = storage(),
      target = scope();
    const current = readOrCreateDroneIntakeRequests(target, saved, sequence());
    const wrong = JSON.stringify({ ...current, modelId: "@cf/qwen/qwen3.8-27b" });
    saved.setItem(droneIntakeReceiptKey(target), wrong);
    const random = vi.fn(sequence());
    expect(() => readOrCreateDroneIntakeRequests(target, saved, random)).toThrow();
    expect(random).not.toHaveBeenCalled();
    expect(saved.getItem(droneIntakeReceiptKey(target))).toBe(wrong);
  });
  it("prevents concurrent attempts and preserves the same model-pinned request for retry", async () => {
    const saved = storage(),
      target = scope(1),
      run = inspector();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    run.mockImplementationOnce(async ({ data }) => {
      await gate;
      return {
        status: "completed",
        inspection: {
          projectId: data.projectId,
          mediaId: data.mediaId,
          sourceSnapshotId: BASELINE,
          sourceSnapshotHash: BASELINE_HASH,
          status: "completed",
          result: {},
        },
      } as never;
    });
    const pending = runDroneIntakeImageChunk(target, run, {
      storage: saved,
      startIndex: 0,
      isCurrent: () => true,
      randomUUID: sequence(),
    });
    await expect(
      runDroneIntakeImageChunk(target, run, {
        storage: saved,
        startIndex: 0,
        isCurrent: () => true,
      }),
    ).rejects.toThrow("allerede");
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await pending;
    await runDroneIntakeImageChunk(target, run, {
      storage: saved,
      startIndex: 0,
      isCurrent: () => true,
      randomUUID: () => {
        throw new Error("must reuse");
      },
    });
    expect(run.mock.calls[1][0]).toEqual(run.mock.calls[0][0]);
  });
  it("keeps large originals for manual review without trapping later supported photos", () => {
    const photos = [
      { mediaId: id(1), sizeBytes: 20_000_001 },
      { mediaId: id(2), sizeBytes: 137 },
      { mediaId: id(3), sizeBytes: 20_000_000 },
    ] as Parameters<typeof droneIntakeAiPhotos>[0];
    expect(droneIntakeAiPhotos(photos).map((photo) => photo.mediaId)).toEqual([id(2), id(3)]);
  });
  it("stores every fixed request before the first provider attempt and reuses IDs on retry", async () => {
    const target = scope(),
      saved = storage(),
      run = inspector();
    run.mockImplementation(async ({ data }) => {
      expect(saved.values.size).toBe(1);
      return {
        status: "completed",
        inspection: {
          projectId: data.projectId,
          mediaId: data.mediaId,
          sourceSnapshotId: BASELINE,
          sourceSnapshotHash: BASELINE_HASH,
          status: "completed",
          result: {},
        },
      } as never;
    });
    await runDroneIntakeImageChunk(target, run, {
      storage: saved,
      startIndex: 0,
      isCurrent: () => true,
      randomUUID: sequence(),
    });
    await runDroneIntakeImageChunk(target, run, {
      storage: saved,
      startIndex: 0,
      isCurrent: () => true,
      randomUUID: () => {
        throw new Error("must reuse");
      },
    });
    expect(run.mock.calls[0][0].data).toEqual(run.mock.calls[2][0].data);
    expect(run.mock.calls[0][0].data).toMatchObject({
      baselineSnapshotId: BASELINE,
      baselineSha256: BASELINE_HASH,
    });
    expect(
      run.mock.calls.every(
        ([request]) =>
          request.data.expectedCallerUserId === ACTOR &&
          target.mediaIds.includes(request.data.mediaId),
      ),
    ).toBe(true);
  });
  it("runs twelve photos at most and never overlaps provider calls", async () => {
    const target = scope(30),
      saved = storage();
    let active = 0,
      maximum = 0;
    const run = vi.fn(async ({ data }: { data: { projectId: string; mediaId: string } }) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return {
        status: "completed",
        inspection: {
          projectId: data.projectId,
          mediaId: data.mediaId,
          sourceSnapshotId: BASELINE,
          sourceSnapshotHash: BASELINE_HASH,
          status: "completed",
          result: {},
        },
      } as never;
    });
    const result = await runDroneIntakeImageChunk(target, run, {
      storage: saved,
      startIndex: 0,
      isCurrent: () => true,
      randomUUID: sequence(),
    });
    expect(run).toHaveBeenCalledTimes(12);
    expect(maximum).toBe(1);
    expect(result.nextIndex).toBe(12);
    await runDroneIntakeImageChunk(target, run, {
      storage: saved,
      startIndex: 12,
      isCurrent: () => true,
    });
    expect(run).toHaveBeenCalledTimes(24);
    expect(run.mock.calls[12][0].data.mediaId).toBe(target.mediaIds[12]);
  });
  it("does not send an image when browser storage cannot preserve retry identity", async () => {
    const run = inspector();
    await expect(
      runDroneIntakeImageChunk(scope(), run, {
        storage: {
          getItem: () => null,
          setItem: () => {
            throw new Error("storage blocked");
          },
        },
        startIndex: 0,
        isCurrent: () => true,
        randomUUID: sequence(),
      }),
    ).rejects.toThrow("storage blocked");
    expect(run).not.toHaveBeenCalled();
  });
  it("stops at busy or failed photos, preserving the same retry identity", async () => {
    const saved = storage(),
      target = scope(3),
      run = inspector();
    run.mockResolvedValueOnce({
      status: "busy",
      inspection: {
        projectId: PROJECT,
        mediaId: target.mediaIds[0],
        sourceSnapshotId: BASELINE,
        sourceSnapshotHash: BASELINE_HASH,
        status: "pending",
        result: null,
      },
    } as never);
    expect(
      await runDroneIntakeImageChunk(target, run, {
        storage: saved,
        startIndex: 0,
        isCurrent: () => true,
        randomUUID: sequence(),
      }),
    ).toEqual({ nextIndex: 0, busyMediaId: target.mediaIds[0] });
    run.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      runDroneIntakeImageChunk(target, run, {
        storage: saved,
        startIndex: 0,
        isCurrent: () => true,
      }),
    ).rejects.toThrow("timeout");
    expect(run.mock.calls[1][0]).toEqual(run.mock.calls[0][0]);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("discards a late response after actor, project or batch changes before scheduling another photo", async () => {
    let current = true;
    const completed = vi.fn(),
      run = inspector();
    run.mockImplementationOnce(async ({ data }) => {
      current = false;
      return {
        status: "completed",
        inspection: {
          projectId: data.projectId,
          mediaId: data.mediaId,
          sourceSnapshotId: BASELINE,
          sourceSnapshotHash: BASELINE_HASH,
          status: "completed",
          result: {},
        },
      } as never;
    });
    await expect(
      runDroneIntakeImageChunk(scope(3), run, {
        storage: storage(),
        startIndex: 0,
        isCurrent: () => current,
        onCompleted: completed,
        randomUUID: sequence(),
      }),
    ).rejects.toThrow("ændret");
    expect(run).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
  });
  it("rejects a foreign photo response and does not process later photos", async () => {
    const run = inspector();
    run.mockResolvedValueOnce({
      status: "completed",
      inspection: { projectId: ACTOR, mediaId: id(1), status: "completed", result: {} },
    } as never);
    await expect(
      runDroneIntakeImageChunk(scope(), run, {
        storage: storage(),
        startIndex: 0,
        isCurrent: () => true,
        randomUUID: sequence(),
      }),
    ).rejects.toThrow("matcher ikke");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("keeps request receipts separate for caller, case and exact newly promoted batch", () => {
    const saved = storage(),
      first = readOrCreateDroneIntakeRequests(scope(), saved, sequence());
    const second = readOrCreateDroneIntakeRequests(
      { ...scope(), actorId: PROJECT },
      saved,
      sequence(),
    );
    const third = readOrCreateDroneIntakeRequests(scope(3), saved, sequence());
    expect(saved.values.size).toBe(3);
    expect(first.scope).not.toEqual(second.scope);
    expect(third.requests).toHaveLength(3);
  });
  it("keeps requests bound to the exact saved public-data version and rejects unlinked AI responses", async () => {
    const saved = storage();
    readOrCreateDroneIntakeRequests(scope(), saved, sequence());
    readOrCreateDroneIntakeRequests(
      { ...scope(), baselineSha256: "b".repeat(64) },
      saved,
      sequence(),
    );
    expect(saved.values.size).toBe(2);
    const run = inspector();
    run.mockResolvedValueOnce({
      status: "completed",
      inspection: {
        projectId: PROJECT,
        mediaId: id(1),
        sourceSnapshotId: null,
        sourceSnapshotHash: null,
        status: "completed",
        result: {},
      },
    } as never);
    await expect(
      runDroneIntakeImageChunk(scope(), run, {
        storage: saved,
        startIndex: 0,
        isCurrent: () => true,
      }),
    ).rejects.toThrow("matcher ikke");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("does not silently regenerate a corrupt stored receipt", () => {
    const saved = storage();
    readOrCreateDroneIntakeRequests(scope(), saved, sequence());
    saved.values.set([...saved.values.keys()][0], "broken");
    const random = vi.fn(sequence());
    expect(() => readOrCreateDroneIntakeRequests(scope(), saved, random)).toThrow();
    expect(random).not.toHaveBeenCalled();
  });
  it("uses Danish recording dates and requires a choice when safe timestamps span days", () => {
    const result = {
      photos: [{ capturedAtUtc: "2026-10-13T23:30:00.000Z" }],
    } as DroneLocalizationResult;
    expect(droneIntakeRecordingDate(result)).toBe("2026-10-14");
    expect(
      droneIntakeRecordingDate({
        ...result,
        photos: [...result.photos, { capturedAtUtc: "2026-10-13T10:00:00.000Z" } as never],
      }),
    ).toBeNull();
    expect(
      droneIntakeRecordingDate({ ...result, photos: [{ capturedAtUtc: null } as never] }),
    ).toBeNull();
  });
  it("prefills a common literal local date while keeping UTC unknown and mixed dates unselected", () => {
    const result = {
      photos: Array.from({ length: 3 }, () => ({
        status: "date_confirmation_required",
        localRecordingDate: "2026-08-24",
        capturedAtUtc: null,
      })),
    } as DroneLocalizationResult;
    const before = structuredClone(result);
    expect(droneIntakeRecordingDate(result)).toBe("2026-08-24");
    expect(result).toEqual(before);
    expect(
      droneIntakeRecordingDate({
        ...result,
        photos: [result.photos[0], { ...result.photos[1], localRecordingDate: "2026-08-25" }],
      }),
    ).toBeNull();
    expect(
      droneIntakeRecordingDate({
        ...result,
        photos: [result.photos[0], { ...result.photos[1], localRecordingDate: "2026-02-30" }],
      }),
    ).toBeNull();
    expect(
      droneIntakeRecordingDate({
        ...result,
        photos: [result.photos[0], { capturedAtUtc: null } as never],
      }),
    ).toBeNull();
  });
  it("does not reinterpret a local late-night date as UTC when it disagrees with a UTC-derived Danish date", () => {
    const local = {
      status: "date_confirmation_required",
      localRecordingDate: "2026-08-24",
      capturedAtUtc: null,
    } as const;
    const utc = { status: "located", capturedAtUtc: "2026-08-24T23:30:00.000Z" } as const;
    expect(droneIntakeRecordingDate({ photos: [local] } as DroneLocalizationResult)).toBe(
      "2026-08-24",
    );
    expect(
      droneIntakeRecordingDate({ photos: [local, utc] } as DroneLocalizationResult),
    ).toBeNull();
    expect(
      droneIntakeRecordingDate({
        photos: [local, { ...utc, capturedAtUtc: "2026-08-24T07:31:00.000Z" }],
      } as DroneLocalizationResult),
    ).toBe("2026-08-24");
  });
  it("prepares thirty inclusive calendar days without inventing a recording date", () => {
    expect(droneIntakeBaselinePeriod("2026-10-14")).toEqual({
      dateFrom: "2026-09-15",
      dateTo: "2026-10-14",
    });
    expect(() => droneIntakeBaselinePeriod("")).toThrow();
    expect(() => droneIntakeBaselinePeriod("2026-02-30")).toThrow();
  });
});
