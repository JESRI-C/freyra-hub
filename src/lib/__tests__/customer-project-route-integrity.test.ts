import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  demo: false,
  mediaError: null as Error | null,
  mediaServiceError: null as string | null,
  mediaQuery: null as (() => Promise<unknown>) | null,
  preview: vi.fn(() => ({})),
  sensors: vi.fn(() => [{ id: "demo-sensor" }]),
}));
const project = {
  id: "project-a",
  slug: "pilot",
  name: "Pilot",
  municipality: "Haderslev",
  geometry_centroid_lat: 55,
  geometry_centroid_lng: 9,
  geometry_polygon: null,
};
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ slug: "pilot" }),
    // The retained full-app overview is now opened through Flere sagsværktøjer.
    // Exercise the same evidence guards on that explicit tab.
    useSearch: () => ({ tab: "overblik" }),
    useNavigate: () => vi.fn(),
  }),
  notFound: () => new Error("not found"),
  Link: () => null,
}));
vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: (options: { queryKey: string[]; queryFn: () => Promise<unknown> }) => {
    if (options.queryKey[0] === "project-by-slug") return { data: project };
    if (options.queryKey[0] === "environmental-context") return { data: {} };
    if (options.queryKey[0] === "project-media") {
      state.mediaQuery = options.queryFn;
      return { data: [], error: state.mediaError, isFetching: false };
    }
    return { data: [] };
  },
  useQuery: () => ({ data: { points: [] } }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/data-mode", () => ({
  get isDemoDataEnabled() {
    return state.demo;
  },
}));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: false, supabase: null }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/project/ProjectHeader", () => ({ ProjectHeader: () => null }));
vi.mock("@/components/project/ProjectTabs", () => ({ ProjectTabs: () => null }));
// This test exercises the route's data guards. Atlas behavior has its own tests.
vi.mock("@/components/project-workspace/ProjectPhotoAtlas", () => ({
  ProjectPhotoAtlas: () => null,
}));
vi.mock("@/lib/report-engine", () => ({
  generateProjectReportPreview: state.preview,
  getRecommendedNextAction: () => null,
}));
vi.mock("@/services/iot-simulation-service", () => ({ getProjectSensors: state.sensors }));
vi.mock("@/services/project-media-service", () => ({
  listProjectMedia: async () => ({ data: null, error: state.mediaServiceError }),
}));
vi.mock("@/services/geo-service", () => ({
  resolveProjectGeometry: () => ({ centroid: { lat: 55, lng: 9 }, hasValidGeometry: true }),
  validateProjectPolygon: () => ({ valid: true }),
}));

import { Route } from "@/routes/app.projects.$slug";

function renderProject() {
  return renderToStaticMarkup(React.createElement(Route.options.component as React.ComponentType));
}

beforeEach(() => {
  state.demo = false;
  state.mediaError = null;
  state.mediaServiceError = null;
  state.mediaQuery = null;
  state.preview.mockClear();
  state.sensors.mockClear();
});

describe("customer project evidence guards", () => {
  it("retains only supported task links and normalizes the exact copied round ID", () => {
    const validate = Route.options.validateSearch as (value: Record<string, unknown>) => {
      tab?: string;
      round?: string;
      task?: string;
      work?: string;
    };
    expect(validate({ tab: "rapporter", round: "A1000000-0000-4000-8000-000000000001" })).toEqual({
      tab: "rapporter",
      round: "a1000000-0000-4000-8000-000000000001",
    });
    expect(validate({ tab: "unrecognized", round: "not-a-version" })).toEqual({});
    expect(
      validate({
        step: "udfoerelse",
        round: "A1000000-0000-4000-8000-000000000001",
        task: "B1000000-0000-4000-8000-000000000002",
        work: "execution",
      }),
    ).toEqual({
      step: "udfoerelse",
      round: "a1000000-0000-4000-8000-000000000001",
      task: "b1000000-0000-4000-8000-000000000002",
      work: "execution",
    });
    expect(validate({ task: "not-a-task", work: "approval" })).toEqual({});
  });
  it("does not generate simulated sensor readings or feed them to report preview in customer mode", () => {
    renderProject();
    expect(state.sensors).not.toHaveBeenCalled();
    expect(state.preview).toHaveBeenCalledWith(expect.objectContaining({ sensors: [] }));
  });

  it("keeps generated sensor data in explicit offline demo only", () => {
    state.demo = true;
    renderProject();
    expect(state.sensors).not.toHaveBeenCalled();
    expect(state.preview).toHaveBeenCalledWith(expect.objectContaining({ sensors: [] }));
  });

  it("rejects a media service error instead of resolving an empty evidence list", async () => {
    renderProject();
    state.mediaServiceError = "backend unavailable";
    expect(state.mediaQuery).not.toBeNull();
    await expect(state.mediaQuery!()).rejects.toThrow("Projektets medier kunne ikke hentes.");
  });

  it("stops report preview on a failed background media refresh", () => {
    state.mediaError = new Error("Projektets medier kunne ikke hentes.");
    expect(renderProject).toThrow("Projektets medier kunne ikke hentes.");
    expect(state.preview).not.toHaveBeenCalled();
    expect(state.sensors).not.toHaveBeenCalled();
  });
});
