import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    inputValidator() {
      return this;
    },
    handler(value: unknown) {
      return value;
    },
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { executeGetSurveyRound, type SurveyRoundDependencies } from "@/lib/survey-round.functions";
import {
  executeGetVerificationPlan,
  type VerificationPlanDependencies,
} from "@/lib/verification-plan.functions";
import { ProjectAccessDeniedError } from "@/lib/project-nature-access.server";
import {
  baselineSnapshotFromRow,
  canonicalBaselineJson,
} from "@/services/baseline/public-baseline-service";
import { surveyRoundVersionFromRow } from "@/services/baseline/survey-round-persistence";
import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";
import type { VerifiedInputContext } from "@/services/baseline/verified-input-context";
const CLIENT = {} as never;
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const f = await makeRoundFixture();
  const contexts: VerifiedInputContext[] = [];
  const baselineRow = {
    id: f.baseline.id,
    project_id: f.baseline.projectId,
    version_no: f.baseline.version,
    created_at: f.baseline.createdAt,
    created_by: f.baseline.createdBy,
    request_id: f.baseline.requestId,
    manifest_sha256: f.baseline.manifestSha256,
    manifest: f.baseline.manifest,
  };
  const authorizeProject = vi.fn(async () => ({
    canPersist: false,
    role: "viewer" as const,
    centroid: null,
  }));
  const loadBaseline = vi.fn<SurveyRoundDependencies["loadBaseline"]>(
    async (_client, _project, _baseline, context) => {
      expect(authorizeProject).toHaveBeenCalled();
      expect(context).toBeDefined();
      contexts.push(context!);
      return baselineSnapshotFromRow(baselineRow, context);
    },
  );
  const noWriter = vi.fn(async () => {
    throw new Error("Read path must not create a privileged writer");
  });
  const shared = {
    authorizeProject,
    loadBaseline,
    loadPlan: vi.fn(async () => f.planRow),
    getWriter: noWriter,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled in isolated server source test");
    }),
  );
  return { ...f, contexts, shared, noWriter, baselineRow };
}
describe("current-authorized request-local immutable read integration", () => {
  it("retains one normalized baseline and exact verified plan when a legacy dependency loader ignores the optional context", async () => {
    const f = await setup();
    const overrides = {
      ...f.shared,
      loadBaseline: vi.fn(async () => f.baseline),
      loadRound: vi.fn(async () => f.row),
    };
    const round = await executeGetSurveyRound(
      { projectId: f.baseline.projectId, roundVersionId: f.row.id },
      f.row.created_by,
      CLIENT,
      overrides,
    );
    const plan = await executeGetVerificationPlan(
      { projectId: f.baseline.projectId, planId: f.planRow.id },
      f.row.created_by,
      CLIENT,
      overrides,
    );
    expect(round?.manifestSha256).toBe(f.row.manifest_sha256);
    expect(plan?.manifestSha256).toBe(f.plan.manifestSha256);
    expect(overrides.loadBaseline).toHaveBeenCalledTimes(2);
    expect(f.noWriter).not.toHaveBeenCalled();
  });
  it("preserves the exact Round result while reusing one request-local scope across baseline and plan replay", async () => {
    const f = await setup();
    const expected = await surveyRoundVersionFromRow(f.row, f.baseline, f.planRow);
    const loadRound = vi.fn(async () => f.row);
    const result = await executeGetSurveyRound(
      { projectId: f.baseline.projectId, roundVersionId: f.row.id },
      f.row.created_by,
      CLIENT,
      { ...f.shared, loadRound },
    );
    expect(canonicalBaselineJson(result)).toBe(canonicalBaselineJson(expected));
    expect(f.contexts).toHaveLength(1);
    expect(f.noWriter).not.toHaveBeenCalled();
    expect(f.shared.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      loadRound.mock.invocationCallOrder[0],
    );
    expect(f.shared.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      f.shared.loadBaseline.mock.invocationCallOrder[0],
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("creates separate scopes and rechecks authorization for repeated reads, then denies revoked access before private input loads", async () => {
    const f = await setup();
    const overrides = { ...f.shared, loadRound: vi.fn(async () => f.row) };
    for (let n = 0; n < 2; n++)
      await executeGetSurveyRound(
        { projectId: f.baseline.projectId, roundVersionId: f.row.id },
        f.row.created_by,
        CLIENT,
        overrides,
      );
    expect(f.contexts).toHaveLength(2);
    expect(f.contexts[0]).not.toBe(f.contexts[1]);
    f.shared.authorizeProject.mockRejectedValueOnce(new ProjectAccessDeniedError());
    await expect(
      executeGetSurveyRound(
        { projectId: f.baseline.projectId, roundVersionId: f.row.id },
        f.row.created_by,
        CLIENT,
        overrides,
      ),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    expect(f.shared.authorizeProject).toHaveBeenCalledTimes(3);
    expect(f.shared.loadBaseline).toHaveBeenCalledTimes(2);
    expect(overrides.loadRound).toHaveBeenCalledTimes(2);
  });
  it("keeps plan replay scoped to its authorized call and distinct from a Round read", async () => {
    const f = await setup();
    const plan = await executeGetVerificationPlan(
      { projectId: f.baseline.projectId, planId: f.planRow.id },
      f.row.created_by,
      CLIENT,
      f.shared as Partial<VerificationPlanDependencies>,
    );
    const round = await executeGetSurveyRound(
      { projectId: f.baseline.projectId, roundVersionId: f.row.id },
      f.row.created_by,
      CLIENT,
      { ...f.shared, loadRound: vi.fn(async () => f.row) },
    );
    expect(plan?.manifestSha256).toBe(f.plan.manifestSha256);
    expect(round?.planSha256).toBe(plan?.manifestSha256);
    expect(f.contexts).toHaveLength(2);
    expect(f.contexts[0]).not.toBe(f.contexts[1]);
    expect(f.noWriter).not.toHaveBeenCalled();
  });
  it("rejects a tampered source payload in a fresh read rather than trusting a prior request’s validated input", async () => {
    const f = await setup();
    const overrides = { ...f.shared, loadRound: vi.fn(async () => f.row) };
    await executeGetSurveyRound(
      { projectId: f.baseline.projectId, roundVersionId: f.row.id },
      f.row.created_by,
      CLIENT,
      overrides,
    );
    const changed = structuredClone(f.baselineRow);
    (changed.manifest.sources[0].payload as Record<string, unknown>).name =
      "Synthetic changed source";
    f.shared.loadBaseline.mockImplementationOnce(async (_client, _project, _baseline, context) =>
      baselineSnapshotFromRow(changed, context),
    );
    await expect(
      executeGetSurveyRound(
        { projectId: f.baseline.projectId, roundVersionId: f.row.id },
        f.row.created_by,
        CLIENT,
        overrides,
      ),
    ).rejects.toThrow();
    expect(f.noWriter).not.toHaveBeenCalled();
  });
  it("rejects an account denial before plan or baseline reads", async () => {
    const f = await setup();
    f.shared.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(
      executeGetVerificationPlan(
        { projectId: f.baseline.projectId, planId: f.planRow.id },
        f.row.created_by,
        CLIENT,
        f.shared as Partial<VerificationPlanDependencies>,
      ),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    expect(f.shared.loadPlan).not.toHaveBeenCalled();
    expect(f.shared.loadBaseline).not.toHaveBeenCalled();
    expect(f.contexts).toEqual([]);
  });
});
