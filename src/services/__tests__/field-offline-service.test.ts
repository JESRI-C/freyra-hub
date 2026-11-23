import { readOriginalMetadata, sha256 } from "../monitoring/drone-ingest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
import { FieldWorkPackSchema, type FieldWorkPack } from "@/lib/field-offline";
const state = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  project: null as unknown,
  access: vi.fn(),
  capability: vi.fn(),
  rpc: vi.fn(),
  fail: "",
  actor: "00000000-0000-4000-8000-000000000001",
}));
vi.mock("@/lib/field-job-access.functions", () => ({ getFieldJobAccess: state.access }));
vi.mock("@/lib/work-order-access.functions", () => ({
  getProjectWorkOrderAccess: state.capability,
}));
vi.mock("@/services/monitoring/drone-ingest", () => ({
  sha256: vi.fn(),
  readOriginalMetadata: vi.fn(),
}));
vi.mock("@/services/field-photo-upload-service", () => ({ uploadFieldPhoto: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: state.actor } }, error: null }) },
  },
  createActorBoundSupabaseClient: () => ({
    rpc: state.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        single: async () => ({ data: state.project, error: null }),
        maybeSingle: async () => ({
          data: state.project,
          error: state.fail === "projects" ? { code: "FETCH_ERROR" } : null,
        }),
        range: async (start: number, end: number) => ({
          data: (state.tables[table] ?? []).slice(start, end + 1),
          error: state.fail === table ? { code: "42501" } : null,
        }),
      };
      return query;
    },
  }),
}));
import {
  downloadFieldWorkPack,
  prepareOfflinePhoto,
  prepareOfflineJob,
  offlineSyncDependencies,
  requireOfflineProjectAccess,
} from "../field-offline-service";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  project = id(2),
  org = id(3),
  action = id(4);
const metadata = (n: number) => ({
  id: id(n),
  organization_id: org,
  project_id: project,
  version: 1,
  request_id: id(n + 100),
  created_by: actor,
  created_at: "2026-11-04T04:00:00Z",
});
const card = (n: number) => ({
  ...metadata(n),
  template_id: id(n + 200),
  definition: {
    schema: "freyra.field-job-template/v1" as const,
    title: `Jobkort ${n}`,
    domain: "nature" as const,
    fields: [
      { key: "count", label: "Antal", type: "number" as const, required: true },
      { key: "checked", label: "Kontrolleret", type: "boolean" as const, required: true },
    ],
  },
});
const first = card(10),
  second = card(11);
const required = (t: typeof first) => ({
  templateVersionId: t.id,
  templateId: t.template_id,
  version: t.version,
  definition: t.definition,
});
const plan = () => ({
  ...metadata(20),
  action_id: action,
  correction_reason: "",
  plan: {
    ...emptyWorkOrderPlan("Feltbesøg"),
    profile: "nature",
    requiredJobCards: [required(first), required(second)],
  },
});
const pack = (): FieldWorkPack => ({
  actorId: actor,
  projectId: project,
  organizationId: org,
  projectName: "Testsag",
  savedAt: Date.now(),
  jobs: [
    {
      actionId: action,
      title: "Feltbesøg",
      template: null,
      latest: null,
      registrations: [],
      requirements: {
        planVersionId: id(20),
        planVersion: 1,
        cards: [first, second],
        canRecord: true,
      },
    },
  ],
});
const input = (templateVersionId = first.id) => ({
  templateVersionId,
  values: { count: 0, checked: false },
  status: "recorded",
  correctionReason: "Feltbesøg på gemt grundlag",
});
beforeEach(() => {
  vi.clearAllMocks();
  state.fail = "";
  state.project = { id: project, name: "Testsag", organization_id: org };
  state.tables = {
    actions: [{ id: action, project_id: project, title: "Feltbesøg" }],
    field_job_template_versions: [
      first,
      second,
      {
        ...first,
        id: id(12),
        version: 2,
        definition: { ...first.definition, title: "Ny skabelon" },
      },
    ],
    field_job_versions: [],
    work_order_plan_versions: [plan()],
  };
  state.access.mockResolvedValue({ userId: actor, projectId: project, canContribute: true });
  state.capability.mockResolvedValue({
    user_id: actor,
    action_id: action,
    project_id: project,
    organization_id: org,
    can_execute: true,
  });
  state.rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
    name === "get_work_order_photo_capture_access"
      ? Promise.resolve({
          data: {
            actionId: args.p_action_id,
            organizationId: org,
            projectId: project,
            actorId: actor,
            canCapture: true,
          },
          error: null,
        })
      : { abortSignal: async () => ({ data: [{ id: id(30) }], error: null }) },
  );
});
describe("required job cards in the existing offline workflow", () => {
  it("blocks a revoked project after an opaque access failure is confirmed by an RLS read", async () => {
    state.access.mockRejectedValueOnce(new Error("Opaque server-function failure"));
    state.project = null;
    await expect(requireOfflineProjectAccess(actor, project)).rejects.toMatchObject({
      disposition: "blocked",
    });
  });
  it("retries an indeterminate access failure while the actor can still read the project", async () => {
    state.access.mockRejectedValueOnce(new Error("Opaque server-function failure"));
    await expect(requireOfflineProjectAccess(actor, project)).rejects.toMatchObject({
      disposition: "retry",
    });
  });
  it("does not turn an unavailable confirmation read into a revoked-access claim", async () => {
    state.access.mockRejectedValueOnce(new Error("Opaque server-function failure"));
    state.project = null;
    state.fail = "projects";
    await expect(requireOfflineProjectAccess(actor, project)).rejects.toMatchObject({
      disposition: "retry",
    });
  });
  it("downloads exact required versions before a first field registration exists", async () => {
    const result = await downloadFieldWorkPack(actor, project);
    expect(result.jobs[0]).toMatchObject({
      template: null,
      latest: null,
      registrations: [],
      requirements: {
        planVersionId: id(20),
        canRecord: true,
        cards: [
          { id: first.id, version: 1 },
          { id: second.id, version: 1 },
        ],
      },
    });
    expect(result.jobs[0].requirements!.cards[0].definition.title).toBe(first.definition.title);
    expect(FieldWorkPackSchema.parse(result)).toEqual(result);
  });
  it("preserves the last actual answers separately for each template", async () => {
    const one = {
      ...metadata(30),
      action_id: action,
      template_version_id: first.id,
      version: 1,
      values: { count: 0, checked: false },
      status: "recorded",
      correction_reason: null,
    };
    const two = {
      ...one,
      id: id(31),
      template_version_id: second.id,
      version: 2,
      values: { count: 8, checked: true },
    };
    state.tables.field_job_versions = [one, two];
    const result = await downloadFieldWorkPack(actor, project);
    expect(result.jobs[0].latest?.id).toBe(two.id);
    expect(result.jobs[0].registrations?.map((v) => v.values.count)).toEqual([8, 0]);
  });
  it("refuses an incomplete or foreign template source instead of replacing a saved pack", async () => {
    state.tables.field_job_template_versions = [second];
    await expect(downloadFieldWorkPack(actor, project)).rejects.toThrow("præcise version");
    state.tables.field_job_template_versions = [{ ...first, organization_id: id(99) }, second];
    await expect(downloadFieldWorkPack(actor, project)).rejects.toThrow("samme sag");
    state.fail = "work_order_plan_versions";
    await expect(downloadFieldWorkPack(actor, project)).rejects.toThrow("fuldstændigt");
  });
  it("stores capability as a local hint and refuses a foreign actor capability", async () => {
    state.capability.mockResolvedValueOnce({
      user_id: actor,
      action_id: action,
      project_id: project,
      organization_id: org,
      can_execute: false,
    });
    const result = await downloadFieldWorkPack(actor, project);
    expect(result.jobs[0].requirements?.canRecord).toBe(false);
    expect(() => prepareOfflineJob(result, action, input(), [])).toThrow("udførelsesadgang");
    state.capability.mockResolvedValueOnce({
      user_id: id(99),
      action_id: action,
      project_id: project,
      organization_id: org,
      can_execute: true,
    });
    await expect(downloadFieldWorkPack(actor, project)).rejects.toThrow("adgang");
  });
  it("chains different required cards on the same task without inventing a server version", () => {
    const source = pack();
    const one = prepareOfflineJob(source, action, input(), []);
    const two = prepareOfflineJob(source, action, input(second.id), [one]);
    expect(one).toMatchObject({
      kind: "job",
      payload: {
        expectedVersion: 0,
        requiredPlanVersionId: id(20),
        values: { count: 0, checked: false },
      },
    });
    expect(two).toMatchObject({
      dependsOn: one.id,
      payload: { expectedVersion: 1, templateVersionId: second.id, requiredPlanVersionId: id(20) },
    });
    expect(() => prepareOfflineJob(source, action, input(id(99)), [])).toThrow();
    source.jobs[0].requirements!.planVersionId = id(21);
    expect(() => prepareOfflineJob(source, action, input(), [one])).toThrow("ældre plan");
  });
  it("retains the legacy API and chooses the atomic plan endpoint for a required card", async () => {
    const current = prepareOfflineJob(pack(), action, input(), []);
    const deps = offlineSyncDependencies(
      () => true,
      () => {},
    );
    await deps.sendJob(
      current as Extract<typeof current, { kind: "job" }>,
      new AbortController().signal,
    );
    expect(state.rpc).toHaveBeenLastCalledWith(
      "save_field_job_version_for_plan",
      expect.objectContaining({
        p_required_plan_version_id: id(20),
        p_expected_version: 0,
        p_request_id: current.id,
      }),
    );
    const old = {
      ...current,
      payload: { ...(current as Extract<typeof current, { kind: "job" }>).payload },
    };
    delete old.payload.requiredPlanVersionId;
    await deps.sendJob(
      old as Extract<typeof current, { kind: "job" }>,
      new AbortController().signal,
    );
    expect(state.rpc).toHaveBeenLastCalledWith(
      "save_field_job_version",
      expect.not.objectContaining({ p_required_plan_version_id: expect.anything() }),
    );
  });

  it("captures task photos before a first card and disables a cancelled capture hint", async () => {
    const current = plan();
    current.plan.requiredJobCards = [];
    state.tables.work_order_plan_versions = [current];
    const ready = await downloadFieldWorkPack(actor, project);
    expect(ready.jobs[0].photoCaptureAllowed).toBe(true);
    expect(ready.jobs[0].requirements).toBeUndefined();
    state.rpc.mockResolvedValueOnce({
      data: {
        actionId: action,
        organizationId: org,
        projectId: project,
        actorId: actor,
        canCapture: false,
      },
      error: null,
    });
    expect((await downloadFieldWorkPack(actor, project)).jobs[0].photoCaptureAllowed).toBe(false);
  });
  it("rejects an unverifiable capture hint instead of replacing the offline pack", async () => {
    state.rpc.mockResolvedValueOnce({
      data: {
        actionId: action,
        organizationId: org,
        projectId: project,
        actorId: id(99),
        canCapture: true,
      },
      error: null,
    });
    await expect(downloadFieldWorkPack(actor, project)).rejects.toThrow("Fotoets opgaveadgang");
  });
  it("snapshots capture context before asynchronous metadata extraction", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof readOriginalMetadata>>) => void;
    vi.mocked(readOriginalMetadata).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    vi.mocked(sha256).mockResolvedValueOnce("a".repeat(64));
    const context = {
      schema: "freyra.field-photo-work-order/v1" as const,
      organizationId: org,
      actionId: action,
      planVersionId: id(20),
    };
    const pending = prepareOfflinePhoto(
      actor,
      project,
      new File(["original"], "before.jpg", { type: "image/jpeg" }),
      "Førtilstand",
      "",
      context,
    );
    context.actionId = id(99);
    resolve({ latitude: null, longitude: null, capturedAt: null } as Awaited<
      ReturnType<typeof readOriginalMetadata>
    >);
    const item = await pending;
    expect(item.payload.workOrder?.actionId).toBe(action);
    expect(item.payload.workOrder?.planVersionId).toBe(id(20));
  });
});
