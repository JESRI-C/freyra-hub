import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMunicipalRoute, MUNICIPAL_PROJECT_TABS } from "../demo-mode";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/app/projects",
  Link: ({ children, to }: { children?: ReactNode; to: string }) =>
    createElement("a", { href: to }, children),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    currentOrg: { name: "Haderslev Kommune" },
    currentProject: { name: "Bykær Bæk" },
  }),
}));
afterEach(() => vi.unstubAllEnvs());

describe("kommunens arbejdsflade", () => {
  it.each([
    "/app/projects",
    "/app/projects/",
    "/app/projects/bykaer",
    "/app/projects/bykaer/",
    "/app/projects/geometry/bykaer",
    "/app/projects/geometry/bykaer/",
    "/app/lavbund/id/kort",
    "/app/lavbund/10000000-0000-4000-8000-000000000001/kort/",
  ])("viser %s", (path) => {
    expect(isMunicipalRoute(path)).toBe(true);
  });
  it.each([
    "/app/credits",
    "/app/impact",
    "/app/public-impact",
    "/app/decisions",
    "/app/connect",
    "/app/connect/map",
    "/app/connect/registry",
    "/app/connect/sensors",
    "/app/construction",
    "/app/system-test",
    "/app/overview",
    "/app/reports",
    "/app/reports/",
    "/app/reports/preview",
    "/app/reports/builder",
    "/app/reports/library",
    "/app/reports/templates",
    "/app/reports/readiness",
    "/app/reports/approval",
    "/app/reports/new",
    "/app/ledger",
    "/app/ledger/audit",
    "/app/ledger/sources",
    "/app/ledger/documents",
    "/app/ledger/metrics",
    "/app/ledger/co2",
    "/app/ledger/csrd",
    "/app/ledger/reporting",
    "/app/settings",
    "/app/settings/users",
    "/app/settings/access",
    "/app/settings/billing",
    "/app/settings/frameworks",
    "/app/settings/projects",
    "/app/settings/modules",
    "/app/settings/notifications",
    "/app/settings/security",
    "/app/lavbund",
    "/app/lavbund/id",
    "/app/lavbund/id/revisionsspor",
    "/app/lavbund/id/klima",
    "/app/lavbund/id/fosfor",
    "/app/lavbund/id/rapport",
    "/app/lavbund/id/kort/ekstra",
    "/app/projects/map/bykaer",
    "/app/projects/bykaer/settings",
    "/app/projects/bykaer/rapport",
    "/app/projects-extra",
    "/app/projects/bykaer?tab=impact",
    "/app/projects/bykaer%2Fsettings",
    "/app/projects/bykaer%5Csettings",
    "/app/projects/bykaer\\settings",
    "/app/projects/bykaer#prototype",
    "https://example.test/app/projects",
  ])("skjuler også direkte navigation til %s", (path) => {
    expect(isMunicipalRoute(path)).toBe(false);
  });
  it("viser kun de leverbare projektfaner", () => {
    expect([...MUNICIPAL_PROJECT_TABS]).toEqual([
      "arbejde",
      "rapporter",
      "grundlag",
      "audit",
      "roller",
    ]);
  });
  it("viser Sager og Kilder i DEMO-menuen og bevarer /select til arbejdspladsvalg og logout", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_DEMO_MODE", "true");
    const { AppSidebar } = await import("@/components/AppSidebar");
    const html = renderToStaticMarkup(createElement(AppSidebar));
    const navigation = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
    expect(navigation.match(/href="[^"]+"/g)).toEqual([
      'href="/app/projects"',
      'href="/app/sources"',
    ]);
    expect(navigation).toContain("Sager");
    expect(navigation).toContain("Kilder");
    expect(html).toContain("Alle kategorier");
    expect(html).toContain("Indstillinger");
    expect(html).toContain('href="/app/impact"');
    expect(html).toContain('href="/app/connect"');
    expect(html).toContain('href="/app/lavbund"');
    expect(html).toContain('href="/select"');
  });
});
