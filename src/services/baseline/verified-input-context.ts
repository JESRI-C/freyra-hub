import { baselineSnapshotFromRow } from "./public-baseline-service";
import type { PublicBaselineSnapshot } from "./public-baseline-types";
import {
  buildVerificationPlanManifestUncached,
  verificationPlanVersionFromRowUncached,
  type VerificationPlanGenerator,
  type VerificationPlanManifest,
  type VerificationPlanVersion,
} from "./verification-plan-persistence";

function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

/** Runtime authority lives only in this instance's private registries. No global cache. */
class RuntimeVerifiedInputContext {
  #baselines = new WeakSet<PublicBaselineSnapshot>();
  #plans = new WeakMap<VerificationPlanVersion, PublicBaselineSnapshot>();
  #generated = new WeakMap<
    PublicBaselineSnapshot,
    Map<VerificationPlanGenerator, Promise<VerificationPlanManifest>>
  >();

  constructor() {
    Object.freeze(this);
  }

  assertRuntimeBrand(): void {
    this.#baselines.has({} as PublicBaselineSnapshot);
  }

  async baselineFromRow(value: unknown): Promise<PublicBaselineSnapshot> {
    // Detach BEFORE asynchronous checks; the caller can never mutate the checked graph.
    const result = freezeJson(await baselineSnapshotFromRow(structuredClone(value)));
    this.#baselines.add(result);
    return result;
  }

  async verifyBaseline(
    snapshot: PublicBaselineSnapshot,
    projectId: string,
    baselineId: string,
  ): Promise<PublicBaselineSnapshot> {
    if (this.#baselines.has(snapshot)) {
      if (
        snapshot.id !== baselineId ||
        snapshot.projectId !== projectId ||
        snapshot.manifest.project.id !== projectId
      )
        throw new Error("Den verificerede baseline tilhører ikke denne sag eller version.");
      return snapshot;
    }
    const detached = structuredClone(snapshot);
    // Reuse the exhaustive row boundary, including its parsed/normalized manifest.
    // A raw snapshot's unknown keys must never become a verified generator input.
    const result = freezeJson(
      await baselineSnapshotFromRow({
        id: detached.id,
        project_id: detached.projectId,
        version_no: detached.version,
        created_at: detached.createdAt,
        created_by: detached.createdBy,
        request_id: detached.requestId,
        manifest_sha256: detached.manifestSha256,
        manifest: detached.manifest,
      }),
    );
    if (result.id !== baselineId || result.projectId !== projectId)
      throw new Error("Den verificerede baseline tilhører ikke denne sag eller version.");
    this.#baselines.add(result);
    return result;
  }

  async planManifest(
    snapshot: PublicBaselineSnapshot,
    generator: VerificationPlanGenerator,
  ): Promise<VerificationPlanManifest> {
    const baseline = await this.verifyBaseline(snapshot, snapshot.projectId, snapshot.id);
    let generators = this.#generated.get(baseline);
    if (!generators) {
      generators = new Map();
      this.#generated.set(baseline, generators);
    }
    const existing = generators.get(generator);
    if (existing) return existing;
    const pending = buildVerificationPlanManifestUncached(baseline, generator, this).then(
      freezeJson,
    );
    generators.set(generator, pending);
    try {
      return await pending;
    } catch (error) {
      generators.delete(generator);
      throw error;
    }
  }

  verifiedPlan(value: unknown, baseline: PublicBaselineSnapshot): VerificationPlanVersion | null {
    if (value === null || typeof value !== "object") return null;
    return this.#plans.get(value as VerificationPlanVersion) === baseline
      ? (value as VerificationPlanVersion)
      : null;
  }

  async planFromRow(
    value: unknown,
    snapshot: PublicBaselineSnapshot,
  ): Promise<VerificationPlanVersion> {
    const baseline = await this.verifyBaseline(snapshot, snapshot.projectId, snapshot.id);
    const existing = this.verifiedPlan(value, baseline);
    if (existing) return existing;
    const detachedRow = freezeJson(structuredClone(value));
    const result = freezeJson(
      await verificationPlanVersionFromRowUncached(detachedRow, baseline, this),
    );
    this.#plans.set(result, baseline);
    return result;
  }

  async verifyPlan(
    plan: VerificationPlanVersion,
    snapshot: PublicBaselineSnapshot,
  ): Promise<VerificationPlanVersion> {
    const baseline = await this.verifyBaseline(snapshot, snapshot.projectId, snapshot.id);
    const existing = this.verifiedPlan(plan, baseline);
    if (existing) return existing;
    // An unregistered DTO is ordinary untrusted input, including a DTO from another context.
    return this.planFromRow(
      {
        id: plan.id,
        project_id: plan.projectId,
        version_no: plan.version,
        baseline_id: plan.baselineId,
        baseline_sha256: plan.baselineSha256,
        generator_version: plan.generatorVersion,
        manifest_sha256: plan.manifestSha256,
        manifest: plan.manifest,
        created_at: plan.createdAt,
        created_by: plan.createdBy,
        request_id: plan.requestId,
      },
      baseline,
    );
  }
}
Object.freeze(RuntimeVerifiedInputContext.prototype);
Object.freeze(RuntimeVerifiedInputContext);
export type VerifiedInputContext = RuntimeVerifiedInputContext;

/** Create once inside one authorized server execution; never deserialize from browser input. */
export function createVerifiedInputContext(): VerifiedInputContext {
  return new RuntimeVerifiedInputContext();
}

export function requireVerifiedInputContext(value: VerifiedInputContext): VerifiedInputContext {
  if (
    !(value instanceof RuntimeVerifiedInputContext) ||
    Object.getPrototypeOf(value) !== RuntimeVerifiedInputContext.prototype
  )
    throw new Error("Ugyldig request-lokal inputkontekst.");
  // Object.create(prototype) and proxies cannot forge the JavaScript private-field brand.
  RuntimeVerifiedInputContext.prototype.assertRuntimeBrand.call(value);
  return value;
}
