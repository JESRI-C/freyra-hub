import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  client: {
    auth: { marker: "canonical-auth" },
    from: vi.fn(),
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("window", {});
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "legacy_anon_shadowed");
  mocks.createClient.mockReturnValue(mocks.client);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("browser Supabase client", () => {
  it("shares one GoTrue client across canonical and generated import paths", async () => {
    const canonical = await import("@/lib/supabase/client");
    const generated = await import("@/integrations/supabase/client");

    expect(canonical.supabase).toBe(mocks.client);
    expect(canonical.getSupabaseClient()).toBe(mocks.client);
    expect(generated.supabase.auth).toBe(mocks.client.auth);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_publishable_test",
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  });

  it("uses the legacy anon key only as a browser-key fallback", async () => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "legacy_anon_test");

    const canonical = await import("@/lib/supabase/client");

    expect(canonical.isSupabaseConfigured).toBe(true);
    expect(canonical.getSupabaseClient()).toBe(mocks.client);
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "legacy_anon_test",
      expect.any(Object),
    );
  });

  it("stays import-safe but fails closed on use when browser configuration is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");

    const canonical = await import("@/lib/supabase/client");
    const generated = await import("@/integrations/supabase/client");

    expect(canonical.isSupabaseConfigured).toBe(false);
    expect(canonical.supabase).toBeNull();
    expect(canonical.getSupabaseClient()).toBeNull();
    expect(() => generated.supabase.auth).toThrow(
      "Missing browser Supabase environment variable(s)",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("does not turn server aliases into a persistent browser auth client", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_URL", "https://server-only.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_server_only");

    const canonical = await import("@/lib/supabase/client");
    const generated = await import("@/integrations/supabase/client");

    expect(canonical.isSupabaseConfigured).toBe(false);
    expect(canonical.getSupabaseClient()).toBeNull();
    expect(() => generated.supabase.auth).toThrow("VITE_SUPABASE_URL");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("disables persistent auth when the shared module is evaluated during SSR", async () => {
    vi.unstubAllGlobals();

    const canonical = await import("@/lib/supabase/client");

    expect(canonical.getSupabaseClient()).toBe(mocks.client);
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_publishable_test",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  });
});
