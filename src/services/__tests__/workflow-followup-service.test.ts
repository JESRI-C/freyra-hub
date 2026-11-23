import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  notes: [] as Record<string, unknown>[],
  save: vi.fn(),
  assert: vi.fn(),
  sourcesAllowed: true,
}));
vi.mock("@/services/project-workspace-service", () => ({
  assertProjectScope: mocks.assert,
  saveWorkspaceEntry: mocks.save,
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc: async (_name: string, args: Record<string, unknown>) => ({
      error: null,
      data: await mocks.save(scope, {
        entryId: args._entry_id,
        title: args._title,
        payload: args._payload,
      }),
    }),
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        like: () => q,
        order: () => q,
        range: async () => ({ data: mocks.notes, error: null }),
        in: async (_key: string, ids: string[]) => ({
          data: mocks.sourcesAllowed ? ids.map((id) => ({ id })) : [],
          error: null,
        }),
      };
      return q;
    },
  },
}));
vi.mock("@/services/action-execution-service", () => ({ listActionExecutions: vi.fn() }));
vi.mock("@/services/photo-comparison-service", () => ({
  listPhotoComparisons: vi.fn(),
  latestPhotoComparisons: vi.fn(),
  inspectPhotoComparison: vi.fn(),
}));
import { ensureWorkflowFollowups, saveWorkflowFollowup } from "../workflow-followup-service";
const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const scope = { organizationId: uuid(1), projectId: uuid(2) };
const candidate = {
  eventKey: "source-revision-1",
  title: "SYNTHETIC followup",
  reason: "SYNTHETIC missing evidence",
  sourceIds: [uuid(3)],
};
function store(input: { entryId: string; title: string; payload: unknown }) {
  const row = {
    id: uuid(10 + mocks.notes.length),
    entry_id: input.entryId,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    kind: "decision_note",
    version: 1,
    title: input.title,
    payload: input.payload,
    created_by: uuid(4),
    created_at: "2026-10-28T12:00:00Z",
  };
  mocks.notes.push(row);
  return row;
}
describe("idempotent internal followup persistence", () => {
  beforeEach(() => {
    mocks.notes = [];
    mocks.sourcesAllowed = true;
    vi.clearAllMocks();
    mocks.save.mockImplementation(async (_scope, input) => store(input));
  });
  it("creates one task for repeated events and preserves a user's dismissal", async () => {
    await ensureWorkflowFollowups(scope, [candidate, candidate]);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    const payload = mocks.notes[0].payload as Record<string, string>;
    payload.decision = JSON.stringify({
      ...JSON.parse(payload.decision),
      status: "dismissed",
      resolutionReason: "SYNTHETIC reason",
    });
    await ensureWorkflowFollowups(scope, [candidate]);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(payload.decision).status).toBe("dismissed");
    await ensureWorkflowFollowups(scope, [{ ...candidate, eventKey: "source-revision-2" }]);
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });
  it("reads the winning task after a concurrent duplicate insert", async () => {
    mocks.save.mockImplementationOnce(async (_scope, input) => {
      store(input);
      throw new Error("unique conflict");
    });
    const rows = await ensureWorkflowFollowups(scope, [candidate]);
    expect(rows).toHaveLength(1);
    expect(mocks.notes).toHaveLength(1);
  });
  it("does not turn an unrelated database error into success", async () => {
    mocks.save.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(ensureWorkflowFollowups(scope, [candidate])).rejects.toThrow(
      "database unavailable",
    );
  });
  it("refuses source revisions outside the project", async () => {
    mocks.sourcesAllowed = false;
    await expect(
      saveWorkflowFollowup(scope, {
        schema: "freyra.workflow-followup/v1",
        ...candidate,
        status: "proposed",
        assignee: null,
        dueDate: null,
        notes: "",
        resolutionReason: "",
      }),
    ).rejects.toThrow("ikke tilgængelige");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
