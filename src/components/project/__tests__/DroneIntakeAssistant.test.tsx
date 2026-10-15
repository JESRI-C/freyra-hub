import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/supabase/types";
const state = vi.hoisted(() => ({
  cursor: 0,
  hooks: [] as unknown[],
  effects: [] as Array<() => void | (() => void)>,
  localize: vi.fn(),
  inspect: vi.fn(),
  run: vi.fn(),
  prepared: vi.fn(),
  changed: vi.fn(),
}));
vi.mock("react", async (load) => ({
  ...(await load<typeof import("react")>()),
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
  useEffect: (run: () => void | (() => void)) => {
    state.effects.push(run);
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isPending: true, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => {}) }),
}));
vi.mock("@/components/ui-bits", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/maps/LiveProjectMap", () => ({ LiveProjectMap: () => null }));
vi.mock("@/lib/drone-localization.functions", () => ({ localizeDroneOriginals: state.localize }));
vi.mock("@/lib/drone-image-inspection.functions", () => ({ inspectDroneImage: state.inspect }));
vi.mock("@/lib/watercourse-reach.functions", () => ({
  getSavedOfficialWatercourseReach: vi.fn(),
  saveOfficialWatercourseReach: vi.fn(),
}));
vi.mock("@/lib/public-baseline.functions", () => ({
  createProjectBaseline: vi.fn(),
  getProjectBaseline: vi.fn(),
}));
vi.mock("@/lib/verification-plan.functions", () => ({
  getVerificationPlan: vi.fn(),
  saveVerificationPlan: vi.fn(),
}));
vi.mock("@/lib/survey-round.functions", () => ({
  getSurveyRoundAccess: vi.fn(),
  getSurveyRound: vi.fn(),
  saveSurveyRound: vi.fn(),
}));
vi.mock("@/lib/survey-round-media.functions", () => ({
  getSurveyRoundMediaAccess: vi.fn(),
  getSurveyRoundMedia: vi.fn(),
  listSurveyRoundMedia: vi.fn(),
  listSurveyRoundMediaCandidates: vi.fn(),
  saveSurveyRoundMedia: vi.fn(),
}));
vi.mock("@/services/projects-service", () => ({
  getProjectById: vi.fn(),
  persistProjectBoundary: vi.fn(),
}));
vi.mock("../drone-intake-run", async (load) => ({
  ...(await load<typeof import("../drone-intake-run")>()),
  runDroneIntakeImageChunk: state.run,
}));
import { DroneIntakeAssistant } from "../DroneIntakeAssistant";
const ACTOR = "10000000-0000-4000-8000-000000000001",
  PROJECT = "20000000-0000-4000-8000-000000000001",
  MEDIA = "30000000-0000-4000-8000-000000000001";
const project = { id: PROJECT, name: "Syntetisk test", geometry_polygon: null } as Project;
const batch = {
  projectId: PROJECT,
  batchId: "before-batch-1",
  mediaIds: [MEDIA],
  receivedCount: 1,
};
function render(selected: typeof batch | null = batch) {
  state.cursor = 0;
  return renderToStaticMarkup(
    <DroneIntakeAssistant
      project={project}
      actorId={ACTOR}
      batch={selected ?? undefined}
      onPrepared={state.prepared}
      onPhotosChanged={state.changed}
    />,
  );
}
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  state.cursor = 0;
  state.hooks = [];
  state.effects = [];
  vi.clearAllMocks();
  state.localize.mockImplementation(async ({ data }) => ({
    projectId: data.projectId,
    actorId: ACTOR,
    photos: data.mediaIds.map((mediaId: string) => ({
      mediaId,
      status: "missing_gps",
      capturedAtUtc: null,
    })),
    clusters: [],
  }));
  state.run.mockResolvedValue({ nextIndex: 1, busyMediaId: null });
});
afterEach(() => vi.unstubAllGlobals());
describe("upload-event-only intake assistant lifecycle", () => {
  it("does not localize, analyze or prepare merely by opening an existing project", async () => {
    expect(render(null)).toBe("");
    await flush();
    expect(state.effects).toHaveLength(0);
    expect(state.localize).not.toHaveBeenCalled();
    expect(state.run).not.toHaveBeenCalled();
    expect(state.prepared).not.toHaveBeenCalled();
  });
  it("starts the exact newly uploaded series and never prepares geography automatically", async () => {
    render();
    const cleanup = state.effects[0]();
    await flush();
    expect(state.localize).toHaveBeenCalledWith({
      data: { projectId: PROJECT, mediaIds: [MEDIA], expectedCallerUserId: ACTOR },
    });
    expect(state.run).not.toHaveBeenCalled();
    expect(state.prepared).not.toHaveBeenCalled();
    cleanup?.();
  });
  it("Strict Mode's discarded effect does not duplicate localization or start AI before public data", async () => {
    render();
    const effect = state.effects[0];
    const firstCleanup = effect();
    firstCleanup?.();
    const finalCleanup = effect();
    await flush();
    expect(state.localize).toHaveBeenCalledTimes(1);
    expect(state.run).not.toHaveBeenCalled();
    finalCleanup?.();
  });
  it("does not start AI after a late localization result from an unmounted batch", async () => {
    let finish!: (value: unknown) => void;
    state.localize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render();
    const cleanup = state.effects[0]();
    await flush();
    expect(state.localize).toHaveBeenCalledTimes(1);
    cleanup?.();
    finish({ actorId: ACTOR, projectId: PROJECT, photos: [{ mediaId: MEDIA }], clusters: [] });
    await flush();
    expect(state.run).not.toHaveBeenCalled();
    expect(state.changed).not.toHaveBeenCalled();
  });
  it("rejects a batch from another project before registering any effect", async () => {
    expect(render({ ...batch, projectId: ACTOR })).toContain("anden sag");
    await flush();
    expect(state.effects).toHaveLength(0);
    expect(state.localize).not.toHaveBeenCalled();
    expect(state.run).not.toHaveBeenCalled();
  });
});
