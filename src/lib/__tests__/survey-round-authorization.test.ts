import { describe, expect, it, vi } from "vitest";
import {
  executeGetSurveyRound,
  executeGetSurveyRoundAccess,
  executeListSurveyRounds,
  executeSaveSurveyRound,
  executeSaveSurveyRoundForCaller,
  type SurveyRoundDependencies,
} from "@/lib/survey-round.functions";
import { ProjectAccessDeniedError } from "@/lib/project-nature-access.server";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { ACTOR_ID, PROJECT_ID } from "@/services/baseline/__tests__/public-baseline.fixtures";
import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";

const CLIENT = {} as never;
async function dependencies(canPersist = true) {
  const fixture = await makeRoundFixture();
  const overrides = {
    authorizeProject: vi
      .fn()
      .mockResolvedValue({ canPersist, role: canPersist ? "editor" : "viewer", centroid: null }),
    loadBaseline: vi.fn().mockResolvedValue(fixture.baseline),
    loadPlan: vi.fn().mockResolvedValue(fixture.planRow),
    loadRequest: vi.fn().mockResolvedValue(null),
    loadRound: vi.fn().mockResolvedValue(fixture.row),
    listRounds: vi.fn().mockResolvedValue([fixture.row]),
    getWriter: vi.fn().mockResolvedValue(CLIENT),
    persist: vi
      .fn<SurveyRoundDependencies["persist"]>()
      .mockImplementation(async (_writer, input, actorId, manifest) => ({
        ...fixture.row,
        request_id: input.requestId,
        created_by: actorId,
        kind: input.kind,
        title: input.title,
        recording_date_from: input.recordingWindow.dateFrom,
        recording_date_to: input.recordingWindow.dateTo,
        manifest,
        manifest_sha256: await baselineSha256(manifest),
      })),
  } satisfies SurveyRoundDependencies;
  return { ...fixture, overrides };
}

describe("caller-bound immutable SurveyRound persistence", () => {
  it("denies an account switch before authorization, private reads or writer creation", async () => {
    const { input, overrides } = await dependencies();
    await expect(
      executeSaveSurveyRoundForCaller(
        { ...input, expectedCallerUserId: ACTOR_ID },
        "99000000-0000-4000-8000-000000000001",
        CLIENT,
        overrides,
      ),
    ).rejects.toThrow("Login er ændret");
    for (const operation of [
      overrides.authorizeProject,
      overrides.loadRequest,
      overrides.loadBaseline,
      overrides.loadPlan,
      overrides.getWriter,
      overrides.persist,
    ])
      expect(operation).not.toHaveBeenCalled();
  });
  it("strips the compare-only envelope and always persists the verified context actor", async () => {
    const { input, overrides } = await dependencies();
    const version = await executeSaveSurveyRoundForCaller(
      { ...input, expectedCallerUserId: ACTOR_ID },
      ACTOR_ID,
      CLIENT,
      overrides,
    );
    expect(overrides.persist).toHaveBeenCalledWith(CLIENT, input, ACTOR_ID, version.manifest);
    expect(version.manifest).not.toHaveProperty("expectedCallerUserId");
    expect(version.createdBy).toBe(ACTOR_ID);
  });
  it.each([undefined, "invalid-user-id"])(
    "requires a valid compare-only caller hint before authorization",
    async (expectedCallerUserId) => {
      const { input, overrides } = await dependencies();
      await expect(
        executeSaveSurveyRoundForCaller(
          { ...input, expectedCallerUserId } as never,
          ACTOR_ID,
          CLIENT,
          overrides,
        ),
      ).rejects.toThrow();
      expect(overrides.authorizeProject).not.toHaveBeenCalled();
      expect(overrides.getWriter).not.toHaveBeenCalled();
    },
  );
  it("exposes current caller capability without private reads, a writer or caller-supplied actor", async () => {
    const { overrides } = await dependencies(false);
    expect(
      await executeGetSurveyRoundAccess({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, overrides),
    ).toEqual({
      projectId: PROJECT_ID,
      userId: ACTOR_ID,
      canPersist: false,
    });
    expect(overrides.loadBaseline).not.toHaveBeenCalled();
    expect(overrides.loadPlan).not.toHaveBeenCalled();
    expect(overrides.getWriter).not.toHaveBeenCalled();
    await expect(
      executeGetSurveyRoundAccess(
        { projectId: PROJECT_ID, actorId: "forged" } as never,
        ACTOR_ID,
        CLIENT,
        overrides,
      ),
    ).rejects.toThrow();
    overrides.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(
      executeGetSurveyRoundAccess({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, overrides),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);
  });
  it("authorizes before reading and validates both saved inputs before importing the writer", async () => {
    const { input, overrides } = await dependencies();
    const result = await executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides);
    expect(result.status).toBe("draft");
    for (const reader of [overrides.loadRequest, overrides.loadBaseline, overrides.loadPlan])
      expect(overrides.authorizeProject.mock.invocationCallOrder[0]).toBeLessThan(
        reader.mock.invocationCallOrder[0],
      );
    for (const reader of [overrides.loadBaseline, overrides.loadPlan])
      expect(reader.mock.invocationCallOrder[0]).toBeLessThan(
        overrides.getWriter.mock.invocationCallOrder[0],
      );
    expect(overrides.persist).toHaveBeenCalledWith(CLIENT, input, ACTOR_ID, result.manifest);
  });
  it("denies foreign access before any private read or writer creation", async () => {
    const { input, row, overrides } = await dependencies();
    overrides.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
    for (const action of [
      () => executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides),
      () =>
        executeGetSurveyRound(
          { projectId: PROJECT_ID, roundVersionId: row.id },
          ACTOR_ID,
          CLIENT,
          overrides,
        ),
      () => executeListSurveyRounds({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, overrides),
    ])
      await expect(action()).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    for (const reader of [
      overrides.loadRequest,
      overrides.loadBaseline,
      overrides.loadPlan,
      overrides.loadRound,
      overrides.listRounds,
      overrides.getWriter,
    ])
      expect(reader).not.toHaveBeenCalled();
  });
  it.each(["viewer", "field", "external"])(
    "denies %s creation without input or writer access",
    async (role) => {
      const { input, overrides } = await dependencies(false);
      overrides.authorizeProject.mockResolvedValue({ canPersist: false, role, centroid: null });
      await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
        "ikke rettighed",
      );
      expect(overrides.loadRequest).not.toHaveBeenCalled();
      expect(overrides.loadBaseline).not.toHaveBeenCalled();
      expect(overrides.loadPlan).not.toHaveBeenCalled();
      expect(overrides.getWriter).not.toHaveBeenCalled();
    },
  );
  it.each([
    "actorId",
    "manifest",
    "status",
    "approved",
    "reviewer",
    "photos",
    "geometry",
    "roundId",
    "supersedesId",
    "roundVersion",
  ])("rejects browser-supplied %s", async (field) => {
    const { input, overrides } = await dependencies();
    await expect(
      executeSaveSurveyRound(
        { ...input, [field]: "spoofed" } as never,
        ACTOR_ID,
        CLIENT,
        overrides,
      ),
    ).rejects.toThrow();
    expect(overrides.authorizeProject).not.toHaveBeenCalled();
    expect(overrides.getWriter).not.toHaveBeenCalled();
  });
  it("allows viewer get/list through saved input replay without a writer or source fetch", async () => {
    const { row, overrides } = await dependencies(false);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    try {
      const result = await executeGetSurveyRound(
        { projectId: PROJECT_ID, roundVersionId: row.id },
        ACTOR_ID,
        CLIENT,
        overrides,
      );
      expect(result?.manifest).toEqual(row.manifest);
      const page = await executeListSurveyRounds(
        { projectId: PROJECT_ID, roundId: row.round_id, planId: row.plan_id },
        ACTOR_ID,
        CLIENT,
        overrides,
      );
      expect(page.items[0].roundId).toBe(row.round_id);
      expect(page.items[0]).not.toHaveProperty("manifest");
      expect(overrides.getWriter).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("returns an identical retry without a writer and denies revoked access even to a prior request", async () => {
    const { input, row, overrides } = await dependencies();
    overrides.loadRequest.mockResolvedValue(row);
    const result = await executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides);
    expect(result.id).toBe(row.id);
    expect(result.manifestSha256).toBe(row.manifest_sha256);
    expect(overrides.persist).not.toHaveBeenCalled();
    expect(overrides.getWriter).not.toHaveBeenCalled();
    overrides.authorizeProject.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toBeInstanceOf(
      ProjectAccessDeniedError,
    );
  });
  it.each([
    "title",
    "kind",
    "recordingWindow",
    "questionIds",
    "planId",
    "planSha256",
    "baselineId",
    "baselineSha256",
  ])("rejects changed retry %s without writer access", async (field) => {
    const { input, row, overrides } = await dependencies();
    overrides.loadRequest.mockResolvedValue(row);
    const value =
      field === "recordingWindow"
        ? { dateFrom: "2026-10-13", dateTo: "2026-10-15" }
        : field === "questionIds"
          ? ["forged"]
          : field === "kind"
            ? "after"
            : field.endsWith("Sha256")
              ? "a".repeat(64)
              : field.endsWith("Id")
                ? "99000000-0000-4000-8000-000000000001"
                : "Changed title";
    await expect(
      executeSaveSurveyRound({ ...input, [field]: value }, ACTOR_ID, CLIENT, overrides),
    ).rejects.toThrow();
    expect(overrides.persist).not.toHaveBeenCalled();
    expect(overrides.getWriter).not.toHaveBeenCalled();
  });
  it("denies missing/foreign/corrupted saved inputs and unknown questions before a writer import", async () => {
    const { input, baseline, planRow, overrides } = await dependencies();
    overrides.loadBaseline.mockResolvedValue(null);
    await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "gemt baseline",
    );
    overrides.loadBaseline.mockResolvedValue(baseline);
    overrides.loadPlan.mockResolvedValue(null);
    await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "gemt baseline",
    );
    overrides.loadPlan.mockResolvedValue({
      ...planRow,
      project_id: "99000000-0000-4000-8000-000000000001",
    });
    await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "matcher ikke",
    );
    overrides.loadPlan.mockResolvedValue(planRow);
    overrides.loadBaseline.mockResolvedValue({ ...baseline, manifestSha256: "a".repeat(64) });
    await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toThrow();
    overrides.loadBaseline.mockResolvedValue(baseline);
    await expect(
      executeSaveSurveyRound({ ...input, questionIds: ["forged"] }, ACTOR_ID, CLIENT, overrides),
    ).rejects.toThrow("faktiske spørgsmål");
    expect(overrides.getWriter).not.toHaveBeenCalled();
  });
  it("fails closed on writer errors or an otherwise-valid receipt with the wrong actor/request/content", async () => {
    const { input, row, overrides } = await dependencies();
    for (const change of [
      { created_by: "99000000-0000-4000-8000-000000000001" },
      { request_id: "99000000-0000-4000-8000-000000000001" },
    ]) {
      overrides.persist.mockResolvedValue({ ...row, ...change });
      await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
        "bekræftede ikke",
      );
    }
    const manifest = { ...row.manifest, title: "Changed valid title" };
    overrides.persist.mockResolvedValue({
      ...row,
      title: manifest.title,
      manifest,
      manifest_sha256: await baselineSha256(manifest),
    });
    await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "bekræftede ikke",
    );
    overrides.getWriter.mockRejectedValue(new Error("Writer unavailable"));
    overrides.persist.mockClear();
    await expect(executeSaveSurveyRound(input, ACTOR_ID, CLIENT, overrides)).rejects.toThrow(
      "Writer unavailable",
    );
    expect(overrides.persist).not.toHaveBeenCalled();
  });
  it("returns null for a missing version but denies a mismatched row before input reads", async () => {
    const { row, overrides } = await dependencies(false);
    overrides.loadRound.mockResolvedValue(null);
    expect(
      await executeGetSurveyRound(
        { projectId: PROJECT_ID, roundVersionId: row.id },
        ACTOR_ID,
        CLIENT,
        overrides,
      ),
    ).toBeNull();
    overrides.loadRound.mockResolvedValue({
      ...row,
      project_id: "99000000-0000-4000-8000-000000000001",
    });
    await expect(
      executeGetSurveyRound(
        { projectId: PROJECT_ID, roundVersionId: row.id },
        ACTOR_ID,
        CLIENT,
        overrides,
      ),
    ).rejects.toThrow("matcher ikke");
    expect(overrides.loadBaseline).not.toHaveBeenCalled();
    expect(overrides.loadPlan).not.toHaveBeenCalled();
  });
  it("keeps stable descending cursors and rejects duplicate, foreign or out-of-filter page receipts", async () => {
    const { row, overrides } = await dependencies(false);
    const rows = [5, 4, 3].map((version) => ({
      ...row,
      id: `91000000-0000-4000-8000-00000000000${version}`,
      round_id: `92000000-0000-4000-8000-00000000000${version}`,
      version_no: version,
    }));
    overrides.listRounds.mockResolvedValue(rows);
    const page = await executeListSurveyRounds(
      {
        projectId: PROJECT_ID,
        baselineId: row.baseline_id,
        planId: row.plan_id,
        beforeVersion: 6,
        limit: 2,
      },
      ACTOR_ID,
      CLIENT,
      overrides,
    );
    expect(page.items.map((item) => item.version)).toEqual([5, 4]);
    expect(page.nextBeforeVersion).toBe(4);
    expect(overrides.loadBaseline).not.toHaveBeenCalled();
    expect(overrides.loadPlan).not.toHaveBeenCalled();
    for (const changed of [
      [rows[0], rows[0]],
      [rows[1], rows[0]],
      [{ ...row, project_id: "99000000-0000-4000-8000-000000000001" }],
    ]) {
      overrides.listRounds.mockResolvedValue(changed);
      await expect(
        executeListSurveyRounds({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, overrides),
      ).rejects.toThrow("rækkefølge");
    }
    overrides.listRounds.mockResolvedValue(rows);
    await expect(
      executeListSurveyRounds(
        { projectId: PROJECT_ID, roundId: row.round_id },
        ACTOR_ID,
        CLIENT,
        overrides,
      ),
    ).rejects.toThrow("rækkefølge");
    expect(overrides.getWriter).not.toHaveBeenCalled();
  });
  it.each([0, 31, -1, 1.5])("denies invalid list bound %s", async (limit) => {
    const { overrides } = await dependencies();
    await expect(
      executeListSurveyRounds({ projectId: PROJECT_ID, limit }, ACTOR_ID, CLIENT, overrides),
    ).rejects.toThrow();
    expect(overrides.authorizeProject).not.toHaveBeenCalled();
  });
});
