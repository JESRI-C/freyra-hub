import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ assert: vi.fn(), save: vi.fn(), list: vi.fn(), media: vi.fn() }));
vi.mock("@/services/project-workspace-service", () => ({
  assertProjectScope: mocks.assert,
  saveWorkspaceEntry: mocks.save,
}));
vi.mock("@/services/action-execution-service", () => ({ listActionExecutions: mocks.list }));
vi.mock("@/services/project-media-service", () => ({ getProjectMedia: mocks.media }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));
import { inspectPhotoComparison, savePhotoComparison } from "../photo-comparison-service";
import { emptyExecution } from "@/lib/action-execution";
const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const scope = { projectId: uuid(9), organizationId: uuid(10) };
const input = {
  schema: "freyra.photo-comparison/v1" as const,
  comparisonId: uuid(1),
  executionRevisionId: uuid(2),
  beforeId: uuid(3),
  afterId: uuid(4),
  parameter: "visible_vegetation" as const,
  samePlaceEvidence: "",
  commonCoverage: "unknown" as const,
  coverageDescription: "",
  excludedAreas: "",
  captureDifferences: "",
  conclusion: "",
  correctionReason: "",
  quantitative: false as const,
};
describe("comparison scope and draft persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([
      {
        id: uuid(2),
        entry_id: uuid(5),
        version: 1,
        kind: "decision_note",
        created_at: "2026-10-28",
        payload: {
          source: "action-execution:" + uuid(5),
          decision: JSON.stringify(emptyExecution(uuid(5))),
        },
      },
    ]);
    mocks.media.mockImplementation(async (_project: string, id: string) => ({
      data: {
        id,
        projectId: scope.projectId,
        sha256: id === uuid(3) ? "a".repeat(64) : "b".repeat(64),
      },
    }));
    mocks.save.mockResolvedValue({ id: uuid(11) });
  });
  it("preserves insufficient material as a limited draft rather than fabricating success", async () => {
    const result = await savePhotoComparison(scope, input);
    expect(result.assessment.status).toBe("insufficient");
    expect(mocks.save.mock.calls[0][1].payload.uncertainty).toContain("Faktisk udførelse");
    expect(mocks.media).toHaveBeenCalledWith(scope.projectId, input.beforeId);
  });
  it("rejects a foreign execution revision before resolving images", async () => {
    await expect(
      inspectPhotoComparison(scope, { ...input, executionRevisionId: uuid(6) }),
    ).rejects.toThrow("findes ikke");
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("refuses inaccessible originals rather than saving a successful pair", async () => {
    mocks.media.mockResolvedValue({ data: null, error: "revoked" });
    await expect(savePhotoComparison(scope, input)).rejects.toThrow("ikke tilgængelig");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not move a saved comparison to another project", async () => {
    const previous = {
      project_id: "foreign",
      organization_id: scope.organizationId,
      kind: "decision_note",
      payload: { source: "photo-comparison:" + input.comparisonId },
    } as never;
    await expect(
      savePhotoComparison(scope, { ...input, correctionReason: "SYNTHETIC correction" }, previous),
    ).rejects.toThrow("anden sag");
  });
});
