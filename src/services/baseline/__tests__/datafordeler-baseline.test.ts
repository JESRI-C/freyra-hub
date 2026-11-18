import { describe, expect, it, vi } from "vitest";
import type { SavedOfficialWatercourseReach } from "@/lib/watercourse-reach.functions";
import {
  executeCreateProjectBaseline,
  executeGetProjectBaseline,
} from "@/lib/public-baseline.functions";
import {
  buildDatafordelerWatercourseGeometryUrl,
  DATAFORDELER_WATERCOURSE_PROVIDER,
  DATAFORDELER_WATERCOURSE_ATTRIBUTION,
  DATAFORDELER_WATERCOURSE_DISCLAIMER,
} from "@/services/geospatial/datafordeler-watercourse-source";
import { hasOfficialWatercourseProvenance } from "@/services/geospatial/watercourse-source-provenance";
import {
  baselineSha256,
  baselineSnapshotFromRow,
  buildPublicBaselineManifest,
  validatePublicBaselineManifest,
} from "../public-baseline-service";
import {
  ACTOR_ID,
  COLLECTED_AT,
  INPUT,
  PROJECT,
  PROJECT_ID,
  REFERENCE,
  SNAPSHOT_ID,
  makeManifest,
  makeSnapshot,
} from "./public-baseline.fixtures";

function modernReference(): SavedOfficialWatercourseReach {
  return {
    ...REFERENCE,
    sourceProvider: DATAFORDELER_WATERCOURSE_PROVIDER,
    sourceCrs: "EPSG:4326" as const,
    sourceAxisOrder: "lat-lng" as const,
    datasetVersion: "static-2025-09" as const,
    sourceRegisteredAt: "2024-02-23T10:41:59Z",
    sourceValidFrom: "2024-02-23T10:41:59Z",
    officialLengthM: 10_000,
    modifiedAt: null,
    geometryVersion: null,
    sourceUrl: buildDatafordelerWatercourseGeometryUrl(REFERENCE.id),
    attribution: DATAFORDELER_WATERCOURSE_ATTRIBUTION,
    disclaimer: DATAFORDELER_WATERCOURSE_DISCLAIMER,
    municipalities: [],
  };
}
async function modernManifest() {
  const reference = modernReference();
  return buildPublicBaselineManifest(INPUT, PROJECT, reference, reference, COLLECTED_AT);
}

describe("versioned Datafordeler baseline provenance", () => {
  it("retains static source dates and key-free identity through JSONB reorder/reload", async () => {
    const manifest = await modernManifest();
    expect(manifest.schema).toBe("gofreyra.public-baseline/v2");
    expect(manifest.reference.modifiedAt).toBeNull();
    expect(manifest.reference.geometryVersion).toBeNull();
    expect(manifest.sources[0].datasetVersion).toBe("static-2025-09");
    expect(manifest.sources[0].fetchedAt).toBe(COLLECTED_AT);
    expect(manifest.reference.sourceRegisteredAt).toBe("2024-02-23T10:41:59Z");
    expect(new URL(manifest.reference.sourceUrl).searchParams.has("apikey")).toBe(false);
    const reordered = Object.fromEntries(Object.entries(manifest).reverse());
    const hash = await baselineSha256(manifest);
    const snapshot = await makeSnapshot(reordered as typeof manifest);
    expect(snapshot.manifestSha256).toBe(hash);
    expect(snapshot.manifest.reference).toEqual(manifest.reference);
    expect(snapshot.manifest.sources[0].payload).toEqual(manifest.reference);
  });

  it("preserves exact v1 shape/hash and reopens it without calling the retired source", async () => {
    const manifest = await makeManifest();
    expect(manifest.schema).toBe("gofreyra.public-baseline/v1");
    expect(manifest.reference).not.toHaveProperty("sourceProvider");
    const snapshot = await makeSnapshot(manifest);
    expect(snapshot.manifestSha256).toBe(await baselineSha256(manifest));
    const fetchReference = vi.fn().mockRejectedValue(new Error("DAWA retired"));
    const result = await executeGetProjectBaseline(
      { projectId: PROJECT_ID, snapshotId: SNAPSHOT_ID },
      ACTOR_ID,
      {} as never,
      {
        authorizeProject: vi
          .fn()
          .mockResolvedValue({ canPersist: false, role: "viewer", centroid: null }),
        loadSnapshot: vi.fn().mockResolvedValue(snapshot),
        fetchReference,
      },
    );
    expect(result).toEqual(snapshot);
    expect(fetchReference).not.toHaveBeenCalled();
  });

  it.each([
    [
      "legacy URL",
      (manifest: Awaited<ReturnType<typeof modernManifest>>) => {
        manifest.reference.sourceUrl = REFERENCE.sourceUrl;
      },
    ],
    [
      "wrong axis",
      (manifest: Awaited<ReturnType<typeof modernManifest>>) => {
        Object.assign(manifest.reference, { sourceAxisOrder: "lng-lat" });
      },
    ],
    [
      "newer invented dataset",
      (manifest: Awaited<ReturnType<typeof modernManifest>>) => {
        Object.assign(manifest.reference, { datasetVersion: "2026-10-13" });
      },
    ],
    [
      "partial identity",
      (manifest: Awaited<ReturnType<typeof modernManifest>>) => {
        delete manifest.reference.sourceProvider;
      },
    ],
    [
      "legacy schema relabel",
      (manifest: Awaited<ReturnType<typeof modernManifest>>) => {
        manifest.schema = "gofreyra.public-baseline/v1";
      },
    ],
    [
      "invented measured timestamp",
      (manifest: Awaited<ReturnType<typeof modernManifest>>) => {
        manifest.reference.modifiedAt = COLLECTED_AT;
      },
    ],
  ])("rejects %s rather than silently changing provenance", async (_label, mutate) => {
    const manifest = await modernManifest();
    mutate(manifest);
    await expect(validatePublicBaselineManifest(manifest)).rejects.toThrow();
  });

  it("rejects a complete source payload for a different reference even with a valid payload hash", async () => {
    const manifest = await modernManifest();
    const payload = { ...manifest.reference, name: "Another reference" };
    manifest.sources[0].payload = JSON.parse(JSON.stringify(payload));
    manifest.sources[0].payloadSha256 = await baselineSha256(payload);
    await expect(validatePublicBaselineManifest(manifest)).rejects.toThrow(
      "matcher ikke vandløbsreferencen",
    );
  });

  it("cannot collect a modern source under a saved legacy identity with identical coordinates", async () => {
    await expect(
      buildPublicBaselineManifest(INPUT, PROJECT, REFERENCE, modernReference(), COLLECTED_AT),
    ).rejects.toThrow("reference er ændret");
    expect(hasOfficialWatercourseProvenance({ ...REFERENCE, sourceCrs: "EPSG:4326" })).toBe(false);
  });

  it("selects the saved provider after authorization and before constructing the writer", async () => {
    const reference = modernReference();
    const authorizeProject = vi
      .fn()
      .mockResolvedValue({ canPersist: true, role: "editor", centroid: null });
    const fetchReference = vi.fn().mockResolvedValue(reference);
    const getWriter = vi.fn().mockResolvedValue({});
    const result = await executeCreateProjectBaseline(INPUT, ACTOR_ID, {} as never, {
      authorizeProject,
      loadProject: vi.fn().mockResolvedValue(PROJECT),
      loadReference: vi.fn().mockResolvedValue(reference),
      loadRequest: vi.fn().mockResolvedValue(null),
      fetchReference,
      collectSources: async (manifest) => manifest,
      getWriter,
      persist: async (_writer, _input, _actor, manifest) => makeSnapshot(manifest),
      now: () => COLLECTED_AT,
    });
    expect(fetchReference).toHaveBeenCalledWith(reference.id, DATAFORDELER_WATERCOURSE_PROVIDER);
    expect(authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      fetchReference.mock.invocationCallOrder[0],
    );
    expect(fetchReference.mock.invocationCallOrder[0]).toBeLessThan(
      getWriter.mock.invocationCallOrder[0],
    );
    expect(result.manifest.schema).toBe("gofreyra.public-baseline/v2");
  });

  it("rejects a database schema number inconsistent with its immutable manifest", async () => {
    const manifest = await modernManifest();
    const snapshot = await makeSnapshot(manifest);
    const row = {
      id: snapshot.id,
      project_id: snapshot.projectId,
      version_no: snapshot.version,
      created_at: snapshot.createdAt,
      created_by: snapshot.createdBy,
      request_id: snapshot.requestId,
      manifest: snapshot.manifest,
      manifest_sha256: snapshot.manifestSha256,
    };
    await expect(baselineSnapshotFromRow({ ...row, schema_version: 2 })).resolves.toEqual(snapshot);
    await expect(baselineSnapshotFromRow({ ...row, schema_version: 1 })).rejects.toThrow(
      "matcher ikke",
    );
  });
});
