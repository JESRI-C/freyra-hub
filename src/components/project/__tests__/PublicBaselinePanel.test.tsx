import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/supabase/types";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";

const state = vi.hoisted(() => ({
  snapshot: null as PublicBaselineSnapshot | null,
  savedError: null as Error | null,
  listError: null as Error | null,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("../SurveyRoundMediaPanel", () => ({ SurveyRoundMediaPanel: () => null }));
vi.mock("@/lib/survey-round.functions", () => ({
  saveSurveyRound: vi.fn(),
  getSurveyRound: vi.fn(),
  listSurveyRounds: vi.fn(),
  getSurveyRoundAccess: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/public-baseline.functions", () => ({
  createProjectBaseline: vi.fn(),
  getProjectBaseline: vi.fn(),
  listProjectBaselines: vi.fn(),
}));
vi.mock("@/lib/verification-plan.functions", () => ({
  saveVerificationPlan: vi.fn(),
  getVerificationPlan: vi.fn(),
  listVerificationPlans: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useMutation: () => ({ error: null, isPending: false, mutate: vi.fn() }),
  useInfiniteQuery: () => ({
    data: { pages: [] },
    error: null,
    isPending: false,
    hasNextPage: false,
  }),
  useQuery: (options: { queryKey: unknown[] }) =>
    options.queryKey[0] === "public-baselines"
      ? { data: state.snapshot ? [state.snapshot] : [], error: state.listError, isPending: false }
      : options.queryKey[0] === "verification-plan"
        ? { data: null, error: null, isFetching: false }
        : { data: state.snapshot, error: state.savedError, isFetching: false },
}));

import { PublicBaselinePanel } from "../PublicBaselinePanel";
import { makeSnapshot } from "@/services/baseline/__tests__/public-baseline.fixtures";

const project = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Pilot",
  slug: "pilot",
  start_date: "2026-08-24",
  geometry_polygon: null,
} as Project;

beforeEach(() => {
  state.snapshot = null;
  state.savedError = null;
  state.listError = null;
});

describe("public baseline review panel", () => {
  it("requires an actual area before fetching and shows an empty case as empty", () => {
    const html = renderToStaticMarkup(<PublicBaselinePanel project={project} />);
    expect(html).toContain("Afgræns først projektområdet");
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain("endnu intet gemt datagrundlag");
  });
  it("shows missing sources and unknown coverage without presenting them as fetched measurements", async () => {
    state.snapshot = await makeSnapshot();
    const html = renderToStaticMarkup(<PublicBaselinePanel project={project} />);
    expect(html).toContain("Version 1");
    expect(html).toContain("Officiel registrering");
    expect(html).toContain("uafklaret");
    expect(html).toContain("Afventer tilslutning");
    expect(html).toContain("Kontrolleret");
    expect(html).toContain("Denne kilde er endnu ikke hentet");
  });
  it("hides a cached manifest if reloading its saved version fails", async () => {
    state.snapshot = await makeSnapshot();
    state.savedError = new Error("Adgang til denne version er tilbagekaldt");
    const html = renderToStaticMarkup(<PublicBaselinePanel project={project} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Adgang til denne version er tilbagekaldt");
    expect(html).not.toContain("Danske Stednavne");
  });
});
