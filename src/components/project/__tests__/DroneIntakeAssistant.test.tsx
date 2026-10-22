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
  demo: false,
  tree: null as React.ReactNode,
  prepare: vi.fn(),
  bind: vi.fn(),
}));
vi.mock("@/lib/demo-mode", () => ({
  get DEMO_MODE() {
    return state.demo;
  },
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
  Card: ({ children }: { children: React.ReactNode }) => {
    state.tree = children;
    return <div>{children}</div>;
  },
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
vi.mock("../drone-intake-prepare", () => ({ prepareConfirmedDroneIntake: state.prepare }));
vi.mock("../drone-intake-binding", () => ({ bindConfirmedDroneIntakePhotos: state.bind }));
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
function clickButton(label: string) {
  let click: (() => void) | undefined;
  const walk = (children: React.ReactNode) => {
    React.Children.forEach(children, (child) => {
      if (
        !React.isValidElement<{
          children?: React.ReactNode;
          onClick?: () => void;
          disabled?: boolean;
        }>(child)
      )
        return;
      if (child.type === "button" && renderToStaticMarkup(child).includes(label)) {
        expect(child.props.disabled).not.toBe(true);
        click = child.props.onClick;
      }
      walk(child.props.children);
    });
  };
  walk(state.tree);
  expect(click, `Missing enabled button: ${label}`).toBeTypeOf("function");
  click!();
}
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  state.cursor = 0;
  state.hooks = [];
  state.effects = [];
  state.queryData = {};
  state.demo = false;
  state.tree = null;
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
  state.prepare.mockResolvedValue({
    snapshot: { id: "40000000-0000-4000-8000-000000000001", manifestSha256: "a".repeat(64) },
    round: { id: "50000000-0000-4000-8000-000000000001" },
  });
  state.bind.mockResolvedValue({ entries: [{ status: "confirmed" }] });
});

describe("municipal manual image comparison", () => {
  function setupLocatedPhoto() {
    const polygon = {
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
    };
    const reference = {
      id: ACTOR,
      name: "Syntetisk vandløbsreference",
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [9.05, 55],
            [9.05, 55.1],
          ],
        ],
      },
      disclaimer: "Faglig gennemgang kræves.",
    };
    state.queryData = {
      "drone-intake-project": project,
      "official-watercourse-reach": null,
      "inspection-access": { userId: ACTOR, projectId: PROJECT, canPersist: true },
    };
    state.localize.mockResolvedValue({
      projectId: PROJECT,
      actorId: ACTOR,
      photos: [
        {
          mediaId: MEDIA,
          fileName: "synthetic.JPG",
          status: "located",
          sizeBytes: 1000,
          capturedAtUtc: "2026-08-24T10:00:00Z",
          cameraPosition: {
            longitude: 9.05,
            latitude: 55.05,
            geometryRole: "camera_position_only",
          },
        },
      ],
      clusters: [
        {
          id: "camera-group:test",
          mediaIds: [MEDIA],
          searchStatus: "complete",
          suggestedPolygon: polygon,
          suggestedReferenceId: ACTOR,
          candidates: [{ reference, distanceM: 0 }],
        },
      ],
    });
  }

  it.each([true, false])(
    "saves the baseline and round, binds photos, and only starts AI outside DEMO_MODE=%s",
    async (demo) => {
      state.demo = demo;
      setupLocatedPhoto();
      render();
      const cleanup = state.effects[0]();
      await flush();
      render();
      clickButton("Bekræft sted, hent data og tilknyt billeder");
      await vi.waitFor(() => expect(state.bind).toHaveBeenCalledTimes(1));
      await flush();
      const markup = render();
      expect(state.prepare).toHaveBeenCalledTimes(1);
      expect(state.prepared).toHaveBeenCalledTimes(1);
      expect(state.changed).toHaveBeenCalledTimes(1);
      expect(markup).toContain("1 fotos er tilknyttet den gemte undersøgelse");
      expect(state.run).toHaveBeenCalledTimes(demo ? 0 : 1);
      expect(state.inspect).not.toHaveBeenCalled(); // Chunk runner is explicitly mocked.
      if (demo) {
        expect(markup).toContain("Automatisk billedvurdering er ikke frigivet til kommunal brug.");
        expect(markup).toContain("Fortsæt med manuel sammenligning i Gennemgang.");
        expect(markup).not.toMatch(
          /Billed-AI starter|gennemgås automatisk|Analyser de næste|Fortsæt billedanalysen|Spring dette foto over/,
        );
      } else {
        expect(markup).toContain("billedudkast gennemgået i denne arbejdsgang");
        expect(markup).not.toContain("ikke frigivet til kommunal brug");
      }
      cleanup?.();
    },
  );

  it("can resume photo binding in DEMO_MODE without an image-model attempt or skip", async () => {
    state.demo = true;
    setupLocatedPhoto();
    state.bind.mockRejectedValueOnce(new Error("Synthetic transient binding failure"));
    render();
    const cleanup = state.effects[0]();
    await flush();
    render();
    clickButton("Bekræft sted, hent data og tilknyt billeder");
    await vi.waitFor(() => expect(state.bind).toHaveBeenCalledTimes(1));
    await flush();
    render();
    clickButton("Fortsæt billedtilknytningen til den gemte undersøgelse");
    await vi.waitFor(() => expect(state.bind).toHaveBeenCalledTimes(2));
    await flush();
    const markup = render();
    expect(state.prepare).toHaveBeenCalledTimes(1);
    expect(state.prepared).toHaveBeenCalledTimes(1);
    expect(state.run).not.toHaveBeenCalled();
    expect(state.inspect).not.toHaveBeenCalled();
    expect(markup).toContain("Fortsæt med manuel sammenligning i Gennemgang.");
    expect(markup).not.toMatch(/Analyser de næste|Fortsæt billedanalysen|Spring dette foto over/);
    cleanup?.();
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("upload-event-only intake assistant lifecycle", () => {
  it.each(["pending", "too_broad"])(
    "offers all-series selection explicitly and preserves the first group by default (%s)",
    async (status) => {
      const ids = [MEDIA, "30000000-0000-4000-8000-000000000002"];
      const polygon = {
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
      };
      state.localize.mockResolvedValue({
        projectId: PROJECT,
        actorId: ACTOR,
        photos: ids.map((mediaId) => ({
          mediaId,
          status: "located",
          cameraPosition: { longitude: 9.05, latitude: 55.05 },
          capturedAtUtc: "2026-08-24T10:00:00Z",
        })),
        clusters: ids.map((id, index) => ({
          id: `group${index}`,
          mediaIds: [id],
          suggestedPolygon: polygon,
          searchStatus: "complete",
          candidates: [],
          suggestedReferenceId: null,
        })),
        combinedCluster: {
          id: "all-series",
          mediaIds: ids,
          suggestedPolygon: polygon,
          searchStatus: status,
          candidates: [],
          suggestedReferenceId: null,
        },
      });
      const selected = { ...batch, mediaIds: ids, receivedCount: 2 };
      render(selected);
      const cleanup = state.effects[0]();
      await flush();
      const markup = render(selected);
      expect(markup).toContain("Alle seriens fotopunkter");
      expect(markup).toContain('<option value="group0" selected=""');
      expect(markup).not.toContain("Du har valgt alle seriens fotopunkter");
      if (status === "too_broad") expect(markup).toMatch(/<option value="all-series" disabled=""/);
      expect(state.localize).toHaveBeenCalledExactlyOnceWith({
        data: { projectId: PROJECT, mediaIds: ids, expectedCallerUserId: ACTOR },
      });
      expect(state.prepared).not.toHaveBeenCalled();
      expect(state.run).not.toHaveBeenCalled();
      cleanup?.();
    },
  );
  it("prefills the local day for clean GPS photos but requires explicit date confirmation before sources or AI", async () => {
    state.queryData = {
      "drone-intake-project": project,
      "official-watercourse-reach": null,
      "inspection-access": { userId: ACTOR, projectId: PROJECT, canPersist: true },
    };
    state.localize.mockResolvedValue({
      projectId: PROJECT,
      actorId: ACTOR,
      photos: [
        {
          mediaId: MEDIA,
          status: "date_confirmation_required",
          localRecordingDate: "2026-08-24",
          capturedAtUtc: null,
          originalValidationStatus: "review_required",
          cameraPosition: {
            longitude: 9.05,
            latitude: 55.05,
            geometryRole: "camera_position_only",
          },
        },
      ],
      clusters: [
        {
          id: "camera-group:local-time",
          mediaIds: [MEDIA],
          searchStatus: "complete",
          suggestedReferenceId: ACTOR,
          suggestedPolygon: {
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
          candidates: [
            {
              distanceM: 10,
              reference: {
                id: ACTOR,
                name: "Foreslået vandløb",
                disclaimer: "Strækning afventer faglig afklaring.",
                geometry: {
                  type: "MultiLineString",
                  coordinates: [
                    [
                      [9.05, 55],
                      [9.05, 55.1],
                    ],
                  ],
                },
              },
            },
          ],
        },
      ],
    });
    render();
    const cleanup = state.effects[0]();
    await flush();
    const markup = render();
    expect(markup).toContain('value="2026-08-24"');
    expect(markup).toContain("UTC-tiden forbliver ukendt");
    expect(markup).toContain("originalernes kontrolstatus ændres ikke");
    expect(markup).not.toContain("Fotos, der kræver hjælp med stedet");
    const confirm = markup.match(
      /<button[^>]*>Bekræft sted og lokal optagedato, hent data og tilknyt billeder<\/button>/,
    )?.[0];
    expect(confirm).toBeDefined();
    expect(confirm).not.toContain('disabled=""');
    expect(state.run).not.toHaveBeenCalled();
    expect(state.inspect).not.toHaveBeenCalled();
    expect(state.prepared).not.toHaveBeenCalled();
    cleanup?.();
  });
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
