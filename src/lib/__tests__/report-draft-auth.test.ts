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
import { generateEvidenceReportDraft } from "../report-draft.functions";
import { newReportContent } from "../report-document";
const call = generateEvidenceReportDraft as unknown as (input: {
  data: Record<string, string>;
}) => Promise<{ error: string | null; draft: unknown }>;
const input = {
  data: {
    accessToken: "test-token",
    organizationId: "org-a",
    projectId: "project-a",
    reportId: "report-a",
    revisionId: "revision-a",
  },
};
describe("authorized evidence AI boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("LOVABLE_API_KEY", "test-only");
    vi.stubEnv("SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-only");
  });
  it("does not invoke AI for an invalid user token", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect((await call(input)).error).toBe("unauthorized");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it("rejects report outside the current organization/project", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.from.mockReturnValue(q);
    expect((await call(input)).error).toBe("unauthorized");
    expect(q.eq).toHaveBeenCalledWith("project_id", "project-a");
    expect(q.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it("rejects AI output citing an unknown source and sends only reviewed sections", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    const c = newReportContent("P", "O", "Scope", "Kunde");
    c.sources = [
      {
        id: "media:source-a",
        title: "Original",
        kind: "photo",
        capturedAt: null,
        checksum: "a".repeat(64),
        position: null,
        method: "RGB",
        version: "1",
      },
    ];
    c.sections[0] = {
      ...c.sections[0],
      text: "Reviewed observation",
      reviewed: true,
      sourceIds: ["media:source-a"],
      basis: "observed",
    };
    c.sections[1].text = "UNREVIEWED TEXT";
    const doc = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "report-a" }, error: null }),
    };
    const rev = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { content: c, version: 1 }, error: null }),
    };
    mocks.from.mockImplementation((table: string) => (table === "report_documents" ? doc : rev));
    mocks.generateText.mockResolvedValue({
      experimental_output: {
        claims: [{ text: "Claim", sourceIds: ["another-project"], basis: "observed" }],
        limitations: [],
      },
    });
    expect((await call(input)).error).toBe("invalid_sources");
    const payload = mocks.generateText.mock.calls[0][0].prompt;
    expect(payload).toContain("Reviewed observation");
    expect(payload).not.toContain("UNREVIEWED TEXT");
    expect(payload).not.toContain("test-token");
  });
});
