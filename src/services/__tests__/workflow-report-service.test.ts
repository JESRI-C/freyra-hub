import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), assert: vi.fn(), list: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/services/project-workspace-service", () => ({ assertProjectScope: mocks.assert }));
vi.mock("@/services/action-execution-service", () => ({ listActionExecutions: mocks.list }));
vi.mock("@/services/photo-comparison-service", () => ({
  listPhotoComparisons: vi.fn(async () => []),
  latestPhotoComparisons: vi.fn(() => []),
  inspectPhotoComparison: vi.fn(),
}));
vi.mock("@/services/workflow-followup-service", () => ({
  listWorkflowFollowups: vi.fn(async () => []),
}));
vi.mock("@/services/report-document-service", () => ({
  loadReportSources: vi.fn(async () => []),
  saveReportDocument: mocks.save,
}));
import { saveWorkflowReport } from "../workflow-report-service";
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
