import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  assert: vi.fn(),
  save: vi.fn(),
  tables: {} as Record<string, unknown[]>,
  calls: [] as { table: string; filters: Record<string, unknown> }[],
}));
vi.mock("@/services/project-workspace-service", () => ({
  assertProjectScope: mocks.assert,
  saveWorkspaceEntry: mocks.save,
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      mocks.calls.push({ table, filters });
      const result = () => ({ data: mocks.tables[table] ?? null, error: null });
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return q;
        },
        single: async () => ({ data: mocks.tables[table]?.[0] ?? null, error: null }),
        in: async () => result(),
      };
      return q;
    },
  },
}));
import { saveActionExecution } from "../action-execution-service";
import { emptyExecution, executionSource } from "@/lib/action-execution";
const id = "00000000-0000-4000-8000-000000000001";
const scope = { organizationId: "org-a", projectId: "project-a" };
describe("execution persistence reuses scoped immutable notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tables = { actions: [{ id }] };
    mocks.calls = [];
  });
  it("checks action scope and uses stable identity instead of duplicating first revisions", async () => {
    await saveActionExecution(scope, emptyExecution(id));
    expect(mocks.assert).toHaveBeenCalledWith(scope);
    expect(mocks.calls[0]).toEqual({ table: "actions", filters: { id, project_id: "project-a" } });
    expect(mocks.save.mock.calls[0][1]).toMatchObject({
      kind: "decision_note",
      entryId: id,
      payload: { source: executionSource(id) },
    });
  });
  it("does not save against a missing or foreign action", async () => {
    mocks.tables.actions = [];
    await expect(saveActionExecution(scope, emptyExecution(id))).rejects.toThrow("Handlingen");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects inaccessible attachments and round references before any write", async () => {
    for (const input of [
      { ...emptyExecution(id), evidenceIds: [id] },
      { ...emptyExecution(id), surveyRoundId: id },
    ])
      await expect(saveActionExecution(scope, input)).rejects.toThrow("ikke tilgængelig");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires a correction reason and preserves exact action and project", async () => {
    const previous = {
      kind: "decision_note",
      project_id: scope.projectId,
      organization_id: scope.organizationId,
      payload: { source: executionSource(id) },
    } as never;
    await expect(saveActionExecution(scope, emptyExecution(id), previous)).rejects.toThrow(
      "årsagen",
    );
    await saveActionExecution(
      scope,
      { ...emptyExecution(id), correctionReason: "SYNTHETIC correction" },
      previous,
    );
    expect(mocks.save.mock.calls[0][1].previous).toBe(previous);
    await expect(
      saveActionExecution(
        { ...scope, projectId: "foreign" },
        { ...emptyExecution(id), correctionReason: "correction" },
        previous,
      ),
    ).rejects.toThrow("anden");
  });
});
