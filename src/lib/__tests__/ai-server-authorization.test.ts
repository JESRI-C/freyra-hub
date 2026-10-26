import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeMiddleware } from "@tanstack/start-client-core";

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
  generateText: vi.fn(),
  gateway: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({ getRequest: mocks.getRequest }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("../ai-gateway.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai-gateway.server")>()),
  withBoundedAiGateway: mocks.gateway,
}));

// Unit builds do not run TanStack's AST handler extraction. Substitute only that
// extraction boundary; execute the declared real middleware/validator/server chain.
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    createServerFn: () => {
      let middlewares: Parameters<typeof executeMiddleware>[0] = [];
      let validator: (data: unknown) => unknown = (data) => data;
      const builder = {
        middleware(items: typeof middlewares) {
          middlewares = [...middlewares, ...items];
          return builder;
        },
        inputValidator(validate: typeof validator) {
          validator = validate;
          return builder;
        },
        handler(handler: (input: { data: unknown }) => Promise<unknown>) {
          return async ({ data }: { data: unknown }) => {
            const terminal = actual
              .createMiddleware({ type: "function" })
              .inputValidator(validator)
              .server(async ({ data: validated, next }) => ({
                ...(await next()),
                result: await handler({ data: validated }),
              }));
            const executed = await executeMiddleware([...middlewares, terminal], "server", {
              method: "POST",
              data,
              serverFnMeta: { id: "ai-unit-test" },
            });
            if (executed.error) throw executed.error;
            return executed.result;
          };
        },
      };
      return builder;
    },
  };
});

import { generateModuleInsight } from "../ai.functions";
import { generateReportDraft } from "../report-draft.functions";
import { identifySpeciesFromImage } from "../species-id.functions";
import { AiGatewayError } from "../ai-gateway.server";
import { AI_IMAGE_MAX_BYTES } from "../ai-image-input";

const USER = "30000000-0000-4000-8000-000000000001";
const IMAGE = "data:image/jpeg;base64,/9j/AAAAAAAA";
const DATA = {
  insight: { module: "natur", context: "Brugerens indsendte areal=2" },
  draft: { reportType: "Natur", projectName: "Brugerens projektnavn", context: "Indsendt data" },
  decision: {
    question: "Hvad mangler?",
    projectName: "Indsendt projekt",
    indicators: [],
    actions: [],
    sensors: [],
  },
  species: { imageDataUrl: IMAGE, hint: "Brugerens feltbillede" },
};
const CALLS = [
  { name: "insight", fn: generateModuleInsight, data: DATA.insight },
  { name: "species", fn: identifySpeciesFromImage, data: DATA.species },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://unit-test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_unit");
  vi.stubEnv("LOVABLE_API_KEY", "synthetic-unit-key");
  mocks.createClient.mockReturnValue({ auth: { getClaims: mocks.getClaims } });
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: USER, role: "authenticated" } },
    error: null,
  });
  mocks.getRequest.mockReturnValue(
    new Request("https://unit.invalid/serverFn", {
      headers: { Authorization: "Bearer unit-token" },
    }),
  );
  mocks.gateway.mockImplementation(async (_key, callback) =>
    callback({ model: "unit-only", abortSignal: new AbortController().signal, maxRetries: 0 }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ordinary AI helpers execute server auth; scoped AI has dedicated boundary suites", () => {
  it.each(CALLS)(
    "rejects anonymous $name before missing-key handling or any provider",
    async ({ fn, data }) => {
      vi.stubEnv("LOVABLE_API_KEY", "");
      mocks.getRequest.mockReturnValue(new Request("https://unit.invalid/serverFn"));
      await expect(fn({ data } as never)).rejects.toThrow(
        "Unauthorized: No authorization header provided",
      );
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.gateway).not.toHaveBeenCalled();
      expect(mocks.generateText).not.toHaveBeenCalled();
    },
  );

  it.each(CALLS)(
    "rejects invalid credentials for $name before any provider",
    async ({ fn, data }) => {
      mocks.getClaims.mockResolvedValue({ data: null, error: new Error("invalid token") });
      await expect(fn({ data } as never)).rejects.toThrow("Unauthorized: Invalid token");
      expect(mocks.getClaims).toHaveBeenCalledWith("unit-token");
      expect(mocks.gateway).not.toHaveBeenCalled();
      expect(mocks.generateText).not.toHaveBeenCalled();
    },
  );

  it.each(CALLS)("keeps authenticated missing-key $name disabled", async ({ fn, data }) => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    expect(await fn({ data } as never)).toMatchObject({ error: expect.anything() });
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it("passes caller context as unverified input and preserves bounded SDK settings", async () => {
    mocks.generateText.mockResolvedValue({ text: "Et kort forslag" });
    expect(await generateModuleInsight({ data: DATA.insight })).toEqual({
      headline: "AI-indsigt",
      body: "Et kort forslag",
      error: false,
    });
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        abortSignal: expect.any(AbortSignal),
        maxOutputTokens: 160,
        prompt: expect.stringContaining(DATA.insight.context),
        system: expect.stringContaining("ikke er verificeret"),
      }),
    );
    // No project lookup, role, approved result or DB provenance is part of this route contract.
    expect(mocks.createClient.mock.results[0].value).toEqual({
      auth: { getClaims: mocks.getClaims },
    });
  });

  it("keeps the legacy unscoped report endpoint closed even with valid credentials", async () => {
    expect(await generateReportDraft({ data: DATA.draft })).toEqual({
      error: "authorization_required",
      draft: null,
    });
    expect(mocks.gateway).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("passes valid inline caller image bytes without remote download or project-binding claims", async () => {
    mocks.generateText.mockResolvedValue({
      text: '{"species":[{"scientificName":"Lutra lutra","danishName":"Odder","group":"Pattedyr","confidence":0.7}]}',
    });
    const result = await identifySpeciesFromImage({ data: DATA.species });
    expect(result).toMatchObject({
      error: false,
      species: [{ scientificName: "Lutra lutra", confidence: 0.7 }],
      rawText: "",
    });
    expect(mocks.generateText.mock.calls[0][0].messages[0].content[1]).toEqual({
      type: "image",
      image: IMAGE,
    });
    expect(mocks.generateText.mock.calls[0][0]).toMatchObject({
      maxRetries: 0,
      maxOutputTokens: 600,
    });
  });

  it.each(["scientificName", "notes"])(
    "rejects a credential decoded in the final species %s",
    async (field) => {
      const real =
        await vi.importActual<typeof import("../ai-gateway.server")>("../ai-gateway.server");
      mocks.gateway.mockImplementation(real.withBoundedAiGateway);
      const record = {
        scientificName: "Lutra lutra",
        danishName: "Odder",
        group: "Pattedyr",
        confidence: 0.7,
        [field]: "synthetic-unit-key",
      };
      const text = JSON.stringify({ species: [record] }).replace(
        "synthetic-unit-key",
        "\\u0073ynthetic-unit-key",
      );
      expect(text).not.toContain("synthetic-unit-key");
      mocks.generateText.mockResolvedValue({ text });
      const result = await identifySpeciesFromImage({ data: DATA.species });
      expect(result).toMatchObject({ error: true, species: [], rawText: "" });
      expect(JSON.stringify(result)).not.toContain("synthetic-unit-key");
    },
  );

  it("does not forward unused raw model text or stripped species fields", async () => {
    const real =
      await vi.importActual<typeof import("../ai-gateway.server")>("../ai-gateway.server");
    mocks.gateway.mockImplementation(real.withBoundedAiGateway);
    mocks.generateText.mockResolvedValue({
      text: '{"species":[{"scientificName":"Lutra lutra","danishName":"Odder","group":"Pattedyr","confidence":0.7,"ignored":"\\u0073ynthetic-unit-key"}]}',
    });
    const result = await identifySpeciesFromImage({ data: DATA.species });
    expect(result).toMatchObject({ error: false, rawText: "" });
    expect(JSON.stringify(result)).not.toMatch(/synthetic-unit-key|ignored|\\\\u0073/);
  });

  it.each([
    "https://other.invalid/private.jpg",
    "https://unit.supabase.co/storage/v1/object/sign/private.jpg?token=synthetic",
    "file:///private",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:image/jpeg;base64,AAAA",
  ])("rejects unsupported image input before any provider: %s", async (imageDataUrl) => {
    await expect(identifySpeciesFromImage({ data: { imageDataUrl } })).rejects.toThrow();
    expect(mocks.gateway).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("rejects a large encoded image before any provider", async () => {
    const bytes = Buffer.alloc(AI_IMAGE_MAX_BYTES + 1);
    bytes.set([255, 216, 255]);
    await expect(
      identifySpeciesFromImage({
        data: { imageDataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}` },
      }),
    ).rejects.toThrow();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it.each(CALLS)("does not disclose an upstream/SDK failure from $name", async ({ fn, data }) => {
    mocks.gateway.mockRejectedValueOnce(
      new Error("private-key caller-data upstream-http-429 https://internal.invalid"),
    );
    const result = await fn({ data } as never);
    expect(JSON.stringify(result)).not.toMatch(
      /private-key|caller-data|upstream-http|internal\.invalid/,
    );
    expect(result).toMatchObject({ error: expect.anything() });
  });

  it("keeps HTTP classifications while malformed/oversized species outputs fail closed", async () => {
    mocks.gateway.mockRejectedValueOnce(new AiGatewayError("rate_limit"));
    expect(await generateModuleInsight({ data: DATA.insight })).toMatchObject({
      error: true,
      headline: "Kortvarig grænse nået",
    });
    for (const text of [
      "not JSON",
      '{"species":[{"scientificName":"Lutra lutra","danishName":"Odder","group":"Pattedyr","confidence":9}]}',
      "x".repeat(4097),
    ]) {
      mocks.generateText.mockResolvedValue({ text });
      expect(await identifySpeciesFromImage({ data: DATA.species })).toMatchObject({
        error: true,
        species: [],
        rawText: "",
      });
    }
  });
});
