import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  demo: false,
  projectId: "project-a" as string | null,
  alerts: [] as Array<Record<string, unknown>>,
  alertError: false,
  loaded: true,
  analysis: {
    result: null as unknown,
    summary: null as unknown,
    stepsFailed: [] as string[],
    durationS: 1,
    error: null,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    if (options.queryKey[0] === "monitoring-alerts")
      return {
        data: state.alerts,
        isSuccess: state.loaded,
        isError: state.alertError,
        isLoading: !state.loaded,
        refetch: vi.fn(),
      };
    if (options.queryKey[0] === "projects")
      return {
        data: [
          {
            id: "project-a",
            name: "Pilot",
            slug: "pilot",
            geometry_centroid_lat: 55,
            geometry_centroid_lng: 9,
          },
        ],
        isLoading: false,
      };
    return { data: [], isSuccess: true, isError: false, isLoading: false, refetch: vi.fn() };
  },
}));
vi.mock("@/lib/connect-context", () => ({
  useConnectContext: () => ({ projectId: state.projectId }),
}));
vi.mock("@/lib/data-mode", () => ({
  get isDemoDataEnabled() {
    return state.demo;
  },
  requireCustomerDatabase: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock("@/components/monitoring/RuleDrawer", () => ({ RuleDrawer: () => null }));
vi.mock("@/components/connect/Primitives", () => ({
  ConnectionHealthCard: ({ label, value }: { label: string; value: string }) =>
    React.createElement("div", { "data-kpi": label }, value),
  Section: ({ children, title }: { children: React.ReactNode; title: string }) =>
    React.createElement("section", null, title, children),
  Drawer: () => null,
  SeverityBadge: ({ severity }: { severity: string }) =>
    React.createElement("span", null, severity),
  Chip: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
}));
vi.mock("@/components/ui-bits", () => ({
  Card: ({ children, role }: { children: React.ReactNode; role?: string }) =>
    React.createElement("div", { role }, children),
  CardHeader: () => null,
  PageHeader: () => null,
  Pill: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
  Bars: () => React.createElement("div", null, "DEMO_WEEK_CHART"),
}));
vi.mock("@/hooks/useMapEditor", () => ({
  useMapEditor: () => ({ zones: [], sensors: [], coverage: {}, setDrawMode: vi.fn() }),
}));
vi.mock("@/hooks/useNdvi", () => ({ useNdvi: () => ({ ndvi: null }) }));
vi.mock("@/hooks/useFullAnalysis", () => ({
  useFullAnalysis: () => ({ ...state.analysis, run: vi.fn(), isRunning: false }),
}));
vi.mock("@/components/maps/MapEditorMap", () => ({ MapEditorMap: () => null }));
vi.mock("@/components/nature/SpeciesIdentifier", () => ({ SpeciesIdentifier: () => null }));
vi.mock("@/components/ui/switch", () => ({ Switch: () => null }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: () => null,
  DialogContent: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
  DialogFooter: () => null,
}));

import { Route as AlertRoute } from "@/routes/app.connect.alerts";
import { Route as MapRoute } from "@/routes/app.connect.map";
import { Route as IntegrationRoute } from "@/routes/app.connect.integrations";
import { Route as LiveRoute } from "@/routes/app.connect.live";

function renderRoute(route: { options: { component?: unknown } }): string {
  return renderToStaticMarkup(React.createElement(route.options.component as React.ComponentType));
}

describe("customer source availability", () => {
  it("does not present example integration owners and activity as active connections", () => {
    const html = renderRoute(IntegrationRoute);
    expect(html).toContain("afventer tilslutning");
    expect(html).not.toContain("12.4k");
    expect(html).not.toContain("Mikkel Holm");
  });
  it("does not present fixed example observations as a real live feed", () => {
    const html = renderRoute(LiveRoute);
    expect(html).toContain("afventer tilslutning");
    expect(html).not.toContain("1.284");
    expect(html).not.toContain("91%");
  });
});

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-a",
    title: "Reel alarm",
    severity: "critical",
    status: "active",
    project_id: "project-a",
    alert_type: "threshold",
    source_type: "sensor",
    triggered_at: "2026-10-13T08:00:00Z",
    updated_at: "2026-10-13T09:00:00Z",
    acknowledged_at: null,
    assigned_to: null,
    message: "Kontrollér måleren",
    __live: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.demo = false;
  state.projectId = "project-a";
  state.alerts = [];
  state.alertError = false;
  state.loaded = true;
  state.analysis = { result: null, summary: null, stepsFailed: [], durationS: 1, error: null };
});

describe("customer alert dashboard", () => {
  it("renders real counts from loaded alerts and excludes resolved rows from active severity counts", () => {
    state.alerts = [
      alert(),
      alert({
        id: "alert-b",
        severity: "warning",
        status: "acknowledged",
        acknowledged_at: "2026-10-13T09:00:00Z",
      }),
      alert({ id: "alert-c", severity: "low", status: "resolved" }),
    ];
    const html = renderRoute(AlertRoute);
    expect(html).toContain('data-kpi="Aktive alerts">2');
    expect(html).toContain('data-kpi="Kritiske">1');
    expect(html).toContain('data-kpi="Medium">1');
    expect(html).toContain('data-kpi="Lav">0');
    expect(html).toContain('data-kpi="Løst (hentede)">1');
    expect(html).toContain('data-kpi="Ø tid til bekræftelse">1 t');
    expect(html).toContain("senest hentede 3 alarmer (højst 100)");
    expect(html).not.toContain("DEMO_WEEK_CHART");
    expect(html).not.toContain("Operationelle anbefalinger");
  });

  it("keeps an actual empty result empty without supplying 17 demo alarms", () => {
    const html = renderRoute(AlertRoute);
    expect(html).toContain('data-kpi="Aktive alerts">0');
    expect(html).toContain("Ingen alarmer i dette filter.");
    expect(html).not.toContain("Low battery");
    expect(html).not.toContain("Operationelle anbefalinger");
  });

  it("shows unknown KPI and an explicit backend error rather than stale alarms or an empty-success claim", () => {
    state.alertError = true;
    state.alerts = [alert()];
    const html = renderRoute(AlertRoute);
    expect(html).toContain('data-kpi="Aktive alerts">—');
    expect(html).toContain("Alarmer kunne ikke hentes.");
    expect(html).not.toContain("Reel alarm");
    expect(html).not.toContain("Ingen alarmer i dette filter.");
  });

  it("does not report zero alarms while waiting for the first query", () => {
    state.loaded = false;
    const html = renderRoute(AlertRoute);
    expect(html).toContain('data-kpi="Aktive alerts">—');
    expect(html).toContain("Henter alarmer…");
    expect(html).not.toContain("Ingen alarmer i dette filter.");
  });

  it("asks for a project and keeps counts unknown when no project is selected", () => {
    state.projectId = null;
    const html = renderRoute(AlertRoute);
    expect(html).toContain("Vælg et projekt for at se dets alarmer.");
    expect(html).toContain('data-kpi="Aktive alerts">—');
  });

  it("limits fixed chart and recommendations to explicit demo", () => {
    state.demo = true;
    const html = renderRoute(AlertRoute);
    expect(html).toContain("Demovisning med eksempelalarmer.");
    expect(html).toContain("DEMO_WEEK_CHART");
    expect(html).toContain("Operationelle anbefalinger");
  });
});

describe("map analysis persistence feedback", () => {
  it("does not call an unsaved NDVI sample a saved analysis", () => {
    state.analysis.result = {
      ndvi: { savedToDb: false },
      biodiversity: null,
      carbon: null,
      water: null,
    };
    state.analysis.summary = {};
    const html = renderRoute(MapRoute);
    expect(html).toContain("ingen analyseresultater gemt");
    expect(html).not.toContain("resultat gemt i databasen");
  });

  it("states only the number of results actually persisted", () => {
    state.analysis.result = {
      ndvi: { savedToDb: false },
      biodiversity: { savedToDb: true },
      carbon: { savedToDb: true },
      water: null,
    };
    state.analysis.summary = {};
    expect(renderRoute(MapRoute)).toContain("2 resultater gemt i databasen");
  });
});
