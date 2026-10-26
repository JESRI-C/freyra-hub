import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configured: true,
  project: { id: "project-a", name: "Bykær Bæk", slug: "bykaer-baek" } as {
    id: string;
    name: string;
    slug: string | null;
  } | null,
}));
vi.mock("@/lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ currentOrg: { name: "Haderslev Kommune" }, currentProject: state.project }),
}));
vi.mock("@/components/AppSidebar", () => ({ MobileSidebarTrigger: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children?: React.ReactNode;
    to: string;
    params?: { slug?: string };
    className?: string;
    title?: string;
  }) => (
    <a href={to.replace("$slug", params?.slug ?? "")} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_APP_DATA_MODE", "customer");
  state.configured = true;
  state.project = { id: "project-a", name: "Bykær Bæk", slug: "bykaer-baek" };
});
afterEach(() => vi.unstubAllEnvs());

async function renderContext() {
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { GlobalContextBar } = await import("@/components/GlobalContextBar");
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <GlobalContextBar />
    </QueryClientProvider>,
  );
}

describe("truthful global project context", () => {
  it.each(["customer", "demo"])(
    "never labels a configured customer database as demo or invents metrics in %s mode",
    async (mode) => {
      vi.stubEnv("VITE_APP_DATA_MODE", mode);
      const html = await renderContext();
      expect(html).toContain("Haderslev Kommune");
      expect(html).toContain("Bykær Bæk");
      expect(html).toContain('href="/app/projects/bykaer-baek"');
      expect(html).toContain("Se sagens datagrundlag");
      for (const invented of [
        "Q2 2026",
        "3 min",
        "Datafriskhed",
        "Datakvalitet",
        "91%",
        "Under verifikation",
        "Demo data aktiv",
        "Start demo",
      ]) {
        expect(html).not.toContain(invented);
      }
      const { DemoModeBadge } = await import("@/components/platform/Primitives");
      expect(renderToStaticMarkup(<DemoModeBadge />)).toBe("");
    },
  );

  it("only labels explicit offline demo", async () => {
    state.configured = false;
    vi.stubEnv("VITE_APP_DATA_MODE", "demo");
    const html = await renderContext();
    expect(html).toContain("Demo data aktiv");
    expect(html).toContain("Start demo");
  });

  it("does not turn missing configuration into demo", async () => {
    state.configured = false;
    expect(await renderContext()).not.toContain("Demo data aktiv");
  });

  it("uses the real project UUID if it has no slug and requires selection if no project exists", async () => {
    state.project!.slug = null;
    expect(await renderContext()).toContain('href="/app/projects/project-a"');
    state.project = null;
    const html = await renderContext();
    expect(html).toContain("Vælg sag for at se datagrundlag");
    expect(html).not.toContain("/app/projects/project-a");
  });
});
