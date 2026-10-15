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
  queryData: {} as Record<string, unknown>,
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
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: state.queryData[queryKey[0]],
    isPending: state.queryData[queryKey[0]] === undefined,
    error: null,
  }),
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
function render(selected: typeof batch | null = batch, selectedProject: Project = project) {
  state.cursor = 0;
  return renderToStaticMarkup(
    <DroneIntakeAssistant
      project={selectedProject}
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
  state.queryData = {};
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
  it.each([true, false])(
    "shows and blocks an existing-area mismatch only when camera positions are outside: %s",
    async (outside) => {
      const selectedProject = {
        ...project,
        geometry_polygon: {
          type: "Polygon",
          coordinates: [
            [
              [9, 55],
              [9.1, 55],
              [9.1, 55.1],
              [9, 55.1],
              [9, 55],
            ],
          ],
        },
      } as Project;
      state.queryData = {
        "drone-intake-project": selectedProject,
        "official-watercourse-reach": {
          id: ACTOR,
          name: "Gemt reference",
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [9.01, 55.01],
                [9.09, 55.09],
              ],
            ],
          },
          disclaimer: "Faglig gennemgang kræves.",
        },
        "inspection-access": { userId: ACTOR, projectId: PROJECT, canPersist: true },
      };
      state.localize.mockResolvedValue({
        projectId: PROJECT,
        actorId: ACTOR,
        photos: [
          {
            mediaId: MEDIA,
            status: "located",
            originalSha256: "a".repeat(64),
            capturedAtUtc: "2026-10-14T10:00:00Z",
            cameraPosition: {
              longitude: outside ? 10.05 : 9.05,
              latitude: outside ? 56.05 : 55.05,
              geometryRole: "camera_position_only",
            },
          },
        ],
        clusters: [
          {
            id: "camera-group:test",
            mediaIds: [MEDIA],
            searchStatus: "complete",
            candidates: [],
            suggestedReferenceId: null,
            suggestedPolygon: {
              type: "Polygon",
              coordinates: [
                [
                  [10, 56],
                  [10.1, 56],
                  [10.1, 56.1],
                  [10, 56.1],
                  [10, 56],
                ],
              ],
            },
          },
        ],
      });
      render(batch, selectedProject);
      const cleanup = state.effects[0]();
      await flush();
      const markup = render(batch, selectedProject);
      const confirmButton = markup.match(
        /<button[^>]*>Bekræft sted, hent data og tilknyt billeder<\/button>/,
      )?.[0];
      expect(confirmButton).toBeDefined();
      expect(confirmButton?.includes('disabled=""')).toBe(outside);
      expect(markup.includes("kameraposition uden for")).toBe(outside);
      expect(state.run).not.toHaveBeenCalled();
      expect(state.prepared).not.toHaveBeenCalled();
      cleanup?.();
    },
  );
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
