import { describe, expect, it, vi } from "vitest";
import {
  executeGetProjectBaseline,
  executeListProjectBaselines,
} from "@/lib/public-baseline.functions";
import {
  baselineSha256,
  baselineSnapshotFromRow,
  validatePublicBaselineManifest,
} from "../public-baseline-service";
import { isBaselineMeasuredEvidence } from "../public-baseline-types";
import {
  ACTOR_ID,
  COLLECTED_AT,
  PROJECT_ID,
  REQUEST_ID,
  SNAPSHOT_ID,
  makeManifest,
  makeSnapshot,
} from "./public-baseline.fixtures";

describe("immutable public baseline service contract", () => {
  it("rejects a returned row belonging to another requested project or snapshot ID", async () => {
    const snapshot = await makeSnapshot();
    const row = {
      id: snapshot.id,
      project_id: snapshot.projectId,
      version_no: snapshot.version,
      created_at: snapshot.createdAt,
      created_by: snapshot.createdBy,
      request_id: snapshot.requestId,
      manifest_sha256: snapshot.manifestSha256,
      manifest: snapshot.manifest,
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const client = { from: vi.fn().mockReturnValue(query) } as never;
    const overrides = {
      authorizeProject: vi
        .fn()
        .mockResolvedValue({ canPersist: false, centroid: null, role: "viewer" as const }),
    };
    await expect(
      executeGetProjectBaseline(
        { projectId: "10000000-0000-4000-8000-000000000002", snapshotId: SNAPSHOT_ID },
        ACTOR_ID,
        client,
        overrides,
      ),
    ).rejects.toThrow("ikke denne sag");
    await expect(
      executeGetProjectBaseline(
        { projectId: PROJECT_ID, snapshotId: "30000000-0000-4000-8000-000000000002" },
        ACTOR_ID,
        client,
        overrides,
      ),
    ).rejects.toThrow("ønskede reference");
  });

  it("lists only bounded metadata rows without loading or validating large manifests", async () => {
    const snapshot = await makeSnapshot();
    const row = {
      id: snapshot.id,
      project_id: snapshot.projectId,
      version_no: snapshot.version,
      created_at: snapshot.createdAt,
      created_by: snapshot.createdBy,
      request_id: snapshot.requestId,
      manifest_sha256: snapshot.manifestSha256,
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [row], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const summaries = await executeListProjectBaselines(
      { projectId: PROJECT_ID },
      ACTOR_ID,
      { from: () => query } as never,
      {
        authorizeProject: vi
          .fn()
          .mockResolvedValue({ canPersist: false, centroid: null, role: "viewer" }),
      },
    );
    expect(query.select).toHaveBeenCalledWith(
      "id,project_id,version_no,created_at,created_by,request_id,manifest_sha256",
    );
    expect(query.limit).toHaveBeenCalledWith(30);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).not.toHaveProperty("manifest");
  });

  it("reopens a version entirely from storage even after upstream sources change or fail", async () => {
    const locked = await makeSnapshot();
    const fetchReference = vi.fn().mockRejectedValue(new Error("Upstream changed"));
    const getWriter = vi.fn().mockRejectedValue(new Error("No writer needed"));
    const loaded = await executeGetProjectBaseline(
      { projectId: PROJECT_ID, snapshotId: SNAPSHOT_ID },
      ACTOR_ID,
      {} as never,
      {
        authorizeProject: vi
          .fn()
          .mockResolvedValue({ canPersist: false, centroid: null, role: "viewer" }),
        loadSnapshot: vi.fn().mockResolvedValue(locked),
        fetchReference,
        getWriter,
      },
    );
    expect(loaded).toEqual(locked);
    expect(fetchReference).not.toHaveBeenCalled();
    expect(getWriter).not.toHaveBeenCalled();
  });

  it("preserves source payload hashes through JSONB key reordering", async () => {
    const saved = await makeSnapshot();
    const source = saved.manifest.sources[0];
    const reversedPayload = Object.fromEntries(Object.entries(source.payload as object).reverse());
    source.payload = reversedPayload;
    const reversedManifest = Object.fromEntries(Object.entries(saved.manifest).reverse());
    expect(await baselineSha256(reversedManifest)).toBe(saved.manifestSha256);
    const loaded = await baselineSnapshotFromRow({
      id: saved.id,
      project_id: saved.projectId,
      version_no: saved.version,
      created_at: saved.createdAt,
      created_by: saved.createdBy,
      request_id: saved.requestId,
      manifest_sha256: saved.manifestSha256,
      manifest: reversedManifest,
    });
    expect(loaded.manifest).toEqual(saved.manifest);
  });

  it("preserves valid GeoJSON extension members instead of invalidating their saved hash", async () => {
    const manifest = await makeManifest();
    const polygonWithBbox = { ...manifest.project.polygon, bbox: [9, 55, 9.1, 55.1] };
    manifest.project.polygon = polygonWithBbox;
    manifest.project.polygonSha256 = await baselineSha256(polygonWithBbox);
    for (const source of manifest.sources)
      source.query.geometrySha256 = manifest.project.polygonSha256;
    const snapshot = await makeSnapshot(manifest);
    expect(snapshot.manifest.project.polygon).toEqual(polygonWithBbox);
    expect(snapshot.manifestSha256).toBe(await baselineSha256(manifest));
  });

  it("rejects changed source bytes or changed manifest metadata on reload", async () => {
    const saved = await makeSnapshot();
    const row = {
      id: saved.id,
      project_id: saved.projectId,
      version_no: saved.version,
      created_at: saved.createdAt,
      created_by: saved.createdBy,
      request_id: saved.requestId,
      manifest_sha256: saved.manifestSha256,
    };
    const sourceTamper = structuredClone(saved.manifest);
    sourceTamper.sources[0].payload = { madeUp: 123 };
    await expect(baselineSnapshotFromRow({ ...row, manifest: sourceTamper })).rejects.toThrow(
      "checksum",
    );
    const metadataTamper = structuredClone(saved.manifest);
    metadataTamper.project.name = "Changed after approval";
    await expect(baselineSnapshotFromRow({ ...row, manifest: metadataTamper })).rejects.toThrow(
      "manifest-checksum",
    );
  });

  it("rejects cross-project snapshots even when their checksums are internally consistent", async () => {
    const manifest = await makeManifest();
    await expect(
      baselineSnapshotFromRow({
        id: SNAPSHOT_ID,
        project_id: "10000000-0000-4000-8000-000000000002",
        version_no: 1,
        created_at: COLLECTED_AT,
        created_by: ACTOR_ID,
        request_id: REQUEST_ID,
        manifest_sha256: await baselineSha256(manifest),
        manifest,
      }),
    ).rejects.toThrow("projekt");
  });

  it("persists explicit missing sources without inventing measurements, zero counts or historic coverage", async () => {
    const manifest = await makeManifest();
    expect(manifest.sources[0]).toMatchObject({
      mode: "live",
      status: "complete",
      quality: { evidenceKind: "official_registration" },
      coverage: { temporal: "unknown" },
    });
    expect(manifest.sources.slice(1)).toHaveLength(6);
    for (const source of manifest.sources.slice(1)) {
      expect(source).toMatchObject({
        mode: "error",
        status: "not_implemented",
        payload: null,
        payloadSha256: null,
        coverage: { returnedCount: null, temporal: "unknown", spatial: "unknown" },
      });
      expect(isBaselineMeasuredEvidence(source)).toBe(false);
    }
    expect(manifest.sources.some(isBaselineMeasuredEvidence)).toBe(false);
  });

  it("never promotes an estimate, preview, failed request or partial series to a measured value", async () => {
    const manifest = await makeManifest();
    const measured = {
      ...manifest.sources[0],
      quality: { evidenceKind: "measurement" as const, method: "official-series", warnings: [] },
      coverage: {
        ...manifest.sources[0].coverage,
        spatial: "complete" as const,
        temporal: "complete" as const,
      },
    };
    expect(isBaselineMeasuredEvidence(measured)).toBe(true);
    expect(isBaselineMeasuredEvidence({ ...measured, mode: "preview" })).toBe(false);
    expect(
      isBaselineMeasuredEvidence({
        ...measured,
        quality: { ...measured.quality, evidenceKind: "estimate" },
      }),
    ).toBe(false);
    expect(isBaselineMeasuredEvidence({ ...measured, status: "partial" })).toBe(false);
    expect(
      isBaselineMeasuredEvidence({
        ...measured,
        error: { code: "TIMEOUT", message: "Missing data" },
      }),
    ).toBe(false);
    expect(
      isBaselineMeasuredEvidence({
        ...measured,
        coverage: { ...measured.coverage, paginationComplete: false },
      }),
    ).toBe(false);
  });

  it("rejects contradictory source quality flags in a saved manifest", async () => {
    const manifest = await makeManifest();
    manifest.sources[1].status = "complete";
    await expect(validatePublicBaselineManifest(manifest)).rejects.toThrow("blander");
  });

  it("limits individual manifests before performing expensive validation", async () => {
    const manifest = await makeManifest();
    manifest.sources[0].payload = "x".repeat(2 * 1024 * 1024);
    await expect(validatePublicBaselineManifest(manifest)).rejects.toThrow("2 MiB");
  });
});
