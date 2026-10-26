import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  project: { id: "project-a", name: "Syntetisk projekt", slug: "syntetisk" } as {
    id: string;
    name: string;
    slug: string;
  } | null,
  query: vi.fn((_options: { queryKey: unknown[]; enabled: boolean }) => ({
    data: [],
    error: null,
    isLoading: false,
  })),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    currentOrg: { id: "org-a", name: "Testorganisation" },
    currentProject: state.project,
    user: { id: "user-a" },
    session: null,
  }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/report-draft.functions", () => ({ generateEvidenceReportDraft: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: state.query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
  useRouterState: () => ({}),
  Link: ({
    children,
    to,
    search: _search,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    search?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
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
  state.project = { id: "project-a", name: "Syntetisk projekt", slug: "syntetisk" };
  state.query.mockClear();
});
describe("municipal report customer boundaries", () => {
  it("every direct route uses the selected tenant and project without invented results", async () => {
    for (const load of imports) {
      state.query.mockClear();
      const { Route } = await load();
      const html = renderToStaticMarkup(
        React.createElement(Route.options.component as React.ComponentType),
      );
      expect(html).toContain("Testorganisation / Syntetisk projekt");
      for (const invented of ["Skallebæk", "Emma Larsen", "Mikkel Holm", "82%", "91%", "Q2 2026"])
        expect(html).not.toContain(invented);
      expect(state.query.mock.calls[0][0]).toMatchObject({
        queryKey: ["report-documents", "user-a", "org-a", "project-a"],
        enabled: true,
      });
    }
  });
  it("requires a selected project and disables reads instead of substituting a demo", async () => {
    state.project = null;
    const { Route } = await imports[0]();
    const html = renderToStaticMarkup(
      React.createElement(Route.options.component as React.ComponentType),
    );
    expect(html).toContain("Vælg organisation og projekt");
    expect(state.query.mock.calls.every(([options]) => !options.enabled)).toBe(true);
    expect(html).not.toContain("Syntetisk projekt");
  });
  it("shows an empty library and four reusable templates without claiming approval", async () => {
    const { Route } = await imports[0]();
    const html = renderToStaticMarkup(
      React.createElement(Route.options.component as React.ComponentType),
    );
    expect(html).toContain("Der er endnu ingen gemte rapporter for projektet.");
    expect(html.split('href="/app/reports/new"').length - 1).toBe(4);
    expect(html).toContain("Manglende");
    expect(html).not.toContain("Godkendt");
  });
});
