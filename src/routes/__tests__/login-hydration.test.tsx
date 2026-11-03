// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hydrated: false, loading: false, signIn: vi.fn() }));
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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: state.signIn } },
}));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: {} } }));
import { Route } from "../login";

function markup() {
  const Page = Route.options.component as React.ComponentType;
  return renderToStaticMarkup(<Page />);
}
beforeEach(() => {
  state.hydrated = false;
  state.loading = false;
  state.signIn.mockReset();
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
  it("shows a persistent in-form recovery message for an HTTP 429 and keeps the inputs", async () => {
    state.hydrated = true;
    state.signIn.mockResolvedValue({
      error: Object.assign(new Error("Request rejected"), { status: 429 }),
    });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      const Page = Route.options.component as React.ComponentType;
      await act(async () => root.render(<Page />));
      const [email, password] = host.querySelectorAll<HTMLInputElement>("input");
      expect(email.labels?.[0]?.textContent).toBe("E-mail");
      expect(password.labels?.[0]?.textContent).toBe("Adgangskode");
      const toggle = host.querySelector<HTMLButtonElement>('button[aria-label="Vis adgangskode"]')!;
      expect(toggle.tabIndex).toBe(0);
      await act(async () => toggle.click());
      expect(password.type).toBe("text");
      await act(async () => toggle.click());
      expect(password.type).toBe("password");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {
        set.call(email, "someone@example.test");
        email.dispatchEvent(new Event("input", { bubbles: true }));
        set.call(password, "test-password");
        password.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const form = host.querySelector("form")!;
      await act(async () =>
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
      expect(state.signIn).toHaveBeenCalledExactlyOnceWith({
        email: "someone@example.test",
        password: "test-password",
      });
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("Vent et par minutter");
      expect(email.value).toBe("someone@example.test");
      expect(password.value).toBe("test-password");
      const forgot = [...host.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Glemt?",
      );
      await act(async () => forgot?.click());
      expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });
});
