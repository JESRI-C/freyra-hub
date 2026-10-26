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
vi.mock("../ai-gateway.server", () => ({
  withBoundedAiGateway: async (_key: string, fn: (limits: object) => Promise<unknown>) =>
    fn({ model: {}, maxRetries: 0 }),
  requireBoundedAiText: (value: string) => value,
  aiPublicFailure: () => "unknown",
}));
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
  function permittedProject() {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValue({
          data:
            table === "indicators"
              ? [{ id: "i", key: "water", label: "Måling", value: 0, unit: "m", updated_at: null }]
              : [],
          error: null,
        }),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({
          data: { id: "project-a", name: "Sag", description: null },
          error: null,
        }),
    }));
  }
  const reply = {
    short: "En registreret måling.",
    basis: ["Måling 0 m"],
    recommendation: "Gennemgå grundlaget",
    uncertainty: "Faglig vurdering mangler",
    nextAction: "Gennemgå",
    sourceIds: ["indicators:i"],
  };
  it("returns an explicit missing-configuration status without invoking the provider", async () => {
    permittedProject();
    vi.stubEnv("LOVABLE_API_KEY", "");
    expect((await call(input)).reason).toBe("missing_key");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it("sends the approved records and question, never the user's token or provider key", async () => {
    permittedProject();
    mocks.generateText.mockResolvedValue({ experimental_output: reply });
    const result = await call(input);
    expect(result.error).toBe(false);
    expect(result.reply).toEqual(reply);
    const sent = mocks.generateText.mock.calls[0][0].prompt;
    expect(sent).toContain('"value":0');
    expect(sent).not.toContain("offline-token");
    expect(sent).not.toContain("offline-provider-key");
    expect(sent).not.toContain("offline-public-key");
    expect(sent).not.toContain("accessToken");
  });
  it("does not show responses citing an inaccessible or invented record", async () => {
    permittedProject();
    mocks.generateText.mockResolvedValue({
      experimental_output: { ...reply, sourceIds: ["actions:another-project"] },
    });
    expect((await call(input)).reason).toBe("invalid_sources");
  });
  it("does not contact AI when a question contains a credential", async () => {
    permittedProject();
    expect((await call({ data: { ...input.data, question: "Token: offline-token" } })).reason).toBe(
      "credential_in_evidence",
    );
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
