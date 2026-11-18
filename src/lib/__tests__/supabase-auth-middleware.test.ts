import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: mocks.getRequest,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthMiddlewareRunner = (input: { next: ReturnType<typeof vi.fn> }) => Promise<unknown>;

const USER_A = "30000000-0000-4000-8000-000000000001";
const runAuthMiddleware = requireSupabaseAuth.options.server as unknown as AuthMiddlewareRunner;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.createClient.mockReturnValue({ auth: { getClaims: mocks.getClaims } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireSupabaseAuth", () => {
  it("fails closed when only browser VITE aliases are configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.getRequest.mockReturnValue(
      new Request("https://example.test/server-fn", {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
    const next = vi.fn();

    await expect(runAuthMiddleware({ next })).rejects.toThrow(
      "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a request without a bearer token before JWT verification", async () => {
    mocks.getRequest.mockReturnValue(new Request("https://example.test/server-fn"));
    const next = vi.fn();

    await expect(runAuthMiddleware({ next })).rejects.toThrow(
      "Unauthorized: No authorization header provided",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid token without invoking the protected handler", async () => {
    mocks.getRequest.mockReturnValue(
      new Request("https://example.test/server-fn", {
        headers: { Authorization: "Bearer invalid-token" },
      }),
    );
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("invalid") });
    const next = vi.fn();

    await expect(runAuthMiddleware({ next })).rejects.toThrow("Unauthorized: Invalid token");
    expect(mocks.getClaims).toHaveBeenCalledWith("invalid-token");
    expect(next).not.toHaveBeenCalled();
  });

  it("uses verified claims.sub as the only server-side user identity", async () => {
    mocks.getRequest.mockReturnValue(
      new Request("https://example.test/server-fn", {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_A, role: "authenticated" } },
      error: null,
    });
    const next = vi.fn().mockResolvedValue({ ok: true });

    await expect(runAuthMiddleware({ next })).resolves.toEqual({ ok: true });
    expect(next).toHaveBeenCalledWith({
      context: {
        supabase: { auth: { getClaims: mocks.getClaims } },
        userId: USER_A,
        claims: { sub: USER_A, role: "authenticated" },
      },
    });
  });
});
