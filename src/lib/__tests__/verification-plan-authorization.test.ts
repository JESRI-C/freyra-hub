import { describe, expect, it, vi } from "vitest";
import {
  executeGetVerificationPlan,
  executeListVerificationPlans,
  executeSaveVerificationPlan,
  type VerificationPlanDependencies,
} from "@/lib/verification-plan.functions";
import { ProjectAccessDeniedError } from "@/lib/project-nature-access.server";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  ACTOR_ID,
  PROJECT_ID,
  SNAPSHOT_ID,
  makeSnapshot,
} from "@/services/baseline/__tests__/public-baseline.fixtures";
import {
  PLAN_ID,
  PLAN_REQUEST_ID,
  makePlanRow,
} from "@/services/baseline/__tests__/verification-plan.fixtures";

const CLIENT = {} as never;
const INPUT = { projectId: PROJECT_ID, baselineId: SNAPSHOT_ID, requestId: PLAN_REQUEST_ID };
async function dependencies(canPersist = true) {
  const baseline = await makeSnapshot();
  const row = await makePlanRow(baseline);
  const overrides = {
    authorizeProject: vi
      .fn()
      .mockResolvedValue({ canPersist, role: canPersist ? "editor" : "viewer", centroid: null }),
    loadBaseline: vi.fn().mockResolvedValue(baseline),
    loadRequest: vi.fn().mockResolvedValue(null),
    loadPlan: vi.fn().mockResolvedValue(row),
    listPlans: vi.fn().mockResolvedValue([row]),
    getWriter: vi.fn().mockResolvedValue(CLIENT),
    persist: vi
      .fn<VerificationPlanDependencies["persist"]>()
      .mockImplementation(async (_writer, _input, actorId, manifest) => ({
        ...row,
        created_by: actorId,
        manifest,
        manifest_sha256: await baselineSha256(manifest),
      })),
  } satisfies VerificationPlanDependencies;
  return { baseline, row, overrides };
}

describe("caller-bound immutable verification plans", () => {
  it("authorizes and validates the saved baseline before importing the writer", async () => {
    const { overrides } = await dependencies();
    const plan = await executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides);
    expect(plan.baselineId).toBe(SNAPSHOT_ID);
    expect(plan.status).toBe("draft");
    expect(overrides.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
      overrides.loadBaseline.mock.invocationCallOrder[0],
    );
    expect(overrides.loadBaseline.mock.invocationCallOrder[0]).toBeLessThan(
      overrides.getWriter.mock.invocationCallOrder[0],
    );
    expect(overrides.persist).toHaveBeenCalledWith(CLIENT, INPUT, ACTOR_ID, plan.manifest);
  });

  it("denies foreign access before plan/baseline reads or writer creation", async () => {
    const { overrides } = await dependencies();
    overrides.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
    for (const action of [
      () => executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides),
      () =>
        executeGetVerificationPlan(
          { projectId: PROJECT_ID, planId: PLAN_ID },
          ACTOR_ID,
          CLIENT,
          overrides,
        ),
      () => executeListVerificationPlans({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, overrides),
    ])
      await expect(action()).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    expect(overrides.loadRequest).not.toHaveBeenCalled();
    expect(overrides.loadBaseline).not.toHaveBeenCalled();
    expect(overrides.loadPlan).not.toHaveBeenCalled();
    expect(overrides.listPlans).not.toHaveBeenCalled();
    expect(overrides.getWriter).not.toHaveBeenCalled();
  });

  it.each(["viewer", "field", "external"])(
    "denies %s plan writes without touching saved inputs",
    async (role) => {
      const { overrides } = await dependencies(false);
      overrides.authorizeProject.mockResolvedValue({ canPersist: false, role, centroid: null });
      await expect(executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
        "ikke rettighed",
      );
      expect(overrides.loadBaseline).not.toHaveBeenCalled();
      expect(overrides.getWriter).not.toHaveBeenCalled();
    },
  );

  it("lets a viewer read a saved plan and metadata page without a writer", async () => {
    const { overrides, row } = await dependencies(false);
    const plan = await executeGetVerificationPlan(
      { projectId: PROJECT_ID, planId: PLAN_ID },
      ACTOR_ID,
      CLIENT,
      overrides,
    );
    expect(plan?.manifest).toEqual(row.manifest);
    const page = await executeListVerificationPlans(
      { projectId: PROJECT_ID, baselineId: SNAPSHOT_ID },
      ACTOR_ID,
      CLIENT,
      overrides,
    );
    expect(page.items[0]).not.toHaveProperty("manifest");
    expect(page.nextBeforeVersion).toBeNull();
    expect(overrides.getWriter).not.toHaveBeenCalled();
  });

  it.each(["geometry", "manifest", "actorId", "sourceUrl", "generatorVersion", "approved"])(
    "rejects browser-supplied %s",
    async (field) => {
      const { overrides } = await dependencies();
      await expect(
        executeSaveVerificationPlan(
          { ...INPUT, [field]: "spoofed" } as never,
          ACTOR_ID,
          CLIENT,
          overrides,
        ),
      ).rejects.toThrow();
      expect(overrides.authorizeProject).not.toHaveBeenCalled();
      expect(overrides.getWriter).not.toHaveBeenCalled();
    },
  );

  it("requires an actual saved baseline and rejects a foreign or corrupted baseline", async () => {
    const { overrides, baseline } = await dependencies();
    overrides.loadBaseline.mockResolvedValue(null);
    await expect(executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "gemt baselineversion",
    );
    overrides.loadBaseline.mockResolvedValue({
      ...baseline,
      projectId: "10000000-0000-4000-8000-000000000002",
    });
    await expect(executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "uændrede",
    );
    overrides.loadBaseline.mockResolvedValue({ ...baseline, manifestSha256: "a".repeat(64) });
    await expect(executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "uændrede",
    );
    expect(overrides.getWriter).not.toHaveBeenCalled();
  });

  it("retries the same request as the exact stored plan without a writer or source fetch", async () => {
    const { overrides, row } = await dependencies();
    overrides.loadRequest.mockResolvedValue(row);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No source fetch"));
    try {
      const result = await executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides);
      expect(result.id).toBe(row.id);
      expect(result.manifestSha256).toBe(row.manifest_sha256);
      expect(overrides.getWriter).not.toHaveBeenCalled();
      expect(overrides.persist).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      await expect(
        executeSaveVerificationPlan(
          { ...INPUT, baselineId: "30000000-0000-4000-8000-000000000002" },
          ACTOR_ID,
          CLIENT,
          overrides,
        ),
      ).rejects.toThrow("anden plan eller baseline");
    } finally {
      fetch.mockRestore();
    }
  });

  it("rejects a mismatched writer receipt and fails closed on writer errors", async () => {
    const { overrides, row } = await dependencies();
    overrides.persist.mockResolvedValue({
      ...row,
      request_id: "80000000-0000-4000-8000-000000000002",
    });
    await expect(executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "bekræftede ikke",
    );
    overrides.getWriter.mockRejectedValue(new Error("Writer unavailable"));
    overrides.persist.mockClear();
    await expect(executeSaveVerificationPlan(INPUT, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "Writer unavailable",
    );
    expect(overrides.persist).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent plan ID/project on load", async () => {
    const { overrides, row } = await dependencies();
    overrides.loadPlan.mockResolvedValue({ ...row, id: "70000000-0000-4000-8000-000000000002" });
    await expect(
      executeGetVerificationPlan(
        { projectId: PROJECT_ID, planId: PLAN_ID },
        ACTOR_ID,
        CLIENT,
        overrides,
      ),
    ).rejects.toThrow("matcher ikke denne sag");
    expect(overrides.loadBaseline).not.toHaveBeenCalled();
  });

  it("paginates bounded descending summaries without full manifests or a baseline read", async () => {
    const { overrides, row } = await dependencies(false);
    overrides.listPlans.mockResolvedValue(
      [5, 4, 3].map((version) => ({ ...row, version_no: version })),
    );
    const page = await executeListVerificationPlans(
      { projectId: PROJECT_ID, baselineId: SNAPSHOT_ID, beforeVersion: 6, limit: 2 },
      ACTOR_ID,
      CLIENT,
      overrides,
    );
    expect(page.items.map((item) => item.version)).toEqual([5, 4]);
    expect(page.nextBeforeVersion).toBe(4);
    expect(page.items.every((item) => !("manifest" in item))).toBe(true);
    expect(overrides.loadBaseline).not.toHaveBeenCalled();
    overrides.listPlans.mockResolvedValue([row, row]);
    await expect(
      executeListVerificationPlans({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, overrides),
    ).rejects.toThrow("rækkefølge");
  });

  it.each([0, 31, -1, 1.5])("rejects page limit %s before reading", async (limit) => {
    const { overrides } = await dependencies();
    await expect(
      executeListVerificationPlans({ projectId: PROJECT_ID, limit }, ACTOR_ID, CLIENT, overrides),
    ).rejects.toThrow();
    expect(overrides.listPlans).not.toHaveBeenCalled();
  });
});
