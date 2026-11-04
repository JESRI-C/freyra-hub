import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  bound: vi.fn(),
  requests: [] as Array<{ table: string; calls: unknown[][] }>,
  pages: [] as unknown[][],
  project: null as unknown,
  projectError: null as unknown,
  error: null as unknown,
  authActor: "",
  sessionActor: "",
  onRead: undefined as (() => void) | undefined,
}));
vi.mock("@/services/project-workspace-service", () => ({ assertProjectScope: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getUser: state.getUser } },
  createActorBoundSupabaseClient: (actorId: string) => {
    state.bound(actorId);
    return {
      from: (table: string) => {
        const request = { table, calls: [] as unknown[][] };
        state.requests.push(request);
        let signal: AbortSignal | undefined;
        const read = async () => {
          signal?.throwIfAborted();
          // Models the existing actor-bound factory's token callback for every request.
          if (actorId !== state.sessionActor) throw new Error("Sessionen er ændret");
          const result =
            table === "projects"
              ? { data: state.project, error: state.projectError }
              : { data: state.pages.length ? state.pages.shift() : [], error: state.error };
          state.onRead?.();
          return result;
        };
        const query = {
          select: (...args: unknown[]) => {
            request.calls.push(["select", ...args]);
            return query;
          },
          eq: (...args: unknown[]) => {
            request.calls.push(["eq", ...args]);
            return query;
          },
          order: (...args: unknown[]) => {
            request.calls.push(["order", ...args]);
            return query;
          },
          limit: (...args: unknown[]) => {
            request.calls.push(["limit", ...args]);
            return query;
          },
          gt: (...args: unknown[]) => {
            request.calls.push(["gt", ...args]);
            return query;
          },
          abortSignal: (value: AbortSignal) => {
            signal = value;
            request.calls.push(["abortSignal", value]);
            return query;
          },
          maybeSingle: read,
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            read().then(resolve, reject),
        };
        return query;
      },
    };
  },
}));

import { listFieldJobActions, listFieldJobActionsForActor } from "../field-job-cards-service";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1);
const scope = { organizationId: id(2), projectId: id(3) };
const row = (n = 10) => ({
  id: id(n),
  project_id: scope.projectId,
  title: `Opgave ${n}`,
  status: "Åben",
  action_type: null as string | null,
  linked_indicator_id: null,
  work_orders: [] as unknown[],
});

beforeEach(() => {
  vi.clearAllMocks();
  state.authActor = actor;
  state.sessionActor = actor;
  state.getUser.mockImplementation(async () => ({
    data: { user: { id: state.authActor } },
    error: null,
  }));
  state.project = { id: scope.projectId, organization_id: scope.organizationId };
  state.projectError = null;
  state.error = null;
  state.requests = [];
  state.pages = [];
  state.onRead = undefined;
});

describe("actor-bound project status reads", () => {
  it("keeps the original signature, deriving a server-verified actor once", async () => {
    state.pages = [[row()]];
    expect((await listFieldJobActions(scope))[0].workOrderStatus.state).toBe("missing");
    expect(state.getUser).toHaveBeenCalledTimes(1);
    expect(state.bound).toHaveBeenCalledWith(actor);
  });

  it("reads 1001 jobs using parent cursors and the latest nested lifecycle, without any write methods", async () => {
    const rows = Array.from({ length: 1002 }, (_, index) => ({
      ...row(index + 100),
      action_type: index === 199 ? "workflow_followup" : null,
    }));
    state.pages = Array.from({ length: 6 }, (_, page) => rows.slice(page * 200, (page + 1) * 200));
    const result = await listFieldJobActionsForActor(scope, actor);
    expect(result).toHaveLength(1001);
    expect(result.at(-1)?.id).toBe(rows.at(-1)?.id);
    expect(result.some((item) => item.id === rows[199].id)).toBe(false);
    expect(state.getUser).toHaveBeenCalledTimes(1);
    expect(state.requests.map((request) => request.table)).toEqual([
      "projects",
      ...Array(6).fill("actions"),
    ]);
    for (const request of state.requests.slice(1)) {
      expect(request.calls).toContainEqual(["eq", "project_id", scope.projectId]);
      expect(request.calls).toContainEqual([
        "eq",
        "work_orders.organization_id",
        scope.organizationId,
      ]);
      expect(request.calls).toContainEqual(["eq", "work_orders.project_id", scope.projectId]);
      expect(request.calls).toContainEqual([
        "order",
        "version",
        { referencedTable: "work_orders.life", ascending: false },
      ]);
      expect(request.calls).toContainEqual(["limit", 1, { referencedTable: "work_orders.life" }]);
    }
    expect(state.requests[2].calls).toContainEqual(["gt", "id", rows[199].id]);
  });

  it("keeps a legacy GUID as both action identity and page cursor", async () => {
    const legacy = "11111111-1111-c111-5111-111111111111";
    state.pages = [
      [...Array.from({ length: 199 }, (_, index) => row(index + 100)), { ...row(), id: legacy }],
      [{ ...row(), id: "22222222-2222-4222-8222-222222222222" }],
    ];
    expect((await listFieldJobActionsForActor(scope, actor))[199].id).toBe(legacy);
    expect(state.requests[2].calls).toContainEqual(["gt", "id", legacy]);
  });

  it.each([
    null,
    { id: id(90), organization_id: scope.organizationId },
    { id: scope.projectId, organization_id: id(90) },
  ])("rejects unavailable or foreign project scope before listing", async (project) => {
    state.project = project;
    await expect(listFieldJobActionsForActor(scope, actor)).rejects.toThrow(
      "Projektet findes ikke",
    );
    expect(state.requests.map((request) => request.table)).toEqual(["projects"]);
  });

  it("rejects a project query error even if a row was included", async () => {
    state.projectError = { code: "42501" };
    await expect(listFieldJobActionsForActor(scope, actor)).rejects.toThrow(
      "Projektet findes ikke",
    );
  });

  it.each([null, "bad", [row(), row()]])(
    "does not convert a malformed/repeated action page to missing status %#",
    async (page) => {
      state.pages = [page as unknown[]];
      await expect(listFieldJobActionsForActor(scope, actor)).rejects.toThrow();
    },
  );

  it("propagates canonical query errors instead of returning legacy status", async () => {
    state.pages = [[row()]];
    state.error = { code: "42501" };
    await expect(listFieldJobActionsForActor(scope, actor)).rejects.toThrow("kunne ikke læses");
  });

  it("rejects a mismatched verified actor before constructing any bound client", async () => {
    state.authActor = id(90);
    await expect(listFieldJobActionsForActor(scope, actor)).rejects.toThrow("Sessionen er ændret");
    expect(state.bound).not.toHaveBeenCalled();
  });

  it("rejects failed server auth rather than trusting local session identity", async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: new Error("expired") });
    await expect(listFieldJobActionsForActor(scope, actor)).rejects.toThrow("Sessionen er ændret");
    expect(state.bound).not.toHaveBeenCalled();
  });

  it("the bound client stops a session switch between action pages", async () => {
    state.pages = [Array.from({ length: 200 }, (_, index) => row(index + 100)), [row(500)]];
    let reads = 0;
    state.onRead = () => {
      if (++reads === 2) state.sessionActor = id(90);
    };
    await expect(listFieldJobActionsForActor(scope, actor)).rejects.toThrow("Sessionen er ændret");
    expect(state.getUser).toHaveBeenCalledTimes(1);
  });

  it("propagates AbortSignal to the project and every page, and stops after an aborted response", async () => {
    const controller = new AbortController();
    state.pages = [Array.from({ length: 200 }, (_, index) => row(index + 100)), [row(500)]];
    let reads = 0;
    state.onRead = () => {
      if (++reads === 2) controller.abort();
    };
    await expect(
      listFieldJobActionsForActor(scope, actor, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(state.requests).toHaveLength(2);
    for (const request of state.requests)
      expect(request.calls).toContainEqual(["abortSignal", controller.signal]);
  });

  it("does not start auth or data reads when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      listFieldJobActionsForActor(scope, actor, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(state.getUser).not.toHaveBeenCalled();
    expect(state.requests).toHaveLength(0);
  });

  it("checks cancellation again after auth completes", async () => {
    const controller = new AbortController();
    state.getUser.mockImplementation(async () => {
      controller.abort();
      return { data: { user: { id: actor } }, error: null };
    });
    await expect(
      listFieldJobActionsForActor(scope, actor, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(state.bound).not.toHaveBeenCalled();
  });
});
