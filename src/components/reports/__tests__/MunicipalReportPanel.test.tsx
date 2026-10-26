import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MunicipalReportVersion } from "@/services/monitoring/municipal-report-persistence";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";

type QueryOptions = { queryKey: unknown[]; queryFn: () => Promise<unknown>; enabled?: boolean };
const state = vi.hoisted(() => ({
  cursor: 0,
  hooks: [] as unknown[],
  mountKey: null as string | null,
  actorId: "owner" as string | null,
  projectId: "case",
  access: { projectId: "case", userId: "owner", canPersist: true },
  report: null as MunicipalReportVersion | null,
  selected: null as SurveyRoundVersion | null,
  rounds: [] as SurveyRoundVersion[],
  errors: {} as Record<string, Error | undefined>,
  queries: {} as Record<string, QueryOptions>,
  refetches: [] as string[],
  mutation: undefined as { mutationFn: () => Promise<unknown> } | undefined,
  save: vi.fn(),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = initial;
      return [
        state.hooks[index],
        (next: unknown) => {
          state.hooks[index] = next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = { current: initial };
      return state.hooks[index];
    },
    useEffect: () => {},
  };
});
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: state.actorId ? { id: state.actorId } : null }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/survey-round.functions", () => ({
  getSurveyRound: async () => state.selected,
  getSurveyRoundAccess: async () => state.access,
  listSurveyRounds: vi.fn(),
}));
vi.mock("@/lib/municipal-report.functions", () => ({
  getMunicipalReport: async () => state.report,
  listMunicipalReports: vi.fn(),
  saveMunicipalReport: state.save,
}));
vi.mock("@/lib/canonical-drone-media.functions", () => ({ getCanonicalDroneMediaUrl: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useMutation: (options: { mutationFn: () => Promise<unknown> }) => {
    state.mutation = options;
    return { isPending: false, mutateAsync: options.mutationFn };
  },
  useQuery: (options: QueryOptions) => {
    const key = String(options.queryKey[0]);
    state.queries[key] = options;
    return {
      data:
        key === "municipal-report-access"
          ? state.access
          : key === "municipal-report-selected-round"
            ? state.selected
            : state.report,
      error: state.errors[key],
      isFetching: false,
      refetch: async () => {
        state.refetches.push(key);
      },
    };
  },
  useInfiniteQuery: (options: QueryOptions) => {
    const key = String(options.queryKey[0]);
    state.queries[key] = options;
    return {
      data: {
        pages: [
          {
            items:
              key === "municipal-report-rounds" ? state.rounds : state.report ? [state.report] : [],
          },
        ],
      },
      error: state.errors[key],
      isLoading: false,
      hasNextPage: false,
      refetch: async () => {
        state.refetches.push(key);
      },
    };
  },
}));

import { MunicipalReportPanel } from "../MunicipalReportPanel";
import { makeMunicipalReportFixture } from "@/services/monitoring/__tests__/municipal-report.fixtures";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";

type Props = Parameters<typeof MunicipalReportPanel>[0];
function tree(props: Partial<Props> = {}): React.ReactNode {
  const wrapper = MunicipalReportPanel({ projectId: state.projectId, ...props });
  if (!wrapper) return null;
  if (state.mountKey !== wrapper.key) {
    state.hooks = [];
    state.mountKey = wrapper.key;
  }
  state.cursor = 0;
  return (wrapper.type as (props: unknown) => React.ReactNode)(wrapper.props);
}
function find(
  value: React.ReactNode,
  label: string,
): React.ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = find(child, label);
      if (found) return found;
    }
    return;
  }
  if (!React.isValidElement<Record<string, unknown>>(value)) return;
  if (value.props["aria-label"] === label || value.props.children === label) return value;
  return find(value.props.children as React.ReactNode, label);
}

beforeEach(async () => {
  const fixture = await makeMunicipalReportFixture();
  state.projectId = fixture.baseline.projectId;
  state.actorId = "owner";
  state.access = { projectId: state.projectId, userId: "owner", canPersist: true };
  state.selected = fixture.round;
  state.rounds = [fixture.round];
  state.report = {
    id: "f1000000-0000-4000-8000-000000000001",
    projectId: state.projectId,
    version: 1,
    baselineId: fixture.baseline.id,
    baselineSha256: fixture.baseline.manifestSha256,
    planId: fixture.plan.id,
    planSha256: fixture.plan.manifestSha256,
    roundVersionId: fixture.round.id,
    roundSha256: fixture.round.manifestSha256,
    generatorVersion: fixture.manifest.generatorVersion,
    status: "draft_unreviewed",
    reportEligible: false,
    professionallyReviewed: false,
    municipalScopeApproved: false,
    generatedAt: fixture.manifest.generatedAt,
    createdAt: fixture.manifest.generatedAt,
    createdBy: "owner",
    requestId: "request",
    manifest: fixture.manifest,
    manifestSha256: await baselineSha256(fixture.manifest),
  };
  state.errors = {};
  state.queries = {};
  state.refetches = [];
  state.hooks = [];
  state.mountKey = null;
  state.save.mockClear();
});

describe("municipal report actor and investigation boundaries", () => {
  it.each([
    "municipal-report-rounds",
    "municipal-report-access",
    "municipal-report-selected-round",
    "municipal-reports",
    "municipal-report-version",
  ])("hides cached evidence and refuses writes when %s fails", async (key) => {
    state.errors[key] = new Error("private revoked access details");
    const html = renderToStaticMarkup(tree({ selectedRoundId: state.selected!.id }));
    expect(html).toContain("Rapportens input kunne ikke hentes");
    expect(html).not.toContain("private revoked access details");
    expect(html).not.toContain("Gemte data SHA-256");
    expect(html).not.toContain("Hent samlet PDF");
    expect(html).not.toContain("Dan rapport og");
    await expect(state.mutation!.mutationFn()).rejects.toThrow();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("clears the entire view on logout even when a report remains in the mocked cache", () => {
    expect(renderToStaticMarkup(tree())).toContain("Gemte data SHA-256");
    state.actorId = null;
    expect(renderToStaticMarkup(tree())).toBe("");
  });
  it("keys all queries by current actor and hides another actor's access result", () => {
    tree();
    state.actorId = "reader";
    const html = renderToStaticMarkup(tree());
    expect(Object.values(state.queries).every((query) => query.queryKey[1] === "reader")).toBe(
      true,
    );
    expect(html).not.toContain("Gemte data SHA-256");
  });
  it("refuses a viewer write despite retaining a valid readable report", async () => {
    state.access.canPersist = false;
    const html = renderToStaticMarkup(tree());
    expect(html).toContain("Du kan læse og hente gemte rapporter");
    expect(html).toContain("Gemte data SHA-256");
    await expect(state.mutation!.mutationFn()).rejects.toThrow();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("uses an explicit older investigation rather than the newest item on the first page", () => {
    state.rounds = [
      { ...state.selected!, id: "newer-round", title: "Ny undersøgelse", version: 99 },
    ];
    const selectedId = state.selected!.id;
    const result = tree({ selectedRoundId: selectedId });
    expect(find(result, "Undersøgelse til rapport")?.props.value).toBe(selectedId);
    expect(state.queries["municipal-reports"].queryKey.at(-1)).toBe(selectedId);
    expect(renderToStaticMarkup(result)).toContain(state.selected!.title);
  });
  it("sends a changed investigation back to the case journey and hides a previous round's cached report", () => {
    const onSelectRound = vi.fn();
    const result = tree({ selectedRoundId: state.selected!.id, onSelectRound });
    const selector = find(result, "Undersøgelse til rapport")!;
    (selector.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "next-round" },
    });
    expect(onSelectRound).toHaveBeenCalledWith("next-round");
    state.selected = { ...state.selected!, id: "next-round" };
    const next = tree({ selectedRoundId: "next-round", onSelectRound });
    expect(find(next, "Undersøgelse til rapport")?.props.value).toBe("next-round");
    expect(renderToStaticMarkup(next)).not.toContain("Gemte data SHA-256");
  });
  it("refreshes the cached report itself along with access and all selected inputs", () => {
    const result = tree({ selectedRoundId: state.selected!.id });
    (find(result, "Opdatér oversigt")!.props.onClick as () => void)();
    expect(state.refetches.sort()).toEqual(
      [
        "municipal-report-access",
        "municipal-report-rounds",
        "municipal-report-selected-round",
        "municipal-report-version",
        "municipal-reports",
      ].sort(),
    );
  });
  it("rejects an inaccessible or mismatched explicit investigation without latest fallback", async () => {
    tree({ selectedRoundId: state.selected!.id });
    state.selected = { ...state.selected!, projectId: "foreign-case" };
    await expect(state.queries["municipal-report-selected-round"].queryFn()).rejects.toThrow();
    state.selected = null;
    await expect(state.queries["municipal-report-selected-round"].queryFn()).rejects.toThrow();
  });
});
