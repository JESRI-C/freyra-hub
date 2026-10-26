// Offline boundary tests only: no gateway, account or network calls.
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), generateText: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
vi.mock("ai", () => ({ generateText: mocks.generateText, Output: { object: () => ({}) } }));
vi.mock("../ai-gateway.server", () => ({ createLovableAiGatewayProvider: () => () => ({}) }));
import { askDecisionsAssistant } from "../decisions-assistant.functions";
const call = askDecisionsAssistant as unknown as (input: {
  data: Record<string, string>;
}) => Promise<{ error: boolean; reason: string | null; reply: unknown }>;
const input = {
  data: {
    accessToken: "offline-token",
    organizationId: "org-a",
    projectId: "project-a",
    question: "Hvad er grundlaget?",
  },
};
describe("prepared assistant scope boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "offline-public-key");
    vi.stubEnv("LOVABLE_API_KEY", "offline-provider-key");
  });
  it("rejects an invalid login before reading project data or invoking a provider", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect((await call(input)).reason).toBe("unauthorized");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it("requires the exact organization and project rather than trusting a supplied project name", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.from.mockReturnValue(q);
    expect((await call(input)).reason).toBe("unauthorized");
    expect(q.eq).toHaveBeenCalledWith("id", "project-a");
    expect(q.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
