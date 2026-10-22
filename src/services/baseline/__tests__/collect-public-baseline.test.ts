import { describe, expect, it, vi } from "vitest";
import { collectPublicBaselineSources } from "../collect-public-baseline.server";
import { baselineSha256, baselineSnapshotFromRow } from "../public-baseline-service";
import type { PublicBaselineSource } from "../public-baseline-types";
import {
  makeManifest,
  PROJECT_ID,
  ACTOR_ID,
  REQUEST_ID,
  SNAPSHOT_ID,
  COLLECTED_AT,
} from "./public-baseline.fixtures";

const defaults = vi.hoisted(() => ({
  dmi: vi.fn(),
  sentinel: vi.fn(),
  raster: vi.fn(),
  nature: vi.fn(),
  monitoring: vi.fn(),
  ortho: vi.fn(),
  polygons: vi.fn(),
  cadastral: vi.fn(),
  soil: vi.fn(),
}));
vi.mock("../dmi-historical-source", () => ({ fetchDmiHistoricalSource: defaults.dmi }));
vi.mock("../sentinel-preview.server", () => ({
  fetchFrozenSentinelSceneSource: defaults.sentinel,
}));
vi.mock("../cadastral-source.server", () => ({ fetchCadastralSource: defaults.cadastral }));
vi.mock("../soil-type-source.server", () => ({ fetchSoilTypeSource: defaults.soil }));
vi.mock("../datafordeler-raster-inventory.server", () => ({
  fetchDatafordelerRasterInventorySource: defaults.raster,
}));
vi.mock("../water-plan-nature-source.server", () => ({
  fetchWaterPlanNatureSource: defaults.nature,
}));

vi.mock("../public-monitoring-stations-source.server", () => ({
  fetchPublicMonitoringStationsSource: defaults.monitoring,
}));
vi.mock("../orthophoto-preview.server", () => ({ fetchOrthophotoPreviewSource: defaults.ortho }));
vi.mock("../planting-polygon-sources.server", () => ({
  fetchPlantingPolygonSource: defaults.polygons,
}));

async function source(id: string): Promise<PublicBaselineSource> {
  const manifest = await makeManifest();
  const initial = manifest.sources.find((s) => s.id === id)!;
  const payload = { contextOnly: true, usableForProjectMeasurements: false };
  return {
    ...initial,
    mode: "live",
    status: "partial",
    payload,
    payloadSha256: await baselineSha256(payload),
    error: null,
  };
}

describe("authorized public baseline collection", () => {
  it("loads raster and nature server adapters through default collection and retains their results", async () => {
    const manifest = await makeManifest();
    const raster = await source("orthophoto-terrain");
    defaults.dmi.mockResolvedValue(await source("dmi-historical"));
    defaults.sentinel.mockResolvedValue(await source("sentinel-2-scenes"));
    defaults.raster.mockResolvedValue(raster);
    const nature = await source("water-plan-nature");
    defaults.nature.mockResolvedValue(nature);
    const monitoring = await source("public-monitoring-stations");
    defaults.monitoring.mockResolvedValue(monitoring);
    defaults.ortho.mockResolvedValue(await source("orthophoto-preview"));
    defaults.polygons.mockImplementation((id: string) => source(id));
    defaults.cadastral.mockResolvedValue(await source("cadastral-parcels"));
    defaults.soil.mockResolvedValue(await source("soil-type"));
    expect(defaults.raster).not.toHaveBeenCalled();
    expect(defaults.nature).not.toHaveBeenCalled();
    const collected = await collectPublicBaselineSources(manifest);
    expect(defaults.raster).toHaveBeenCalledTimes(1);
    expect(defaults.cadastral).toHaveBeenCalledTimes(1);
    expect(defaults.soil).toHaveBeenCalledTimes(1);
    expect(collected.sources.find((s) => s.id === "cadastral-parcels")).toEqual(
      await source("cadastral-parcels"),
    );
    expect(defaults.raster).toHaveBeenCalledWith({
      polygon: manifest.project.polygon,
      dateFrom: manifest.period.from,
      dateTo: manifest.period.to,
      geometrySha256: manifest.project.polygonSha256,
    });
    expect(collected.sources.find((s) => s.id === "orthophoto-terrain")).toEqual(raster);
    expect(defaults.nature).toHaveBeenCalledTimes(1);
    expect(defaults.nature).toHaveBeenCalledWith(defaults.raster.mock.calls[0][0]);
    expect(collected.sources.find((s) => s.id === "water-plan-nature")).toEqual(nature);
    expect(defaults.monitoring).toHaveBeenCalledTimes(1);
    expect(defaults.monitoring).toHaveBeenCalledWith(defaults.raster.mock.calls[0][0]);
    expect(collected.sources.find((s) => s.id === "public-monitoring-stations")).toEqual(
      monitoring,
    );
  });
  it("binds collectors to the saved polygon and dates and reloads the same saved sources", async () => {
    const manifest = await makeManifest();
    const dmi = vi.fn().mockResolvedValue(await source("dmi-historical"));
    const sentinel = vi.fn().mockResolvedValue(await source("sentinel-2-scenes"));
    const raster = vi.fn().mockResolvedValue(await source("orthophoto-terrain"));
    const nature = vi.fn().mockResolvedValue(await source("water-plan-nature"));
    const collected = await collectPublicBaselineSources(manifest, {
      dmi,
      sentinel,
      raster,
      nature,

      monitoring: vi.fn().mockResolvedValue(await source("public-monitoring-stations")),
    });
    expect(dmi).toHaveBeenCalledWith({
      polygon: manifest.project.polygon,
      dateFrom: manifest.period.from,
      dateTo: manifest.period.to,
      geometrySha256: manifest.project.polygonSha256,
    });
    expect(sentinel).toHaveBeenCalledWith(dmi.mock.calls[0][0]);
    expect(raster).toHaveBeenCalledWith(dmi.mock.calls[0][0]);
    expect(nature).toHaveBeenCalledWith(dmi.mock.calls[0][0]);
    expect(collected.sources.filter((s) => s.id === "water-plan-nature")).toHaveLength(1);
    expect(collected.sources.filter((s) => s.id === "orthophoto-terrain")).toHaveLength(1);
    expect(collected.sources.filter((s) => s.id === "dmi-historical")).toHaveLength(1);
    const reopened = await baselineSnapshotFromRow({
      id: SNAPSHOT_ID,
      project_id: PROJECT_ID,
      version_no: 1,
      created_by: ACTOR_ID,
      created_at: COLLECTED_AT,
      request_id: REQUEST_ID,
      manifest: collected,
      manifest_sha256: await baselineSha256(collected),
    });
    expect(reopened.manifest).toEqual(collected);
    expect(dmi).toHaveBeenCalledTimes(1);
    expect(raster).toHaveBeenCalledTimes(1);
    expect(nature).toHaveBeenCalledTimes(1);
  });
  it("records one unavailable source while preserving the other source's actual response", async () => {
    const manifest = await makeManifest();
    const sentinelResult = await source("sentinel-2-scenes");
    const collected = await collectPublicBaselineSources(manifest, {
      dmi: vi.fn().mockRejectedValue(new Error("internal provider failure")),
      sentinel: vi.fn().mockResolvedValue(sentinelResult),
      raster: vi.fn().mockResolvedValue(await source("orthophoto-terrain")),
      nature: vi.fn().mockResolvedValue(await source("water-plan-nature")),

      monitoring: vi.fn().mockResolvedValue(await source("public-monitoring-stations")),
    });
    const dmi = collected.sources.find((s) => s.id === "dmi-historical")!;
    expect(dmi).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
    });
    expect(dmi.error?.message).not.toContain("internal provider");
    expect(collected.sources.find((s) => s.id === "sentinel-2-scenes")).toEqual(sentinelResult);
  });
  it.each(["id", "geometry", "period", "payload"])(
    "rejects a corrupted %s binding before persistence",
    async (field) => {
      const manifest = await makeManifest();
      const dmi = await source("dmi-historical");
      if (field === "id") dmi.id = "other-source";
      if (field === "geometry") dmi.query.geometrySha256 = "a".repeat(64);
      if (field === "period") dmi.query.requestedTo = "2026-10-01";
      if (field === "payload") dmi.payload = { fabricated: true };
      await expect(
        collectPublicBaselineSources(manifest, {
          dmi: vi.fn().mockResolvedValue(dmi),
          sentinel: vi.fn().mockResolvedValue(await source("sentinel-2-scenes")),
          raster: vi.fn().mockResolvedValue(await source("orthophoto-terrain")),
          nature: vi.fn().mockResolvedValue(await source("water-plan-nature")),

          monitoring: vi.fn().mockResolvedValue(await source("public-monitoring-stations")),
        }),
      ).rejects.toThrow();
    },
  );

  it("records a raster failure without replacing other saved sources or inventing coverage", async () => {
    const manifest = await makeManifest();
    const original = structuredClone(manifest);
    const originalHash = await baselineSha256(manifest);
    const dmiResult = await source("dmi-historical");
    const collected = await collectPublicBaselineSources(manifest, {
      dmi: vi.fn().mockResolvedValue(dmiResult),
      sentinel: vi.fn().mockResolvedValue(await source("sentinel-2-scenes")),
      raster: vi.fn().mockRejectedValue(new Error("private provider URL apiKey=must-not-escape")),
      nature: vi.fn().mockResolvedValue(await source("water-plan-nature")),

      monitoring: vi.fn().mockResolvedValue(await source("public-monitoring-stations")),
    });
    expect(collected.sources.find((s) => s.id === "orthophoto-terrain")).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
      error: { code: "COLLECTOR_FAILED" },
    });
    expect(JSON.stringify(collected)).not.toContain("must-not-escape");
    expect(collected.sources.find((s) => s.id === "dmi-historical")).toEqual(dmiResult);
    expect(manifest).toEqual(original);
    expect(await baselineSha256(manifest)).toBe(originalHash);
  });

  it.each(["id", "geometry", "period", "payload"])(
    "rejects corrupted raster %s bindings before persistence",
    async (field) => {
      const manifest = await makeManifest();
      const raster = await source("orthophoto-terrain");
      if (field === "id") raster.id = "other-source";
      if (field === "geometry") raster.query.geometrySha256 = "a".repeat(64);
      if (field === "period") raster.query.requestedTo = "2026-10-01";
      if (field === "payload") raster.payload = { fabricated: true };
      await expect(
        collectPublicBaselineSources(manifest, {
          dmi: vi.fn().mockResolvedValue(await source("dmi-historical")),
          sentinel: vi.fn().mockResolvedValue(await source("sentinel-2-scenes")),
          raster: vi.fn().mockResolvedValue(raster),
          nature: vi.fn().mockResolvedValue(await source("water-plan-nature")),

          monitoring: vi.fn().mockResolvedValue(await source("public-monitoring-stations")),
        }),
      ).rejects.toThrow();
    },
  );
  it("records a nature failure without inventing zero candidates or modifying saved snapshots", async () => {
    const manifest = await makeManifest();
    const original = structuredClone(manifest);
    const dmiResult = await source("dmi-historical");
    const collected = await collectPublicBaselineSources(manifest, {
      dmi: vi.fn().mockResolvedValue(dmiResult),
      sentinel: vi.fn().mockResolvedValue(await source("sentinel-2-scenes")),
      raster: vi.fn().mockResolvedValue(await source("orthophoto-terrain")),
      nature: vi.fn().mockRejectedValue(new Error("private upstream diagnostics must-not-escape")),

      monitoring: vi.fn().mockResolvedValue(await source("public-monitoring-stations")),
    });
    expect(collected.sources.find((s) => s.id === "water-plan-nature")).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
      coverage: { spatial: "unknown", temporal: "unknown", returnedCount: null },
      error: { code: "COLLECTOR_FAILED" },
    });
    expect(JSON.stringify(collected)).not.toContain("must-not-escape");
    expect(collected.sources.find((s) => s.id === "dmi-historical")).toEqual(dmiResult);
    expect(manifest).toEqual(original);
  });

  it.each(["id", "geometry", "period", "payload"])(
    "rejects corrupted nature %s bindings before persistence",
    async (field) => {
      const manifest = await makeManifest();
      const nature = await source("water-plan-nature");
      if (field === "id") nature.id = "other-source";
      if (field === "geometry") nature.query.geometrySha256 = "a".repeat(64);
      if (field === "period") nature.query.requestedTo = "2026-10-01";
      if (field === "payload") nature.payload = { fabricated: true };
      await expect(
        collectPublicBaselineSources(manifest, {
          dmi: vi.fn().mockResolvedValue(await source("dmi-historical")),
          sentinel: vi.fn().mockResolvedValue(await source("sentinel-2-scenes")),
          raster: vi.fn().mockResolvedValue(await source("orthophoto-terrain")),
          nature: vi.fn().mockResolvedValue(nature),

          monitoring: vi.fn().mockResolvedValue(await source("public-monitoring-stations")),
        }),
      ).rejects.toThrow();
    },
  );
});

describe("authorized generic site inventory integration", () => {
  it("records monitoring failure as unknown without modifying the old manifest or other actual source results", async () => {
    const manifest = await makeManifest();
    const original = structuredClone(manifest),
      originalHash = await baselineSha256(manifest);
    const dmi = await source("dmi-historical");
    const collected = await collectPublicBaselineSources(manifest, {
      dmi: vi.fn().mockResolvedValue(dmi),
      sentinel: vi.fn().mockResolvedValue(await source("sentinel-2-scenes")),
      raster: vi.fn().mockResolvedValue(await source("orthophoto-terrain")),
      nature: vi.fn().mockResolvedValue(await source("water-plan-nature")),
      monitoring: vi.fn().mockRejectedValue(new Error("private DO-NOT-RENDER upstream diagnostic")),
    });
    expect(
      collected.sources.find((entry) => entry.id === "public-monitoring-stations"),
    ).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
      coverage: {
        spatial: "unknown",
        temporal: "unknown",
        observedFrom: null,
        observedTo: null,
        paginationComplete: false,
        returnedCount: null,
      },
      error: { code: "COLLECTOR_FAILED" },
    });
    expect(JSON.stringify(collected)).not.toContain("DO-NOT-RENDER");
    expect(collected.sources.find((entry) => entry.id === "dmi-historical")).toEqual(dmi);
    expect(manifest).toEqual(original);
    expect(await baselineSha256(manifest)).toBe(originalHash);
  });
  it("reopens an old unimplemented monitoring snapshot without collecting or rewriting that source", async () => {
    const manifest = await makeManifest();
    const original = structuredClone(manifest),
      originalHash = await baselineSha256(manifest);
    const beforeCalls = defaults.monitoring.mock.calls.length;
    const reopened = await baselineSnapshotFromRow({
      id: SNAPSHOT_ID,
      project_id: PROJECT_ID,
      version_no: 1,
      created_by: ACTOR_ID,
      created_at: COLLECTED_AT,
      request_id: REQUEST_ID,
      manifest,
      manifest_sha256: originalHash,
    });
    expect(reopened.manifest).toEqual(original);
    expect(
      reopened.manifest.sources.find((entry) => entry.id === "public-monitoring-stations"),
    ).toMatchObject({ status: "not_implemented", payload: null });
    expect(defaults.monitoring.mock.calls.length).toBe(beforeCalls);
    expect(await baselineSha256(manifest)).toBe(originalHash);
  });
  it.each(["id", "geometry", "period", "payload"])(
    "rejects corrupted monitoring %s bindings before persistence",
    async (field) => {
      const manifest = await makeManifest(),
        monitoring = await source("public-monitoring-stations");
      if (field === "id") monitoring.id = "other-source";
      if (field === "geometry") monitoring.query.geometrySha256 = "a".repeat(64);
      if (field === "period") monitoring.query.requestedTo = "2026-10-01";
      if (field === "payload") monitoring.payload = { fabricated: true };
      await expect(
        collectPublicBaselineSources(manifest, {
          dmi: vi.fn().mockResolvedValue(await source("dmi-historical")),
          sentinel: vi.fn().mockResolvedValue(await source("sentinel-2-scenes")),
          raster: vi.fn().mockResolvedValue(await source("orthophoto-terrain")),
          nature: vi.fn().mockResolvedValue(await source("water-plan-nature")),
          monitoring: vi.fn().mockResolvedValue(monitoring),
        }),
      ).rejects.toThrow();
    },
  );
});
