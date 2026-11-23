import { describe, expect, it, vi } from "vitest";
import {
  buildDatafordelerWatercourseGeometryUrl,
  DATAFORDELER_WATERCOURSE_ATTRIBUTION,
  DATAFORDELER_WATERCOURSE_DISCLAIMER,
} from "@/services/geospatial/datafordeler-watercourse-source";
import { baselineSha256, buildPublicBaselineManifest } from "../public-baseline-service";
import {
  buildVerificationPlanManifest,
  verificationPlanCanonicalText,
  verificationPlanSummaryFromRow,
  verificationPlanVersionFromRow,
} from "../verification-plan-persistence";
import {
  ACTOR_ID,
  COLLECTED_AT,
  INPUT,
  PROJECT,
  REFERENCE,
  makeSnapshot,
} from "./public-baseline.fixtures";
import { makePlanRow } from "./verification-plan.fixtures";

describe("immutable verification plan manifests", () => {
  it("reopens the exact stored content and stable question ID despite JSONB key reordering", async () => {
    const baseline = await makeSnapshot();
    const row = await makePlanRow(baseline);
    const original = structuredClone(row);
    row.manifest = Object.fromEntries(
      Object.entries(row.manifest).reverse(),
    ) as typeof row.manifest;
    const result = await verificationPlanVersionFromRow(row, baseline);
    expect(result.manifest).toEqual(original.manifest);
    expect(result.manifestSha256).toBe(original.manifest_sha256);
    expect(result.manifest.questions[0].id).toBe(
      `verification:${baseline.id}:official-reference-location:v1`,
    );
    expect(result.status).toBe("draft");
    expect(result.manifest.questions[0].result).toBeNull();
  });

  it("validates creation and reload entirely from the saved baseline, with no network requests", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network must not run"));
    try {
      const baseline = await makeSnapshot();
      const row = await makePlanRow(baseline);
      await verificationPlanVersionFromRow(row, baseline);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("retains the Datafordeler baseline/hash, static dates, disclaimer and original missing-source reasons", async () => {
    const reference = {
      ...REFERENCE,
      sourceProvider: "datafordeler-ds-bearbejdet-wfs/v1" as const,
      sourceCrs: "EPSG:4326" as const,
      sourceAxisOrder: "lat-lng" as const,
      datasetVersion: "static-2025-09" as const,
      sourceRegisteredAt: "2024-02-23T10:41:59Z",
      sourceValidFrom: null,
      officialLengthM: 10000,
      modifiedAt: null,
      geometryVersion: null,
      sourceUrl: buildDatafordelerWatercourseGeometryUrl(REFERENCE.id),
      attribution: DATAFORDELER_WATERCOURSE_ATTRIBUTION,
      disclaimer: DATAFORDELER_WATERCOURSE_DISCLAIMER,
    };
    const baseline = await makeSnapshot(
      await buildPublicBaselineManifest(INPUT, PROJECT, reference, reference, COLLECTED_AT),
    );
    const row = await makePlanRow(baseline);
    const plan = await verificationPlanVersionFromRow(row, baseline);
    expect(plan.manifest.baselineSchema).toBe("gofreyra.public-baseline/v2");
    expect(plan.baselineSha256).toBe(baseline.manifestSha256);
    expect(plan.manifest.questions[0].dates.sourceModifiedAt).toBeNull();
    expect(plan.manifest.questions[0].uncertainty).toContain(reference.disclaimer);
    expect(plan.manifest.baselineDataGaps).toEqual(
      baseline.manifest.sources.slice(1).map((source) => ({
        sourceId: source.id,
        provider: source.provider,
        dataset: source.dataset,
        reason: source.error!.message,
      })),
    );
    expect(baseline.manifest.reference.sourceRegisteredAt).toBe("2024-02-23T10:41:59Z");
  });

  it("keeps measured weather as context rather than a hydraulic finding", async () => {
    const baseline = await makeSnapshot();
    const source = baseline.manifest.sources[1];
    Object.assign(source, {
      mode: "live",
      status: "complete",
      payload: { synthetic: true, rain: 2 },
      error: null,
    });
    source.payloadSha256 = await baselineSha256(source.payload);
    source.quality.evidenceKind = "measurement";
    baseline.manifestSha256 = await baselineSha256(baseline.manifest);
    const plan = await verificationPlanVersionFromRow(await makePlanRow(baseline), baseline);
    expect(plan.manifest.contextSourceIds).toEqual([source.id]);
    expect(plan.manifest.baselineDataGaps.some((gap) => gap.sourceId === source.id)).toBe(false);
    expect(plan.manifest.questions).toHaveLength(1);
    expect(plan.manifest.questions[0].sourceIds).toEqual(["official-watercourse-reference"]);
  });

  it("permits an empty draft with a documented geographic limitation", async () => {
    const baseline = await makeSnapshot();
    baseline.manifest.project.polygon.coordinates[0].forEach((position) => {
      position[0] += 2;
    });
    baseline.manifest.project.polygonSha256 = await baselineSha256(
      baseline.manifest.project.polygon,
    );
    baseline.manifest.sources.forEach((source) => {
      source.query.geometrySha256 = baseline.manifest.project.polygonSha256;
    });
    baseline.manifestSha256 = await baselineSha256(baseline.manifest);
    const plan = await verificationPlanVersionFromRow(await makePlanRow(baseline), baseline);
    expect(plan.manifest.questions).toHaveLength(0);
    expect(plan.manifest.warnings).toContainEqual(expect.stringContaining("overlapper ikke"));
    expect(plan.status).toBe("draft");
  });

  it.each(["method", "date", "gap", "source", "geometry", "result", "warning"])(
    "rejects a changed %s even when an attacker supplies a matching new hash",
    async (change) => {
      const baseline = await makeSnapshot();
      const row = await makePlanRow(baseline);
      const question = row.manifest.questions[0];
      if (change === "method") question.method = "Forged method";
      if (change === "date") question.dates.sourceFetchedAt = "2026-11-10T10:00:00Z";
      if (change === "gap") row.manifest.baselineDataGaps = [];
      if (change === "source") question.sourceIds = ["unknown-source"];
      if (change === "geometry") question.area.aoi.coordinates[0][0][0] += 0.1;
      if (change === "result") (question as unknown as { result: string }).result = "supported";
      if (change === "warning") row.manifest.warnings = [];
      row.manifest_sha256 = await baselineSha256(row.manifest);
      await expect(verificationPlanVersionFromRow(row, baseline)).rejects.toThrow("matcher ikke");
    },
  );

  it("refuses a plan with a valid manifest hash but a different baseline binding", async () => {
    const baseline = await makeSnapshot();
    const row = await makePlanRow(baseline);
    row.baseline_sha256 = "a".repeat(64);
    await expect(verificationPlanVersionFromRow(row, baseline)).rejects.toThrow("matcher ikke");
  });

  it("rejects a receipt hashed from noncanonical text even if the parsed JSON is identical", async () => {
    const baseline = await makeSnapshot();
    const row = await makePlanRow(baseline);
    const noncanonicalText = JSON.stringify(row.manifest, null, 2);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(noncanonicalText),
    );
    row.manifest_sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    await expect(verificationPlanVersionFromRow(row, baseline)).rejects.toThrow("matcher ikke");
  });

  it("refuses a changed baseline before it can make or validate a plan", async () => {
    const baseline = await makeSnapshot();
    const row = await makePlanRow(baseline);
    baseline.manifest.project.name = "Changed after capture";
    await expect(verificationPlanVersionFromRow(row, baseline)).rejects.toThrow("uændrede");
    await expect(buildVerificationPlanManifest(baseline)).rejects.toThrow("uændrede");
  });

  it("rejects approvals, extra fields and unknown generator versions", async () => {
    const baseline = await makeSnapshot();
    const row = await makePlanRow(baseline);
    await expect(
      verificationPlanVersionFromRow(
        { ...row, manifest: { ...row.manifest, status: "approved" } },
        baseline,
      ),
    ).rejects.toThrow();
    await expect(
      verificationPlanVersionFromRow(
        { ...row, manifest: { ...row.manifest, reviewerId: ACTOR_ID } },
        baseline,
      ),
    ).rejects.toThrow();
    await expect(
      verificationPlanVersionFromRow({ ...row, generator_version: "unknown/v2" }, baseline),
    ).rejects.toThrow();
  });

  it("bounds UTF-8 manifest size and excludes manifests from metadata summaries", async () => {
    expect(() => verificationPlanCanonicalText({ text: "æ".repeat(1024 * 1024) })).toThrow("2 MiB");
    const row = await makePlanRow();
    const summary = verificationPlanSummaryFromRow(row);
    expect(summary).not.toHaveProperty("manifest");
    expect(summary.baselineId).toBe(row.baseline_id);
    expect(() => verificationPlanSummaryFromRow({ ...row, created_at: "not-a-date" })).toThrow();
  });
});
