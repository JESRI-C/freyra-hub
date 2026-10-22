import { describe, expect, it, vi } from "vitest";
import {
  executeLocalizeDroneOriginals,
  type DroneLocalizationDependencies,
} from "../drone-localization.functions";
import { ProjectAccessDeniedError } from "../project-nature-access.server";
import {
  canonicalUpload,
  originalJpeg,
  storageObject,
  ACTOR_ID,
  PROJECT_ID,
} from "@/services/monitoring/__tests__/drone-original-validation.fixtures";
import {
  validateDroneOriginalBytes,
  originalValidationSha256,
} from "@/services/monitoring/drone-original-validation.server";
import {
  normaliseDroneImageMetadata,
  sha256File,
} from "@/services/monitoring/drone-image-metadata";
const CLIENT = {} as never;
const MEDIA_ID = "60000000-0000-4000-8000-000000000001";
const INPUT = { projectId: PROJECT_ID, mediaIds: [MEDIA_ID], expectedCallerUserId: ACTOR_ID };
async function rows(index = 1, lng: number | null = 9.26) {
  const bytes = originalJpeg();
  const upload = {
    ...canonicalUpload(bytes),
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  };
  upload.storage_path = `${ACTOR_ID}/intents/${upload.id}/${upload.file_name}`;
  const validation = await validateDroneOriginalBytes(
    upload,
    storageObject(bytes),
    bytes,
    ACTOR_ID,
    {
      extract: async (file) =>
        normaliseDroneImageMetadata(
          {
            ...(lng === null ? {} : { GPSLatitude: 55.35, GPSLongitude: lng }),
            DateTimeOriginal: "2026:10:13 12:00:00",
            OffsetTimeOriginal: "+02:00",
            BodySerialNumber: "PRIVATE-SERIAL",
          },
          null,
          { name: file.name, sizeBytes: file.size, mimeType: file.type, lastModified: 0 },
          await sha256File(file),
        ),
    },
  );
  const checksum = await originalValidationSha256(validation);
  return {
    media: {
      id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      project_id: PROJECT_ID,
      source_upload_id: upload.id,
      original_role: "drone_original",
      original_sha256: validation.original.sha256,
      original_validation_sha256: checksum,
      original_validation_status: validation.status,
      storage_bucket: "monitoring-uploads",
      file_path: upload.storage_path,
      storage_object_id: validation.original.object.id,
      storage_object_version: validation.original.object.version,
      storage_object_updated_at: validation.original.object.updated_at,
      file_size_bytes: upload.file_size,
      mime_type: "image/jpeg",
      category: "drone_image",
      source: "drone",
      status: "uploaded",
      is_report_ready: false,
    },
    upload: { ...upload, original_validation: validation, original_validation_sha256: checksum },
  };
}
async function fixture() {
  const original = await rows();
  const deps = {
    authorize: vi
      .fn<DroneLocalizationDependencies["authorize"]>()
      .mockResolvedValue({ canPersist: false, role: "viewer", centroid: { lat: 57, lng: 14 } }),
    loadRows: vi.fn<DroneLocalizationDependencies["loadRows"]>().mockResolvedValue(original),
    getReader: vi.fn<DroneLocalizationDependencies["getReader"]>().mockResolvedValue(CLIENT),
    prepare: vi.fn<DroneLocalizationDependencies["prepare"]>().mockResolvedValue(undefined),
    findWatercourses: vi.fn<DroneLocalizationDependencies["findWatercourses"]>().mockResolvedValue({
      watercourses: [],
      numberMatched: 0,
      numberReturned: 0,
      paginationComplete: true,
    }),
  };
  return { deps, original };
}
describe("authorized canonical-original localization boundary", () => {
  it("queries the full server-validated camera bounds only after explicit all-photos selection", async () => {
    const { deps } = await fixture();
    const originals = await Promise.all(
      [9.26, 9.2601, 9.2602, 9.2603, 9.28, 9.2801].map((lng, index) => rows(index + 1, lng)),
    );
    deps.loadRows.mockImplementation(
      async (_client, _project, id) => originals.find((row) => row.media.id === id)!,
    );
    const input = { ...INPUT, mediaIds: originals.map((row) => row.media.id) };
    const initial = await executeLocalizeDroneOriginals(input, ACTOR_ID, CLIENT, deps);
    expect(initial.clusters.map((cluster) => cluster.mediaIds.length)).toEqual([4, 2]);
    expect(deps.findWatercourses).toHaveBeenCalledTimes(2);
    expect(initial.combinedCluster?.searchStatus).toBe("pending");
    deps.findWatercourses.mockClear();
    const combined = await executeLocalizeDroneOriginals(
      { ...input, selection: "all_photos" },
      ACTOR_ID,
      CLIENT,
      deps,
    );
    expect(deps.findWatercourses).toHaveBeenCalledExactlyOnceWith(
      combined.combinedCluster?.searchBounds,
    );
    expect(combined.combinedCluster?.mediaIds).toHaveLength(6);
    expect(combined.combinedCluster?.searchStatus).toBe("complete");
    expect(combined.clusters.map((cluster) => cluster.searchStatus)).toEqual([
      "pending",
      "pending",
    ]);
    expect(JSON.stringify(combined)).not.toMatch(/PRIVATE-SERIAL|storage_path|signedUrl|intents/);
  });
  it("does not fetch a combined source query for distant or missing GPS originals", async () => {
    for (const longitude of [10.5, null]) {
      const { deps } = await fixture();
      const originals = await Promise.all([rows(1, 9.26), rows(2, longitude)]);
      deps.loadRows.mockImplementation(
        async (_client, _project, id) => originals.find((row) => row.media.id === id)!,
      );
      const result = await executeLocalizeDroneOriginals(
        { ...INPUT, mediaIds: originals.map((row) => row.media.id), selection: "all_photos" },
        ACTOR_ID,
        CLIENT,
        deps,
      );
      expect(deps.findWatercourses).not.toHaveBeenCalled();
      expect(result.combinedCluster?.searchStatus).toBe(
        longitude === null ? undefined : "too_broad",
      );
    }
  });
  it("allows a viewer to read proposals while checking access before privileged or external reads", async () => {
    const { deps } = await fixture();
    const result = await executeLocalizeDroneOriginals(INPUT, ACTOR_ID, CLIENT, deps);
    expect(deps.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      deps.loadRows.mock.invocationCallOrder[0],
    );
    expect(deps.loadRows.mock.invocationCallOrder[0]).toBeLessThan(
      deps.getReader.mock.invocationCallOrder[0],
    );
    expect(deps.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      deps.findWatercourses.mock.invocationCallOrder[0],
    );
    expect(deps.findWatercourses.mock.invocationCallOrder[0]).toBeLessThan(
      deps.prepare.mock.invocationCallOrder[1],
    );
    expect(deps.authorize).toHaveBeenCalledTimes(4);
    expect(result.photos[0]).toMatchObject({
      mediaId: MEDIA_ID,
      status: "located",
      cameraPosition: { latitude: 55.35, longitude: 9.26, geometryRole: "camera_position_only" },
    });
    expect(result).toMatchObject({
      actorId: ACTOR_ID,
      projectId: PROJECT_ID,
      requiresConfirmation: true,
      georeferenced: false,
      reportEligible: false,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE-SERIAL|storage_path|signedUrl|user_metadata|intents/,
    );
  });
  it.each([
    { latitude: 55 },
    { sourceUrl: "https://foreign.invalid" },
    { storagePath: "private" },
    { originalSha256: "a".repeat(64) },
  ])("rejects browser-supplied location or provenance %j before any access", async (extra) => {
    const { deps } = await fixture();
    await expect(
      executeLocalizeDroneOriginals({ ...INPUT, ...extra } as never, ACTOR_ID, CLIENT, deps),
    ).rejects.toThrow();
    expect(deps.authorize).not.toHaveBeenCalled();
  });
  it("rejects changed caller, duplicate IDs, empty selections and more than 200 photos", async () => {
    for (const raw of [
      { ...INPUT, expectedCallerUserId: PROJECT_ID },
      { ...INPUT, mediaIds: [] },
      { ...INPUT, mediaIds: [MEDIA_ID, MEDIA_ID] },
      {
        ...INPUT,
        mediaIds: Array.from(
          { length: 201 },
          (_, i) => `60000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        ),
      },
    ]) {
      const { deps } = await fixture();
      await expect(executeLocalizeDroneOriginals(raw, ACTOR_ID, CLIENT, deps)).rejects.toThrow();
      expect(deps.loadRows).not.toHaveBeenCalled();
      expect(deps.findWatercourses).not.toHaveBeenCalled();
    }
  });
  it("rejects foreign project membership before loading originals or service credentials", async () => {
    const { deps } = await fixture();
    deps.authorize.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(executeLocalizeDroneOriginals(INPUT, ACTOR_ID, CLIENT, deps)).rejects.toThrow(
      "Project access denied",
    );
    expect(deps.loadRows).not.toHaveBeenCalled();
    expect(deps.getReader).not.toHaveBeenCalled();
  });
  it.each(["project", "validation", "object", "checksum"])(
    "rejects altered %s provenance before external requests",
    async (change) => {
      const { deps, original } = await fixture();
      if (change === "project") original.media.project_id = ACTOR_ID;
      if (change === "validation")
        original.upload.original_validation.metadata!.position!.longitude = 10;
      if (change === "object") original.media.storage_object_version = "replacement";
      if (change === "checksum") original.upload.original_validation_sha256 = "a".repeat(64);
      await expect(executeLocalizeDroneOriginals(INPUT, ACTOR_ID, CLIENT, deps)).rejects.toThrow();
      expect(deps.getReader).not.toHaveBeenCalled();
      expect(deps.findWatercourses).not.toHaveBeenCalled();
    },
  );
  it("rechecks exact object state after source retrieval and discards a replaced original", async () => {
    const { deps } = await fixture();
    deps.prepare
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Changed original"));
    await expect(executeLocalizeDroneOriginals(INPUT, ACTOR_ID, CLIENT, deps)).rejects.toThrow(
      "Changed original",
    );
    expect(deps.findWatercourses).toHaveBeenCalledTimes(1);
  });
  it("rejects membership revoked while the external source was being queried", async () => {
    const { deps } = await fixture();
    deps.authorize
      .mockResolvedValueOnce({ canPersist: true, role: "editor", centroid: null })
      .mockResolvedValueOnce({ canPersist: true, role: "editor", centroid: null })
      .mockRejectedValue(new ProjectAccessDeniedError());
    await expect(executeLocalizeDroneOriginals(INPUT, ACTOR_ID, CLIENT, deps)).rejects.toThrow(
      "Project access denied",
    );
    expect(deps.findWatercourses).toHaveBeenCalledTimes(1);
  });
  it("gives a safe unavailable state without exposing credential-bearing upstream errors", async () => {
    const { deps } = await fixture();
    deps.findWatercourses.mockRejectedValue(
      new Error("https://upstream.invalid?apikey=DO-NOT-EXPOSE"),
    );
    const result = await executeLocalizeDroneOriginals(INPUT, ACTOR_ID, CLIENT, deps);
    expect(result.clusters[0].searchStatus).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("DO-NOT-EXPOSE");
    expect(deps.prepare).toHaveBeenCalledTimes(2);
  });
  it("never uses the project centroid when the original has no GPS", async () => {
    const { deps } = await fixture();
    deps.loadRows.mockResolvedValue(await rows(1, null));
    const result = await executeLocalizeDroneOriginals(INPUT, ACTOR_ID, CLIENT, deps);
    expect(result.photos[0].status).toBe("missing_gps");
    expect(result.clusters).toEqual([]);
    expect(deps.findWatercourses).not.toHaveBeenCalled();
  });
  it("makes at most three source calls across several separate flights", async () => {
    const { deps } = await fixture();
    const originals = await Promise.all(
      [9, 9.2, 9.4, 9.6].map((lng, index) => rows(index + 1, lng)),
    );
    deps.loadRows.mockImplementation(
      async (_client, _project, mediaId) => originals.find((row) => row.media.id === mediaId)!,
    );
    const result = await executeLocalizeDroneOriginals(
      { ...INPUT, mediaIds: originals.map((row) => row.media.id) },
      ACTOR_ID,
      CLIENT,
      deps,
    );
    expect(deps.findWatercourses).toHaveBeenCalledTimes(3);
    expect(deps.prepare).toHaveBeenCalledTimes(8);
    expect(result.clusters.map((cluster) => cluster.searchStatus)).toEqual([
      "complete",
      "complete",
      "complete",
      "call_limit",
    ]);
  });
  it("default current-original RPC rejects mismatched returned object identity", async () => {
    const { deps } = await fixture();
    const { prepare: _mock, ...overrides } = deps;
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { media: {}, upload: {}, object: {} }, error: null });
    overrides.getReader.mockResolvedValue({ rpc } as never);
    await expect(
      executeLocalizeDroneOriginals(INPUT, ACTOR_ID, CLIENT, overrides),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledWith("prepare_project_media_original_read", {
      p_project_id: PROJECT_ID,
      p_media_id: MEDIA_ID,
      p_actor_id: ACTOR_ID,
    });
    expect(deps.findWatercourses).not.toHaveBeenCalled();
  });
});
