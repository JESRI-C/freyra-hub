import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configured: true,
  project: { id: "project-a", name: "Syntetisk projekt", slug: "syntetisk" } as {
    id: string;
    name: string;
    slug: string | null;
  } | null,
  allReports: vi.fn(async () => []),
  suspense: vi.fn(() => ({ data: [] })),
  live: vi.fn(() => []),
  ai: vi.fn(() => null),
}));
vi.mock("@/lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
  supabase: null,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ currentProject: state.project }) }));
vi.mock("@/services/reports-service", () => ({
  getAllReports: state.allReports,
  reportStatusTone: () => "neutral",
}));
vi.mock("@/lib/platform-live", () => ({
  useLiveActivityFeed: state.live,
  useLiveCriticalActions: state.live,
}));
vi.mock("@/components/ai/AiReportDraft", () => ({ AiReportDraft: state.ai }));
vi.mock("@/components/ai/AiInsightBanner", () => ({ AiInsightBanner: state.ai }));
vi.mock("@/components/AppTopbar", () => ({ AppTopbar: () => null }));
vi.mock("@tanstack/react-query", () => ({ useSuspenseQuery: state.suspense }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    params?: { slug: string };
    className?: string;
  }) => (
    <a href={to.replace("$slug", params?.slug ?? "")} {...props}>
      {children}
    </a>
  ),
  Outlet: () => null,
  useRouterState: () => "/app/reports",
}));

const imports = [
  () => import("@/routes/app.reports.index"),
  () => import("@/routes/app.reports.new"),
  () => import("@/routes/app.reports.builder"),
  () => import("@/routes/app.reports.preview"),
  () => import("@/routes/app.reports.readiness"),
  () => import("@/routes/app.reports.templates"),
  () => import("@/routes/app.reports.library"),
  () => import("@/routes/app.reports.approval"),
];
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_APP_DATA_MODE", "customer");
  state.configured = true;
  state.project = { id: "project-a", name: "Syntetisk projekt", slug: "syntetisk" };
  state.allReports.mockClear();
  state.suspense.mockClear();
  state.live.mockClear();
  state.ai.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("municipal report customer boundaries", () => {
  it.each(["customer", "demo"])(
    "configured database remains truthful in %s mode on every direct route",
    async (mode) => {
      vi.stubEnv("VITE_APP_DATA_MODE", mode);
      for (const load of imports) {
        const { Route } = await load();
        const html = renderToStaticMarkup(
          React.createElement(Route.options.component as React.ComponentType),
        );
        expect(html).toContain("Rapportarbejdet foregår i projektet");
        expect(html).toContain('href="/app/projects/syntetisk"');
        for (const invented of [
          "Skallebæk",
          "Emma Larsen",
          "Mikkel Holm",
          "82%",
          "91%",
          "Q2 2026",
          "Godkendt",
          "Eksportér PDF",
        ])
          expect(html).not.toContain(invented);
      }
      const { Route } = await imports[0]();
      const ensureQueryData = vi.fn(async (options: { queryFn: () => Promise<unknown> }) =>
        options.queryFn(),
      );
      await (Route.options.loader as (input: unknown) => unknown)({
        context: { queryClient: { ensureQueryData } },
      });
      expect(ensureQueryData).not.toHaveBeenCalled();
      expect(state.allReports).not.toHaveBeenCalled();
      expect(state.suspense).not.toHaveBeenCalled();
      expect(state.live).not.toHaveBeenCalled();
      expect(state.ai).not.toHaveBeenCalled();
    },
  );

  it("requires a project and does not substitute a demo when none is selected", async () => {
    state.project = null;
    const { Route } = await imports[0]();
    const html = renderToStaticMarkup(
      React.createElement(Route.options.component as React.ComponentType),
    );
    expect(html).toContain('href="/app/projects"');
    expect(html).toContain("Vælg et projekt");
    expect(state.suspense).not.toHaveBeenCalled();
  });

  it("only permits the previous examples in explicit offline demo and labels them in the layout", async () => {
    state.configured = false;
    vi.stubEnv("VITE_APP_DATA_MODE", "demo");
    const { Route } = await imports[0]();
    const ensureQueryData = vi.fn(async (options: { queryFn: () => Promise<unknown> }) =>
      options.queryFn(),
    );
    await (Route.options.loader as (input: unknown) => unknown)({
      context: { queryClient: { ensureQueryData } },
    });
    expect(ensureQueryData).toHaveBeenCalledOnce();
    expect(state.allReports).toHaveBeenCalledOnce();
    const { Route: layout } = await import("@/routes/app.reports");
    const html = renderToStaticMarkup(
      React.createElement(layout.options.component as React.ComponentType),
    );
    expect(html).toContain("Offline eksempelvisning");
    expect(html).toContain("opdigtede");
    expect(html).toContain("gælder ingen kundesag");
  });
});
