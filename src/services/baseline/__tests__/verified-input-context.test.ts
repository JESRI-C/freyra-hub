import { describe, expect, it, vi } from "vitest";
import {
  createVerifiedInputContext,
  requireVerifiedInputContext,
} from "@/services/baseline/verified-input-context";
import {
  baselineSnapshotFromRow,
  baselineSha256,
  canonicalBaselineJson,
} from "@/services/baseline/public-baseline-service";
import {
  verificationPlanVersionFromRow,
  buildVerificationPlanManifest,
  validateVerificationBaseline,
} from "@/services/baseline/verification-plan-persistence";
import {
  surveyRoundVersionFromRow,
  buildSurveyRoundManifestV1,
} from "@/services/baseline/survey-round-persistence";
import { createDraftVerificationPlanV1 } from "@/services/baseline/verification-plan";
import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";
function baselineRow(f: Awaited<ReturnType<typeof makeRoundFixture>>) {
  const b = f.baseline;
  return {
    id: b.id,
    project_id: b.projectId,
    version_no: b.version,
    created_at: b.createdAt,
    created_by: b.createdBy,
    request_id: b.requestId,
    manifest_sha256: b.manifestSha256,
    manifest: structuredClone(b.manifest),
  };
}
async function scoped(f: Awaited<ReturnType<typeof makeRoundFixture>>) {
  const context = createVerifiedInputContext(),
    baseline = await baselineSnapshotFromRow(baselineRow(f), context),
    plan = await verificationPlanVersionFromRow(f.planRow, baseline, context);
  return { context, baseline, plan };
}
describe("runtime opaque request-local immutable input context", () => {
  it("preserves canonical bytes, hashes and all unknown/acceptance semantics", async () => {
    const f = await makeRoundFixture(),
      s = await scoped(f),
      a = await surveyRoundVersionFromRow(f.row, f.baseline, f.planRow),
      b = await surveyRoundVersionFromRow(f.row, s.baseline, s.plan, s.context);
    expect(canonicalBaselineJson(b)).toBe(canonicalBaselineJson(a));
    expect(
      await buildVerificationPlanManifest(s.baseline, s.plan.generatorVersion, s.context),
    ).toEqual(f.plan.manifest);
    expect(b.manifest.recordingWindow.actualCoverage).toBe("not_verified");
    expect(b.manifest.acceptance).toEqual({
      municipalScopeApproved: false,
      professionalApproved: false,
      reportAccepted: false,
    });
  });
  it("detaches and deeply freezes exact verified baseline and plan graphs", async () => {
    const f = await makeRoundFixture(),
      raw = baselineRow(f),
      rawPlan = structuredClone(f.planRow),
      context = createVerifiedInputContext(),
      baseline = await baselineSnapshotFromRow(raw, context),
      plan = await verificationPlanVersionFromRow(rawPlan, baseline, context);
    expect(baseline.manifest).not.toBe(raw.manifest);
    expect(plan.manifest).not.toBe(rawPlan.manifest);
    for (const object of [
      baseline,
      baseline.manifest,
      baseline.manifest.sources,
      baseline.manifest.sources[0].payload,
      plan,
      plan.manifest,
      plan.manifest.questions,
      plan.manifest.questions[0].area.aoi,
    ])
      expect(Object.isFrozen(object)).toBe(true);
    raw.manifest.project.name = "changed raw";
    rawPlan.manifest.questions = [];
    expect(baseline.manifest.project.name).not.toBe("changed raw");
    expect(plan.manifest.questions).toHaveLength(1);
    expect(() => {
      baseline.manifest.project.name = "mutation";
    }).toThrow();
    expect(() => {
      plan.manifest.questions.splice(0);
    }).toThrow();
    expect(await verificationPlanVersionFromRow(plan, baseline, context)).toBe(plan);
  });
  it("detaches before awaiting validation so raw concurrent mutation cannot affect trusted output", async () => {
    const f = await makeRoundFixture(),
      raw = baselineRow(f),
      context = createVerifiedInputContext(),
      pending = baselineSnapshotFromRow(raw, context);
    raw.manifest.project.name = "mutated after call";
    const result = await pending;
    expect(result.manifest.project.name).toBe(f.baseline.manifest.project.name);
    await expect(baselineSnapshotFromRow(raw, createVerifiedInputContext())).rejects.toThrow();
  });
  it.each([
    {},
    { verified: true, verifyBaseline: () => ({}) },
    { baselineFromRow: () => ({}), planFromRow: () => ({}) },
  ])("rejects fabricated runtime context %j", async (fake) => {
    const f = await makeRoundFixture();
    expect(() => requireVerifiedInputContext(fake as never)).toThrow();
    await expect(baselineSnapshotFromRow(baselineRow(f), fake as never)).rejects.toThrow();
    await expect(createDraftVerificationPlanV1(f.baseline, fake as never)).rejects.toThrow();
  });
  it("rejects prototype forgeries, proxies, clones and spread copies", async () => {
    const f = await makeRoundFixture(),
      real = createVerifiedInputContext();
    for (const fake of [
      Object.create(Object.getPrototypeOf(real)),
      new Proxy(real, {}),
      structuredClone(real),
      { ...real },
    ])
      await expect(baselineSnapshotFromRow(baselineRow(f), fake)).rejects.toThrow();
    expect(Object.isFrozen(real)).toBe(true);
    expect(Object.isFrozen(Object.getPrototypeOf(real))).toBe(true);
  });
  it("does not let a copied or cross-context plan DTO act as a trusted saved row", async () => {
    const f = await makeRoundFixture(),
      a = await scoped(f),
      b = await scoped(f);
    expect(b.context.verifiedPlan(a.plan, b.baseline)).toBeNull();
    expect(a.context.verifiedPlan(structuredClone(a.plan), a.baseline)).toBeNull();
    for (const value of [a.plan, { ...a.plan }, structuredClone(a.plan)])
      await expect(verificationPlanVersionFromRow(value, b.baseline, b.context)).rejects.toThrow();
    expect(await verificationPlanVersionFromRow(a.plan, a.baseline, a.context)).toBe(a.plan);
  });
  it("independently validates and detaches same baseline in distinct requests", async () => {
    const f = await makeRoundFixture(),
      a = await scoped(f),
      b = await scoped(f);
    expect(a.baseline).not.toBe(b.baseline);
    expect(a.plan).not.toBe(b.plan);
    expect(
      await b.context.verifyBaseline(a.baseline, a.baseline.projectId, a.baseline.id),
    ).not.toBe(a.baseline);
  });
  it.each(["project", "id"])(
    "rejects wrong expected %s on an already verified baseline",
    async (kind) => {
      const f = await makeRoundFixture(),
        s = await scoped(f),
        wrong = "ffffffff-0000-4000-8000-000000000001";
      await expect(
        validateVerificationBaseline(
          s.baseline,
          kind === "project" ? wrong : s.baseline.projectId,
          kind === "id" ? wrong : s.baseline.id,
          s.context,
        ),
      ).rejects.toThrow();
    },
  );
  it.each(["source-payload", "full-hash", "polygon", "provenance", "project", "schema"])(
    "rejects %s tampering with and without context",
    async (kind) => {
      const f = await makeRoundFixture(),
        row = baselineRow(f);
      if (kind === "source-payload") row.manifest.sources[0].payload = { tampered: true };
      if (kind === "full-hash") row.manifest_sha256 = "f".repeat(64);
      if (kind === "polygon") row.manifest.project.polygon.coordinates[0][0][0] += 0.01;
      if (kind === "provenance")
        row.manifest.reference.sourceUrl = "https://foreign.invalid/source";
      if (kind === "project") row.project_id = "ffffffff-0000-4000-8000-000000000001";
      if (kind === "schema") Object.assign(row, { schema_version: 2 });
      await expect(baselineSnapshotFromRow(row)).rejects.toThrow();
      await expect(baselineSnapshotFromRow(row, createVerifiedInputContext())).rejects.toThrow();
    },
  );
  it("never registers rejected baseline attempts as trusted", async () => {
    const f = await makeRoundFixture(),
      row = baselineRow(f),
      context = createVerifiedInputContext(),
      bad = structuredClone(row);
    bad.manifest_sha256 = "f".repeat(64);
    await expect(baselineSnapshotFromRow(bad, context)).rejects.toThrow();
    expect((await baselineSnapshotFromRow(row, context)).manifestSha256).toBe(
      f.baseline.manifestSha256,
    );
  });
  it.each(["hash", "generator", "question", "baseline"])(
    "retains exhaustive plan %s checks under context",
    async (kind) => {
      const f = await makeRoundFixture(),
        s = await scoped(f),
        row = structuredClone(f.planRow);
      if (kind === "hash") row.manifest_sha256 = "f".repeat(64);
      if (kind === "generator") row.generator_version = "unapproved/v999" as never;
      if (kind === "question") {
        row.manifest.questions[0].result = "supported" as never;
        row.manifest_sha256 = await baselineSha256(row.manifest);
      }
      if (kind === "baseline") row.baseline_sha256 = "f".repeat(64);
      await expect(verificationPlanVersionFromRow(row, s.baseline, s.context)).rejects.toThrow();
      await expect(verificationPlanVersionFromRow(row, f.baseline)).rejects.toThrow();
    },
  );
  it.each(["hash", "question", "approval", "baseline"])(
    "retains round %s checks with a verified exact plan",
    async (kind) => {
      const f = await makeRoundFixture(),
        s = await scoped(f),
        row = structuredClone(f.row);
      if (kind === "hash") row.manifest_sha256 = "f".repeat(64);
      if (kind === "question") {
        row.manifest.questionIds = ["not-from-saved-plan"];
        row.manifest_sha256 = await baselineSha256(row.manifest);
      }
      if (kind === "approval") {
        row.manifest.acceptance.professionalApproved = true as never;
        row.manifest_sha256 = await baselineSha256(row.manifest);
      }
      if (kind === "baseline") row.baseline_sha256 = "f".repeat(64);
      await expect(surveyRoundVersionFromRow(row, s.baseline, s.plan, s.context)).rejects.toThrow();
      await expect(surveyRoundVersionFromRow(row, f.baseline, f.planRow)).rejects.toThrow();
    },
  );
  it("unregistered mutable plan DTOs are fully replayed before a context builder uses them", async () => {
    const f = await makeRoundFixture(),
      s = await scoped(f),
      plan = structuredClone(f.plan);
    plan.manifest.questions[0].result = "supported" as never;
    plan.manifestSha256 = await baselineSha256(plan.manifest);
    await expect(
      buildSurveyRoundManifestV1(f.input, s.baseline, plan, s.context),
    ).rejects.toThrow();
  });
  it("standalone no-context generator retains source/hash checks", async () => {
    const f = await makeRoundFixture(),
      bad = structuredClone(f.baseline);
    bad.manifest.sources[0].payload = { changed: true };
    await expect(createDraftVerificationPlanV1(bad)).rejects.toThrow();
    await expect(buildVerificationPlanManifest(bad)).rejects.toThrow();
    await expect(buildSurveyRoundManifestV1(f.input, bad, f.plan)).rejects.toThrow();
  });
  it("rejects a prototype forgery with own shadowed brand and verification methods", async () => {
    const f = await makeRoundFixture(),
      real = createVerifiedInputContext();
    const fake = Object.create(Object.getPrototypeOf(real));
    const bypass = vi.fn(() => f.baseline);
    Object.defineProperties(fake, {
      assertRuntimeBrand: { value: () => undefined },
      verifyBaseline: { value: bypass },
      baselineFromRow: { value: bypass },
      verifyPlan: { value: () => f.plan },
    });
    expect(() => requireVerifiedInputContext(fake)).toThrow();
    await expect(baselineSnapshotFromRow(baselineRow(f), fake)).rejects.toThrow();
    await expect(buildSurveyRoundManifestV1(f.input, f.baseline, f.plan, fake)).rejects.toThrow();
    expect(bypass).not.toHaveBeenCalled();
  });
  it("normalizes a raw valid loader snapshot into the exact reusable baseline and plan pair", async () => {
    const f = await makeRoundFixture(),
      context = createVerifiedInputContext();
    const baseline = await context.verifyBaseline(f.baseline, f.baseline.projectId, f.baseline.id);
    expect(baseline).not.toBe(f.baseline);
    expect(await context.verifyBaseline(baseline, baseline.projectId, baseline.id)).toBe(baseline);
    const plan = await verificationPlanVersionFromRow(f.planRow, baseline, context);
    expect(context.verifiedPlan(plan, baseline)).toBe(plan);
    expect((await surveyRoundVersionFromRow(f.row, baseline, plan, context)).manifest).toEqual(
      f.manifest,
    );
    expect(await verificationPlanVersionFromRow(plan, baseline, context)).toBe(plan);
  });
  it("rejects constructor-derived contexts with genuine private fields but overridden methods", async () => {
    const f = await makeRoundFixture(),
      real = createVerifiedInputContext();
    const bypass = vi.fn(() => Promise.resolve(f.baseline));
    const forgedPrototype = Object.create(Object.getPrototypeOf(real));
    Object.defineProperties(forgedPrototype, {
      verifyBaseline: { value: bypass },
      baselineFromRow: { value: bypass },
    });
    const FakeConstructor = function () {};
    FakeConstructor.prototype = forgedPrototype;
    const fake = Reflect.construct(real.constructor as new () => object, [], FakeConstructor);
    expect(Object.isFrozen(fake)).toBe(true);
    expect(() => requireVerifiedInputContext(fake as never)).toThrow();
    await expect(baselineSnapshotFromRow(baselineRow(f), fake as never)).rejects.toThrow();
    expect(bypass).not.toHaveBeenCalled();
  });
  it("read replay invokes no source fetch, writer or signer", async () => {
    const f = await makeRoundFixture(),
      network = vi.fn(() => {
        throw new Error("No network in pure replay");
      });
    vi.stubGlobal("fetch", network);
    try {
      const s = await scoped(f);
      await surveyRoundVersionFromRow(f.row, s.baseline, s.plan, s.context);
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
