import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/supabase/types";
import type { StreamInspectionResult } from "../stream-inspection-start";

type QueryOptions = {
  queryKey: unknown[];
  enabled?: boolean;
  queryFn: (context?: { pageParam?: number }) => Promise<unknown>;
};
type QueryState = { data?: unknown; error?: Error | null; isFetching?: boolean };
type MutationOptions = { mutationFn: () => Promise<unknown> };

const state = vi.hoisted(() => ({
  actor: null as string | null,
  cursor: 0,
  hooks: [] as unknown[],
  effects: [] as { index: number; run: () => void | (() => void) }[],
  cleanups: new Map<number, () => void>(),
  mountedKey: null as string | null,
  queries: new Map<string, QueryOptions>(),
  queryState: new Map<string, QueryState>(),
  mutation: null as MutationOptions | null,
  mutationPending: false,
  setQueryData: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  start: vi.fn(),
  resume: vi.fn(),
  getAccess: vi.fn(),
  getPhotoAccess: vi.fn(),
  getReference: vi.fn(),
  createBaseline: vi.fn(),
  getBaseline: vi.fn(),
  savePlan: vi.fn(),
  getPlan: vi.fn(),
  saveRound: vi.fn(),
  getRound: vi.fn(),
  listRounds: vi.fn(),
}));

vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks))
        state.hooks[index] = typeof initial === "function" ? initial() : initial;
      return [
        state.hooks[index],
        (next: unknown) => {
          state.hooks[index] = typeof next === "function" ? next(state.hooks[index]) : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = { current: initial };
      return state.hooks[index];
    },
    useMemo: (create: () => unknown) => create(),
    useEffect: (run: () => void | (() => void), deps: unknown[]) => {
      const index = state.cursor++;
      const old = state.hooks[index] as unknown[] | undefined;
      if (
        !old ||
        old.length !== deps.length ||
        deps.some((value, position) => !Object.is(value, old[position]))
      ) {
        state.hooks[index] = deps;
        state.effects.push({ index, run });
      }
    },
  };
});
vi.mock("@tanstack/react-query", () => {
  const query = (options: QueryOptions) => {
    const name = String(options.queryKey[0]);
    state.queries.set(name, options);
    const saved = state.queryState.get(name);
    return {
      data: undefined,
      error: null,
      isFetching: false,
      isPending: false,
      isSuccess: saved?.data !== undefined && !saved.error,
      ...saved,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    };
  };
  return {
    useQuery: query,
    useInfiniteQuery: query,
    useQueryClient: () => ({
      setQueryData: state.setQueryData,
      invalidateQueries: state.invalidate,
    }),
    useMutation: (options: MutationOptions) => {
      state.mutation = options;
      return {
        error: null,
        isPending: state.mutationPending,
        mutate: vi.fn(() => options.mutationFn()),
      };
    },
  };
});
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: state.actor ? { id: state.actor } : null }),
}));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: true }));
vi.mock("@/components/ui-bits", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/monitoring/DroneBeforeBatchWizard", () => ({
  DroneBeforeBatchWizard: () => null,
}));
vi.mock("@/components/maps/LiveProjectMap", () => ({ LiveProjectMap: () => null }));
vi.mock("../SurveyRoundMediaPanel", () => ({ SurveyRoundMediaPanel: () => null }));
vi.mock("../InspectionPhotoBatch", () => ({ InspectionPhotoBatch: () => null }));
vi.mock("../stream-inspection-start", () => ({
  startStreamInspection: state.start,
  resumeCompletedStreamInspection: state.resume,
}));
vi.mock("@/lib/public-baseline.functions", () => ({
  createProjectBaseline: state.createBaseline,
  getProjectBaseline: state.getBaseline,
}));
vi.mock("@/lib/verification-plan.functions", () => ({
  saveVerificationPlan: state.savePlan,
  getVerificationPlan: state.getPlan,
}));
vi.mock("@/lib/survey-round.functions", () => ({
  getSurveyRoundAccess: state.getAccess,
  getSurveyRound: state.getRound,
  listSurveyRounds: state.listRounds,
  saveSurveyRound: state.saveRound,
}));
vi.mock("@/lib/survey-round-media.functions", () => ({
  getSurveyRoundMediaAccess: state.getPhotoAccess,
}));
vi.mock("@/lib/watercourse-reach.functions", () => ({
  getSavedOfficialWatercourseReach: state.getReference,
}));

import { DroneSurveyWorkspace } from "../DroneSurveyWorkspace";
import { DroneBeforeBatchWizard } from "@/components/monitoring/DroneBeforeBatchWizard";
import { LiveProjectMap } from "@/components/maps/LiveProjectMap";
import { SurveyRoundMediaPanel } from "../SurveyRoundMediaPanel";
import { InspectionPhotoBatch } from "../InspectionPhotoBatch";
import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";
import { surveyRoundVersionFromRow } from "@/services/baseline/survey-round-persistence";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";

type Props = React.ComponentProps<typeof DroneSurveyWorkspace>;
type Element = React.ReactElement<Record<string, unknown>>;
let props: Props;
let result: StreamInspectionResult;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
const OTHER_ACTOR = "a1000000-0000-4000-8000-000000000001";
const OTHER_PROJECT = "a2000000-0000-4000-8000-000000000001";
const OTHER_ROUND = "a3000000-0000-4000-8000-000000000001";

function unmount() {
  for (const cleanup of state.cleanups.values()) cleanup();
  state.cleanups.clear();
  state.hooks = [];
  state.mountedKey = null;
}

/** Run the actual keyed component and its effects; server/query operations are
 * explicit test boundaries, so mounting never fabricates network side effects. */
function tree(): React.ReactElement {
  const outer = DroneSurveyWorkspace(props) as Element;
  if (typeof outer.type !== "function") return outer;
  const key = String(outer.key);
  if (key !== state.mountedKey) {
    unmount();
    state.mountedKey = key;
  }
  state.cursor = 0;
  state.effects = [];
  const value = (outer.type as (input: unknown) => React.ReactElement)(outer.props);
  for (const effect of state.effects) {
    state.cleanups.get(effect.index)?.();
    const cleanup = effect.run();
    if (cleanup) state.cleanups.set(effect.index, cleanup);
    else state.cleanups.delete(effect.index);
  }
  return value;
}

function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return React.isValidElement<{ children?: React.ReactNode }>(node)
    ? text(node.props.children)
    : "";
}
function find(node: React.ReactNode, match: (value: Element) => boolean): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const selected = find(child, match);
      if (selected) return selected;
    }
    return null;
  }
  if (!React.isValidElement<Record<string, unknown>>(node)) return null;
  return match(node) ? node : find(node.props.children as React.ReactNode, match);
}
function button(node: React.ReactNode, label: string): Element {
  const value = find(
    node,
    (element) =>
      element.type === "button" && text(element.props.children as React.ReactNode).includes(label),
  );
  if (!value) throw new Error(`Button absent: ${label}`);
  return value;
}
function query(name: string): QueryOptions {
  const value = state.queries.get(name);
  if (!value) throw new Error(`Query absent: ${name}`);
  return value;
}
function setData(name: string, data: unknown) {
  state.queryState.set(name, { data, error: null });
}
async function makeScopeReady() {
  tree();
  const value = await query("inspection-scope").queryFn();
  setData("inspection-scope", value);
  tree();
  return value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.clearAllMocks();
  unmount();
  state.queries.clear();
  state.queryState.clear();
  state.mutation = null;
  state.mutationPending = false;
  const fixture = await makeRoundFixture();
  result = {
    snapshot: fixture.baseline,
    plan: fixture.plan,
    round: await surveyRoundVersionFromRow(fixture.row, fixture.baseline, fixture.planRow),
  };
  state.actor = fixture.baseline.createdBy;
  const project: Project = {
    id: fixture.baseline.projectId,
    name: fixture.baseline.manifest.project.name,
    slug: "synthetic-stream",
    organization_id: null,
    project_type: "watercourse",
    location_name: null,
    municipality: null,
    country: "DK",
    status: "planning",
    start_date: null,
    end_date: null,
    description: null,
    created_at: fixture.baseline.createdAt,
    geometry_polygon: structuredClone(
      fixture.baseline.manifest.project.polygon,
    ) as unknown as Record<string, unknown>,
    geometry_centroid_lat: 55.05,
    geometry_centroid_lng: 9.05,
    geometry_area_ha: null,
    geometry_source: "manual",
  };
  props = {
    project,
    selectedRoundId: undefined,
    onSelectRound: vi.fn(),
    onOpenDelivery: vi.fn(),
    photoCount: 2,
    onPhotosChanged: vi.fn(),
  };
  const values = new Map<string, string>();
  storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  vi.stubGlobal("localStorage", storage);
  setData("official-watercourse-reach", fixture.baseline.manifest.reference);
  setData("inspection-access", { projectId: project.id, userId: state.actor, canPersist: true });
  setData("inspection-photo-access", {
    projectId: project.id,
    userId: state.actor,
    canAssign: true,
  });
  setData("inspection-rounds", { pages: [{ items: [result.round], nextBeforeVersion: null }] });
  state.getAccess.mockResolvedValue({
    projectId: project.id,
    userId: state.actor,
    canPersist: true,
  });
  state.getPhotoAccess.mockResolvedValue({
    projectId: project.id,
    userId: state.actor,
    canAssign: true,
  });
  state.getReference.mockResolvedValue(fixture.baseline.manifest.reference);
  state.getRound.mockResolvedValue(result.round);
  state.getBaseline.mockResolvedValue(result.snapshot);
  state.getPlan.mockResolvedValue(result.plan);
  state.listRounds.mockResolvedValue({ items: [result.round], nextBeforeVersion: null });
  state.resume.mockResolvedValue(null);
  state.start.mockResolvedValue(result);
  state.invalidate.mockResolvedValue(undefined);
});
afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("guided drone survey workspace", () => {
  it("mounts a single understandable workflow without starting or saving an investigation", async () => {
    const node = tree();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Fra dronebilleder til gennemgang");
    expect(html).toContain("Rapport og aflevering");
    expect(html).toContain("stadig under udvikling");
    for (const name of [
      "official-watercourse-reach",
      "inspection-access",
      "inspection-photo-access",
      "inspection-rounds",
    ]) {
      await query(name).queryFn({ pageParam: undefined });
    }
    await makeScopeReady();
    expect(await query("inspection-completed").queryFn()).toBeNull();
    expect(state.resume).toHaveBeenCalledOnce();
    expect(state.start).not.toHaveBeenCalled();
    expect(state.createBaseline).not.toHaveBeenCalled();
    expect(state.savePlan).not.toHaveBeenCalled();
    expect(state.saveRound).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(props.onSelectRound).not.toHaveBeenCalled();
  });

  it("passes the exact actor, project, reference and geometry hashes only on explicit preparation", async () => {
    const scope = await makeScopeReady();
    expect(scope).toMatchObject({
      actorId: state.actor,
      projectId: props.project.id,
      geometrySha256: await baselineSha256(props.project.geometry_polygon),
      reference: {
        id: result.snapshot.manifest.reference.id,
        zoneId: result.snapshot.manifest.reference.zoneId,
        geometrySha256: await baselineSha256(result.snapshot.manifest.reference.geometry),
      },
    });
    const start = button(tree(), "Hent data og forbered undersøgelse");
    expect(start.props.disabled).toBe(false);
    await (start.props.onClick as () => Promise<unknown>)();
    expect(state.start).toHaveBeenCalledOnce();
    expect(state.start.mock.calls[0][0]).toEqual(scope);
    expect(state.start.mock.calls[0][2]).toMatchObject({
      storage,
      isCurrent: expect.any(Function),
      onProgress: expect.any(Function),
    });
    expect(state.setQueryData).toHaveBeenCalledWith(
      ["inspection-selection", state.actor, props.project.id, result.round.id],
      result,
    );
    expect(props.onSelectRound).toHaveBeenCalledWith(result.round.id);
    expect(state.createBaseline).not.toHaveBeenCalled();
    expect(state.savePlan).not.toHaveBeenCalled();
    expect(state.saveRound).not.toHaveBeenCalled();
  });

  it("offers the exact completed saved receipt as an explicit continuation, without silently selecting latest", () => {
    setData("inspection-completed", result);
    const node = tree();
    expect(props.onSelectRound).not.toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
    (
      button(node, "Fortsæt den gemte undersøgelse fra denne periode").props.onClick as () => void
    )();
    expect(props.onSelectRound).toHaveBeenCalledExactlyOnceWith(result.round.id);
  });

  it("reads only the selected saved round and its exact saved baseline/plan IDs", async () => {
    props.selectedRoundId = result.round.id;
    tree();
    const selected = await query("inspection-selection").queryFn();
    expect(selected).toEqual(result);
    expect(state.getRound).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: props.project.id, roundVersionId: result.round.id },
    });
    expect(state.getBaseline).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: props.project.id, snapshotId: result.round.baselineId },
    });
    expect(state.getPlan).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: props.project.id, planId: result.round.planId },
    });
    expect(state.resume).not.toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
  });

  it.each(["round", "baseline", "plan"])(
    "rejects a different saved %s identity even if its project and manifest hash agree",
    async (part) => {
      props.selectedRoundId = result.round.id;
      if (part === "round") state.getRound.mockResolvedValue({ ...result.round, id: OTHER_ROUND });
      if (part === "baseline")
        state.getBaseline.mockResolvedValue({ ...result.snapshot, id: OTHER_ROUND });
      if (part === "plan") state.getPlan.mockResolvedValue({ ...result.plan, id: OTHER_ROUND });
      tree();
      await expect(query("inspection-selection").queryFn()).rejects.toThrow();
      expect(state.start).not.toHaveBeenCalled();
    },
  );

  it.each(["baseline", "plan"])("rejects a mismatched saved %s hash", async (part) => {
    props.selectedRoundId = result.round.id;
    if (part === "baseline")
      state.getBaseline.mockResolvedValue({ ...result.snapshot, manifestSha256: "f".repeat(64) });
    if (part === "plan")
      state.getPlan.mockResolvedValue({ ...result.plan, manifestSha256: "f".repeat(64) });
    tree();
    await expect(query("inspection-selection").queryFn()).rejects.toThrow();
  });

  it("keeps photo assignment, guided review and map on the exact selected round and saved geometry", () => {
    props.selectedRoundId = result.round.id;
    setData("inspection-selection", result);
    const node = tree();
    const batch = find(node, (element) => element.type === InspectionPhotoBatch)!;
    const review = find(node, (element) => element.type === SurveyRoundMediaPanel)!;
    const map = find(node, (element) => element.type === LiveProjectMap)!;
    expect(batch.props.round).toBe(result.round);
    expect(review.props).toMatchObject({ round: result.round, plan: result.plan, guided: true });
    expect(map.props).toMatchObject({
      projectId: props.project.id,
      geometry: { polygon: result.snapshot.manifest.project.polygon },
    });
  });

  it("suppresses cached selected content when reloading access or the selection fails", () => {
    props.selectedRoundId = result.round.id;
    state.queryState.set("inspection-selection", {
      data: result,
      error: new Error("Selection denied"),
    });
    let node = tree();
    expect(find(node, (element) => element.type === SurveyRoundMediaPanel)).toBeNull();
    expect(text(node)).toContain("Selection denied");
    setData("inspection-selection", result);
    state.queryState.set("inspection-access", {
      data: { projectId: props.project.id, userId: state.actor, canPersist: true },
      error: new Error("Access revoked"),
    });
    node = tree();
    expect(find(node, (element) => element.type === SurveyRoundMediaPanel)).toBeNull();
  });

  it("blocks preparation without an actual AOI and routes the user to area confirmation", async () => {
    props.project = { ...props.project, geometry_polygon: null };
    const node = tree();
    expect(query("inspection-scope").enabled).toBe(false);
    expect(button(node, "Hent data og forbered undersøgelse").props.disabled).toBe(true);
    expect(text(node)).toContain("Vælg område og vandløb");
    await expect(state.mutation!.mutationFn()).rejects.toThrow();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("blocks preparation when the named official reference has not been saved", async () => {
    setData("official-watercourse-reach", null);
    const node = tree();
    expect(query("inspection-scope").enabled).toBe(false);
    expect(button(node, "Hent data og forbered undersøgelse").props.disabled).toBe(true);
    await expect(state.mutation!.mutationFn()).rejects.toThrow();
  });

  it.each(["error", "refresh"])(
    "refuses stale reference data during a reference %s, even if a scope is cached",
    async (failure) => {
      await makeScopeReady();
      state.queryState.set("official-watercourse-reach", {
        data: result.snapshot.manifest.reference,
        error: failure === "error" ? new Error("Reference unavailable") : null,
        isFetching: failure === "refresh",
      });
      const node = tree();
      expect(button(node, "Hent data og forbered undersøgelse").props.disabled).toBe(true);
      await expect(state.mutation!.mutationFn()).rejects.toThrow();
      expect(state.start).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("keeps viewer controls read-only while preserving existing investigation selection", async () => {
    setData("inspection-access", {
      projectId: props.project.id,
      userId: state.actor,
      canPersist: false,
    });
    setData("inspection-photo-access", {
      projectId: props.project.id,
      userId: state.actor,
      canAssign: false,
    });
    await makeScopeReady();
    const node = tree();
    expect(button(node, "Tilføj dronebilleder").props.disabled).toBe(true);
    expect(button(node, "Hent data og forbered undersøgelse").props.disabled).toBe(true);
    await expect(state.mutation!.mutationFn()).rejects.toThrow();
    const select = find(
      node,
      (element) => element.type === "select" && element.props["aria-label"] === "Gemt undersøgelse",
    )!;
    (select.props.onChange as (event: unknown) => void)({ target: { value: result.round.id } });
    expect(props.onSelectRound).toHaveBeenCalledWith(result.round.id);
    expect(state.start).not.toHaveBeenCalled();
  });

  it("allows field photo intake without enabling editor-only investigation preparation", async () => {
    setData("inspection-access", {
      projectId: props.project.id,
      userId: state.actor,
      canPersist: false,
    });
    await makeScopeReady();
    const node = tree();
    expect(button(node, "Hent data og forbered undersøgelse").props.disabled).toBe(true);
    expect(button(node, "Tilføj dronebilleder").props.disabled).toBe(false);
    (button(node, "Tilføj dronebilleder").props.onClick as () => void)();
    const wizard = find(tree(), (element) => element.type === DroneBeforeBatchWizard)!;
    expect(wizard.props).toMatchObject({ open: true, projectId: props.project.id });
    (wizard.props.onImported as () => void)();
    expect(props.onPhotosChanged).toHaveBeenCalledOnce();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("does not label cached photo access as read-only during refetch and shows read-only only after a confirmed denial", () => {
    state.queryState.set("inspection-photo-access", {
      data: { projectId: props.project.id, userId: state.actor, canAssign: true },
      error: null,
      isFetching: true,
    });
    const refreshing = tree();
    expect(button(refreshing, "Tilføj dronebilleder").props.disabled).toBe(true);
    expect(text(refreshing)).not.toContain("Du har læseadgang");

    setData("inspection-photo-access", {
      projectId: props.project.id,
      userId: state.actor,
      canAssign: false,
    });
    const denied = tree();
    expect(button(denied, "Tilføj dronebilleder").props.disabled).toBe(true);
    expect(text(denied)).toContain("Du har læseadgang");
    expect(state.start).not.toHaveBeenCalled();
  });

  it.each(["actor", "project"])(
    "rejects a mismatched verified %s in both access responses",
    async (field) => {
      const access = {
        projectId: field === "project" ? OTHER_PROJECT : props.project.id,
        userId: field === "actor" ? OTHER_ACTOR : state.actor,
        canPersist: true,
        canAssign: true,
      };
      state.getAccess.mockResolvedValue(access);
      state.getPhotoAccess.mockResolvedValue(access);
      tree();
      await expect(query("inspection-access").queryFn()).rejects.toThrow("aktuelle bruger og sag");
      await expect(query("inspection-photo-access").queryFn()).rejects.toThrow(
        "aktuelle bruger og sag",
      );
    },
  );

  it.each(["actor", "project"])(
    "isolates every access/selection cache and blocks an old selected read after a %s change",
    async (field) => {
      props.selectedRoundId = result.round.id;
      tree();
      const oldQuery = query("inspection-selection");
      const oldKey = oldQuery.queryKey;
      const pending = deferred<typeof result.round>();
      state.getRound.mockReturnValueOnce(pending.promise);
      const oldRead = oldQuery.queryFn();
      await Promise.resolve();
      expect(state.getRound).toHaveBeenCalledOnce();
      if (field === "actor") state.actor = OTHER_ACTOR;
      else props.project = { ...props.project, id: OTHER_PROJECT };
      tree();
      expect(query("inspection-selection").queryKey).not.toEqual(oldKey);
      expect(query("inspection-access").queryKey).toEqual([
        "inspection-access",
        state.actor,
        props.project.id,
      ]);
      pending.resolve(result.round);
      await expect(oldRead).rejects.toThrow();
      expect(state.getBaseline).not.toHaveBeenCalled();
      expect(state.getPlan).not.toHaveBeenCalled();
      expect(state.start).not.toHaveBeenCalled();
    },
  );

  it("does not navigate to a completed preparation after its actor changes during the async operation", async () => {
    await makeScopeReady();
    const pending = deferred<StreamInspectionResult>();
    state.start.mockReturnValueOnce(pending.promise);
    const prepare = state.mutation!.mutationFn();
    const originalActor = state.actor;
    const guard = state.start.mock.calls[0][2].isCurrent as () => boolean;
    expect(guard()).toBe(true);
    state.actor = OTHER_ACTOR;
    tree();
    expect(guard()).toBe(false);
    pending.resolve(result);
    await expect(prepare).rejects.toThrow();
    expect(props.onSelectRound).not.toHaveBeenCalled();
    expect(state.setQueryData).not.toHaveBeenCalledWith(
      ["inspection-selection", originalActor, props.project.id, result.round.id],
      result,
    );
  });

  it.each(["selected round", "project name", "reference ID", "reference provider"])(
    "invalidates an in-flight preparation when the %s changes with unchanged geometry",
    async (field) => {
      await makeScopeReady();
      const pending = deferred<StreamInspectionResult>();
      state.start.mockReturnValueOnce(pending.promise);
      const prepare = state.mutation!.mutationFn();
      const guard = state.start.mock.calls[0][2].isCurrent as () => boolean;
      expect(guard()).toBe(true);
      if (field === "selected round") props.selectedRoundId = result.round.id;
      if (field === "project name") props.project = { ...props.project, name: "Changed name" };
      if (field === "reference ID")
        setData("official-watercourse-reach", {
          ...result.snapshot.manifest.reference,
          id: OTHER_ROUND,
        });
      if (field === "reference provider")
        setData("official-watercourse-reach", {
          ...result.snapshot.manifest.reference,
          sourceProvider: "datafordeler-ds-bearbejdet-wfs/v1",
        });
      tree();
      expect(guard()).toBe(false);
      pending.resolve(result);
      await expect(prepare).rejects.toThrow();
      expect(props.onSelectRound).not.toHaveBeenCalled();
      expect(state.setQueryData).not.toHaveBeenCalled();
    },
  );

  it("starts no child queries when the user is logged out", () => {
    state.actor = null;
    expect(text(tree())).toContain("Log ind");
    expect(state.queries.size).toBe(0);
    expect(state.start).not.toHaveBeenCalled();
  });
});
