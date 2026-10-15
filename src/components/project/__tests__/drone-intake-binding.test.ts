import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bindConfirmedDroneIntakePhotos } from "../drone-intake-binding";
import { makeMediaUiFixture } from "./survey-round-media-ui.fixtures";
import type { DroneLocalizationPhoto } from "@/services/geospatial/drone-localization";
const run = vi.hoisted(() => vi.fn());
vi.mock("../inspection-photo-batch", async (load) => ({
  ...(await load<typeof import("../inspection-photo-batch")>()),
  runInspectionPhotoBatch: run,
}));
let fixture: Awaited<ReturnType<typeof makeMediaUiFixture>>;
beforeAll(async () => {
  fixture = await makeMediaUiFixture();
});
beforeEach(() => {
  run.mockReset();
  run.mockImplementation(async ({ expectedBatch }) => expectedBatch);
});
function setup() {
  const values = new Map<string, string>(),
    storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
  const photos: DroneLocalizationPhoto[] = [
    {
      mediaId: fixture.candidate.mediaId,
      originalSha256: fixture.candidate.originalSha256,
      originalValidationSha256: fixture.candidate.originalValidationSha256,
      originalValidationStatus: fixture.candidate.originalValidationStatus,
      sizeBytes: fixture.candidate.sizeBytes,
      fileName: fixture.candidate.fileName,
      status: "located",
      reason: null,
      capturedAtUtc: null,
      cameraPosition: { longitude: 9, latitude: 55, geometryRole: "camera_position_only" },
    },
  ];
  const input = { actorId: fixture.version.createdBy, round: fixture.round, photos };
  const api = {
    getAccess: vi.fn(async () => ({
      projectId: fixture.round.projectId,
      userId: fixture.version.createdBy,
      canAssign: true,
    })),
    listBindings: vi.fn(),
    getBinding: vi.fn(),
    saveBinding: vi.fn(),
  };
  return {
    input,
    api,
    values,
    options: {
      storage,
      isCurrent: () => true,
      randomUUID: () => "e1000000-0000-4000-8000-000000000001",
    },
  };
}
describe("confirmed-batch association to the exact new round", () => {
  it("uses only confirmed photos and durable existing batch helpers with exact pins", async () => {
    const { input, api, values, options } = setup();
    await bindConfirmedDroneIntakePhotos(input, api, options);
    expect(run).toHaveBeenCalledTimes(1);
    expect(values.size).toBe(1);
    const call = run.mock.calls[0][0];
    expect(call.scope).toEqual({ actorId: input.actorId, round: input.round });
    expect(
      call.expectedBatch.entries.map(
        (entry: { receipt: { input: { mediaId: string } } }) => entry.receipt.input.mediaId,
      ),
    ).toEqual(input.photos.map((photo) => photo.mediaId));
    expect(api.saveBinding).not.toHaveBeenCalled();
  });
  it("reuses the same assignment requests after a failed run without creating another round", async () => {
    const { input, api, options } = setup();
    run.mockRejectedValueOnce(new Error("network interrupted"));
    await expect(bindConfirmedDroneIntakePhotos(input, api, options)).rejects.toThrow(
      "network interrupted",
    );
    await bindConfirmedDroneIntakePhotos(input, api, {
      ...options,
      randomUUID: () => {
        throw new Error("must reuse");
      },
    });
    expect(run.mock.calls[0][0].expectedBatch).toEqual(run.mock.calls[1][0].expectedBatch);
  });
  it("keeps the original review status, validation hash and unknown UTC when a local date is confirmed", async () => {
    const { input, api, options } = setup();
    Object.assign(input.photos[0], {
      status: "date_confirmation_required",
      localRecordingDate: "2026-08-24",
      originalValidationStatus: "review_required",
      capturedAtUtc: null,
    });
    const before = structuredClone(input.photos);
    await bindConfirmedDroneIntakePhotos(input, api, options);
    expect(input.photos).toEqual(before);
    expect(run.mock.calls[0][0].expectedBatch.entries[0].receipt).toMatchObject({
      originalValidationSha256: input.photos[0].originalValidationSha256,
      originalSha256: input.photos[0].originalSha256,
      input: { mediaId: input.photos[0].mediaId, roundVersionId: input.round.id },
    });
    expect(input.photos[0]).toMatchObject({
      originalValidationStatus: "review_required",
      capturedAtUtc: null,
    });
  });
  it("does not overwrite another frozen original selection on the same round", async () => {
    const { input, api, options } = setup();
    await bindConfirmedDroneIntakePhotos(input, api, options);
    input.photos[0].originalSha256 = "f".repeat(64);
    await expect(bindConfirmedDroneIntakePhotos(input, api, options)).rejects.toThrow(
      "andet fastholdt billedvalg",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("does not proceed under a changed user or revoked assignment rights", async () => {
    for (const kind of ["actor", "role"]) {
      const { input, api, options } = setup();
      api.getAccess.mockResolvedValue({
        projectId: input.round.projectId,
        userId: kind === "actor" ? input.round.projectId : input.actorId,
        canAssign: kind !== "role",
      });
      await expect(bindConfirmedDroneIntakePhotos(input, api, options)).rejects.toThrow(
        "aktuelle bruger",
      );
      expect(run).not.toHaveBeenCalled();
    }
  });
  it("rejects an empty or duplicated selection before any write", async () => {
    const { input, api, options } = setup();
    input.photos.push({ ...input.photos[0] });
    await expect(bindConfirmedDroneIntakePhotos(input, api, options)).rejects.toThrow(
      "forskellige fotos",
    );
    expect(run).not.toHaveBeenCalled();
  });
  it("stops when the case or batch changes while access is being checked", async () => {
    const { input, api, options } = setup();
    let current = true;
    api.getAccess.mockImplementation(async () => {
      current = false;
      return { userId: input.actorId, projectId: input.round.projectId, canAssign: true };
    });
    await expect(
      bindConfirmedDroneIntakePhotos(input, api, { ...options, isCurrent: () => current }),
    ).rejects.toThrow("ændret");
    expect(run).not.toHaveBeenCalled();
  });
});
