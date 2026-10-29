import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ project: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/supabase/queries", () => ({
  fetchProjectById: mocks.project,
  fetchProjects: vi.fn(),
  fetchIndicatorsByProject: vi.fn(),
  fetchEnvironmentalRisks: vi.fn(),
  fetchDataSourcesByProject: vi.fn(),
  fetchSitesByProject: vi.fn(),
  fetchAuditEventsByProject: vi.fn(),
  fetchObservationsByProject: vi.fn(),
  fetchEvidenceFilesByProject: vi.fn(),
}));
import {
  assertProjectScope,
  saveWorkspaceEntry,
  updateProjectAction,
  createProjectAction,
} from "../project-workspace-service";
describe("workspace authorized project boundary", () => {
  beforeEach(() => vi.resetAllMocks());
  const scope = { organizationId: "org-a", projectId: "project-a" };
  it("does not read dependent resources for a project in another organization", async () => {
    mocks.project.mockResolvedValue({ id: "project-a", organization_id: "org-b" });
    await expect(assertProjectScope(scope)).rejects.toThrow("valgte organisation");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not move an existing entry to the currently selected project", async () => {
    mocks.project.mockResolvedValue({ id: "project-a", organization_id: "org-a" });
    await expect(
      saveWorkspaceEntry(scope, {
        kind: "decision_note",
        title: "Notat",
        payload: { basis: "B", source: "S" },
        previous: {
          project_id: "project-b",
          organization_id: "org-a",
          kind: "decision_note",
        } as never,
      }),
    ).rejects.toThrow("andet projekt");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("checks required evidence again before completing an action", async () => {
    mocks.project.mockResolvedValue({ id: "project-a", organization_id: "org-a" });
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { requires_evidence: true }, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null }),
    };
    mocks.from.mockReturnValue(q);
    await expect(updateProjectAction(scope, "action-a", "Lukket")).rejects.toThrow(
      "kræver registreret evidens",
    );
    expect(q.eq).toHaveBeenCalledWith("project_id", "project-a");
  });
  it("recovers a lost create reply by exact UUID, project and payload without overwriting anything", async () => {
    mocks.project.mockResolvedValue({ id: "project-a", organization_id: "org-a" });
    const actionId = "00000000-0000-4000-8000-000000000001";
    const saved = {
      id: actionId,
      project_id: "project-a",
      title: "Kontrol",
      description: "Arbejde",
    };
    const insert = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Lost reply" } }),
    };
    const read = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: saved, error: null }),
    };
    mocks.from.mockReturnValueOnce(insert).mockReturnValueOnce(read);
    await expect(createProjectAction(scope, " Kontrol ", "Arbejde", actionId)).resolves.toEqual(
      saved,
    );
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: actionId, project_id: "project-a", title: "Kontrol" }),
    );
    expect(read.eq).toHaveBeenCalledWith("id", actionId);
    expect(read.eq).toHaveBeenCalledWith("project_id", "project-a");
  });
  it.each(["title", "description", "project_id"])(
    "does not recover or overwrite a task with another %s",
    async (changed) => {
      mocks.project.mockResolvedValue({ id: "project-a", organization_id: "org-a" });
      const actionId = "00000000-0000-4000-8000-000000000001";
      const q = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ error: { message: "Duplicate identity" } }),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: actionId,
            project_id: "project-a",
            title: "Kontrol",
            description: "Arbejde",
            [changed]: "Other",
          },
          error: null,
        }),
      };
      mocks.from.mockReturnValue(q);
      await expect(createProjectAction(scope, "Kontrol", "Arbejde", actionId)).rejects.toThrow(
        "Duplicate identity",
      );
      expect(q.insert).toHaveBeenCalledTimes(1);
    },
  );
});
