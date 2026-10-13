import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as {
    antalProjekter: number;
    samletArealHa: number;
    krediteretTotal: number;
    verificeretTotal: number | null;
  } | null,
  error: null as Error | null,
  queryKey: null as unknown[] | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ currentOrg: { id: "org-a", name: "Haderslev" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: () => ({ data: [] }),
  useQuery: (options: { queryKey: unknown[] }) => {
    state.queryKey = options.queryKey;
    return { data: state.data, error: state.error };
  },
}));
vi.mock("@/services/projects-service", () => ({ getAllNatureProjectSummaries: vi.fn() }));
vi.mock("@/services/actions-service", () => ({ getAllOpenActions: vi.fn() }));
vi.mock("@/services/reports-service", () => ({ getAllReports: vi.fn() }));

import { Route } from "@/routes/app.overview";

function renderOverview() {
  return renderToStaticMarkup(React.createElement(Route.options.component as React.ComponentType));
}

beforeEach(() => {
  state.data = null;
  state.error = null;
  state.queryKey = null;
});

describe("customer overview Lavbund data state", () => {
  it("does not invent a Lavbund portfolio when no data exists", () => {
    const html = renderOverview();
    expect(html).not.toContain("LavbundsMRV");
    expect(state.queryKey).toEqual(["lavbund", "overblik", "org-a"]);
  });

  it("shows a source error and suppresses previously cached figures on failed refresh", () => {
    state.data = {
      antalProjekter: 4,
      samletArealHa: 793.3,
      krediteretTotal: 9878.8,
      verificeretTotal: 600,
    };
    state.error = new Error("Source unavailable");
    const html = renderOverview();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Lavbundsdata kunne ikke hentes");
    expect(html).not.toContain("793,3");
    expect(html).not.toContain("9.878,8");
    expect(html).not.toContain("Verificeret (bogført)");
  });

  it("does not claim zero verified effect when the snapshot total is unknown", () => {
    state.data = {
      antalProjekter: 1,
      samletArealHa: 12,
      krediteretTotal: 90,
      verificeretTotal: null,
    };
    const html = renderOverview();
    expect(html).toContain("Verificeret (bogført)");
    expect(html).toContain("90 t CO₂e/år");
    expect(html).not.toContain(">0 t CO₂e/år<");
  });

  it("preserves real, known zero verification and stored portfolio figures", () => {
    state.data = { antalProjekter: 1, samletArealHa: 12, krediteretTotal: 90, verificeretTotal: 0 };
    expect(renderOverview()).toContain(">0 t CO₂e/år<");
  });
});
