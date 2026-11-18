import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyExecution } from "@/lib/action-execution";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  assert: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  pairs: vi.fn(),
  sources: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/services/project-workspace-service", () => ({ assertProjectScope: mocks.assert }));
vi.mock("@/services/action-execution-service", () => ({ listActionExecutions: mocks.list }));
vi.mock("@/services/photo-comparison-service", () => ({
  listPhotoComparisons: vi.fn(async () => []),
  latestPhotoComparisons: mocks.pairs,
  inspectPhotoComparison: vi.fn(async () => ({
    assessment: { status: "descriptive", gaps: [] },
    before: {},
    after: { localCaptureDate: "2026-10-01" },
  })),
}));
vi.mock("@/services/baseline/public-baseline-service", () => ({ baselineSha256: vi.fn() }));
vi.mock("@/services/workflow-followup-service", () => ({
  listWorkflowFollowups: vi.fn(async () => []),
}));
vi.mock("@/services/report-document-service", () => ({
  loadReportSources: mocks.sources,
  saveReportDocument: mocks.save,
}));
import { buildWorkflowReportContent, saveWorkflowReport } from "../workflow-report-service";
describe("workflow schema compatibility gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("does not write a report against an environment without the guard migration", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    await expect(
      saveWorkflowReport({ organizationId: "org", projectId: "project" }),
    ).rejects.toThrow("inputkontrol");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not collect customer inputs when project access is denied", async () => {
    mocks.assert.mockRejectedValueOnce(new Error("project denied"));
    await expect(
      saveWorkflowReport({ organizationId: "org", projectId: "foreign" }),
    ).rejects.toThrow("project denied");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

it.each([false, true])(
  "links photos within a comparison report (standalone: %s)",
  async (standalone) => {
    const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const scope = { organizationId: uuid(1), projectId: uuid(2) };
    const execution = { ...emptyExecution(uuid(3)), evidenceIds: [uuid(4)] };
    const comparison = {
      schema: "freyra.photo-comparison/v1",
      comparisonId: uuid(6),
      executionRevisionId: standalone ? null : uuid(5),
      beforeId: uuid(7),
      afterId: uuid(8),
      parameter: "visible_vegetation",
      samePlaceEvidence: "Fælles pejlemærke",
      commonCoverage: "limited",
      coverageDescription: "Samme delstrækning",
      excludedAreas: "",
      captureDifferences: "",
      conclusion: "Synligt åbent vandspejl",
      correctionReason: "",
      quantitative: false,
    };
    const entry = (id: string, entryId: string, source: string, value: object) => ({
      id,
      entry_id: entryId,
      project_id: scope.projectId,
      organization_id: scope.organizationId,
      version: 1,
      kind: "decision_note",
      title: "Registrering",
      created_at: "2026-10-01T10:00:00Z",
      created_by: uuid(9),
      payload: { source, decision: JSON.stringify(value), basis: "Feltlog" },
    });
    mocks.assert.mockResolvedValue({ name: "Teststrækning" });
    mocks.list.mockResolvedValue(
      standalone ? [] : [entry(uuid(5), uuid(3), `action-execution:${uuid(3)}`, execution)],
    );
    mocks.pairs.mockReturnValue([
      { comparison, entry: entry(uuid(10), uuid(6), `photo-comparison:${uuid(6)}`, comparison) },
    ]);
    const executionId = `evidence:${uuid(4)}`;
    const beforeId = `media:${uuid(7)}`;
    const afterId = `media:${uuid(8)}`;
    mocks.sources.mockResolvedValue([
      { id: executionId, title: "Driftslog", capturedAt: null },
      { id: beforeId, title: "Førfoto.jpg", capturedAt: "2026-09-16T10:00:00Z" },
      { id: afterId, title: "Efterfoto.jpg", capturedAt: null },
    ]);

    const report = await buildWorkflowReportContent(scope);

    expect(report.templateId).toBe("before_after");
    expect(report.sections.find(({ title }) => title === "Faktisk udførelse")?.sourceIds).toEqual(
      standalone ? [] : [executionId],
    );
    expect(report.workflowSnapshot?.inputs).toHaveLength(standalone ? 1 : 2);
    expect(report.sections.find(({ title }) => title === "Før og efter")).toMatchObject({
      sourceIds: [beforeId, afterId],
      text: expect.stringContaining(
        `Førfoto.jpg (2026-09-16) · ${standalone ? "senere foto" : "efter"}: Efterfoto.jpg (2026-10-01, lokal kameradato uden dokumenteret tidszone)`,
      ),
    });
  },
);
