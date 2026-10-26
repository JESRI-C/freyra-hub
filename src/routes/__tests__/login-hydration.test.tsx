import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hydrated: false, loading: false }));
vi.mock("react", async (load) => ({
  ...(await load<typeof import("react")>()),
  useSyncExternalStore: (_subscribe: unknown, client: () => boolean, server: () => boolean) =>
    state.hydrated ? client() : server(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useSearch: () => ({}),
  }),
  useNavigate: () => vi.fn(),
  Navigate: () => null,
  Link: () => null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: state.loading, refreshing: false, authError: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: {} } }));
import { Route } from "../login";

function markup() {
  const Page = Route.options.component as React.ComponentType;
  return renderToStaticMarkup(<Page />);
}
beforeEach(() => {
  state.hydrated = false;
  state.loading = false;
});
describe("login hydration boundary", () => {
  it("renders both credential fields and sign-in actions disabled before hydration", () => {
    const html = markup();
    expect(html).toContain("Gør login klar …");
    const fields = html.match(/<input[^>]+>/g) ?? [];
    expect(fields).toHaveLength(2);
    for (const field of fields) expect(field).toContain('disabled=""');
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled=""');
  });
  it("enables input only after hydration and auth bootstrap are ready", () => {
    state.hydrated = true;
    const ready = markup();
    expect(ready).not.toContain("Gør login klar …");
    for (const field of ready.match(/<input[^>]+>/g) ?? [])
      expect(field).not.toContain('disabled=""');
    expect(ready.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).not.toContain('disabled=""');
    state.loading = true;
    for (const field of markup().match(/<input[^>]+>/g) ?? [])
      expect(field).toContain('disabled=""');
  });
});
