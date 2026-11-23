import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  AI_GATEWAY_MAX_RESPONSE_BYTES,
  AiGatewayError,
  aiPublicFailure,
  requireBoundedAiText,
  withBoundedAiGateway,
} from "../ai-gateway.server";
import { AI_IMAGE_MAX_BYTES, isAllowedAiImageDataUrl } from "../ai-image-input";

const KEY = "synthetic-unit-test-key";
function completion(content = "Lokalt AI-forslag") {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-unit",
      object: "chat.completion",
      created: 1,
      model: "google/gemini-3-flash-preview",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
const generate = (limits: Parameters<Parameters<typeof withBoundedAiGateway>[1]>[0]) =>
  generateText({ ...limits, prompt: "Brugerens indsendte data", maxOutputTokens: 160 });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded fixed AI gateway using the installed SDK", () => {
  it("runs real generateText/openai-compatible/provider-utils against local mocked fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(completion());
    const { text } = await withBoundedAiGateway(KEY, generate, { fetchImpl });
    expect(text).toBe("Lokalt AI-forslag");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(new Headers(init?.headers).get("Lovable-API-Key")).toBe(KEY);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "google/gemini-3-flash-preview",
      max_tokens: 160,
    });
  });

  it("keeps structured output working through both installed SDK dependency paths", async () => {
    const schema = z.object({ title: z.string().max(80) });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(completion('{"title":"AI-udkast"}'));
    const result = await withBoundedAiGateway(
      KEY,
      (limits) =>
        generateText({
          ...limits,
          prompt: "Skriv et udkast",
          maxOutputTokens: 160,
          experimental_output: Output.object({ schema }),
        }),
      { fetchImpl },
    );
    expect(result.experimental_output).toEqual({ title: "AI-udkast" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["raw", "unicode-escaped"])(
    "rejects a valid completion echoing the credential (%s)",
    async (encoding) => {
      const good = completion(KEY);
      const original = await good.text();
      const echoed =
        encoding === "raw"
          ? original
          : original.replace(
              KEY,
              `\\u${KEY.charCodeAt(0).toString(16).padStart(4, "0")}${KEY.slice(1)}`,
            );
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(echoed, { headers: { "Content-Type": "application/json" } }),
        );
      let caught: unknown;
      try {
        await withBoundedAiGateway(KEY, generate, { fetchImpl });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AiGatewayError);
      expect(String(caught)).not.toContain(KEY);
      expect(caught).toMatchObject({ kind: "invalid_response" });
    },
  );

  it("rejects a nested Unicode-escaped credential in actual SDK structured output", async () => {
    const inner = '{"title":"\\u0073ynthetic-unit-test-key"}';
    const response = completion(inner);
    const raw = await response.clone().text();
    expect(raw.includes(KEY)).toBe(false);
    expect(JSON.stringify(JSON.parse(raw)).includes(KEY)).toBe(false);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      withBoundedAiGateway(
        KEY,
        async (limits) => {
          const result = await generateText({
            ...limits,
            prompt: "Skriv et udkast",
            maxOutputTokens: 160,
            experimental_output: Output.object({ schema: z.object({ title: z.string().max(80) }) }),
          });
          return result.experimental_output;
        },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ kind: "invalid_response" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["plain string", "final parsed object"])(
    "guards credentials derived by the callback (%s)",
    async (kind) => {
      const callback = vi
        .fn()
        .mockResolvedValue(kind === "plain string" ? KEY : { nested: { title: KEY } });
      await expect(withBoundedAiGateway(KEY, callback)).rejects.toMatchObject({
        kind: "invalid_response",
      });
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["json", "markdown"])(
    "rejects a nested echo in unknown stripped completion fields (%s)",
    async (style) => {
      const content = '{"title":"Udkast","ignored":"\\u0073ynthetic-unit-test-key"}';
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          completion(style === "json" ? content : `\`\`\`json\n${content}\n\`\`\``),
        );
      await expect(withBoundedAiGateway(KEY, generate, { fetchImpl })).rejects.toMatchObject({
        kind: "invalid_response",
      });
    },
  );

  it.each([402, 429, 500])(
    "does not retry HTTP %i and exposes only a safe classification",
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private upstream body, synthetic credential", { status }));
      let error: unknown;
      try {
        await withBoundedAiGateway(KEY, generate, { fetchImpl });
      } catch (caught) {
        error = caught;
      }
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(AiGatewayError);
      expect(aiPublicFailure(error)).toBe(
        status === 402 ? "credits" : status === 429 ? "rate_limit" : "unknown",
      );
      expect(String(error)).not.toMatch(/synthetic credential|private upstream|https:\/\//);
    },
  );

  it.each([200, 500])(
    "rejects oversized declared HTTP %i bodies before reading",
    async (status) => {
      const cancel = vi.fn();
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(AI_GATEWAY_MAX_RESPONSE_BYTES + 1),
          },
        }),
      );
      await expect(withBoundedAiGateway(KEY, generate, { fetchImpl })).rejects.toMatchObject({
        kind: "response_limit",
      });
      expect(cancel).toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it.each([200, 500])(
    "bounds actual streamed HTTP %i bytes even with a false small header",
    async (status) => {
      const cancel = vi.fn();
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(AI_GATEWAY_MAX_RESPONSE_BYTES));
              controller.enqueue(new Uint8Array(1));
            },
            cancel,
          }),
          { status, headers: { "Content-Type": "application/json", "Content-Length": "1" } },
        ),
      );
      await expect(withBoundedAiGateway(KEY, generate, { fetchImpl })).rejects.toMatchObject({
        kind: "response_limit",
      });
      expect(cancel).toHaveBeenCalled();
    },
  );

  it.each(["headers", "body", "generation"])(
    "hard deadline stops stalled %s, including abort-ignoring work",
    async (phase) => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() =>
        phase === "headers"
          ? new Promise<Response>(() => undefined)
          : Promise.resolve(
              new Response(new ReadableStream({ cancel }), {
                headers: { "Content-Type": "application/json" },
              }),
            ),
      );
      let signal: AbortSignal | undefined;
      const operation = withBoundedAiGateway(
        KEY,
        phase === "generation"
          ? async (limits) => {
              signal = limits.abortSignal;
              return new Promise<never>(() => undefined);
            }
          : generate,
        { fetchImpl, timeoutMs: 10 },
      );
      const assertion = expect(operation).rejects.toMatchObject({ kind: "timeout" });
      await vi.advanceTimersByTimeAsync(11);
      await assertion;
      if (phase === "body") expect(cancel).toHaveBeenCalled();
      if (phase === "headers") expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
      if (phase === "generation") expect(signal?.aborted).toBe(true);
    },
  );

  it("cancels a response arriving after the expired header deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let resolve!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const operation = withBoundedAiGateway(KEY, generate, { fetchImpl, timeoutMs: 10 });
    const assertion = expect(operation).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    resolve(new Response(new ReadableStream({ cancel })));
    await Promise.resolve();
    expect(cancel).toHaveBeenCalled();
  });

  it.each([302, 307])("refuses redirects (HTTP %i) without a second request", async (status) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("redirect", { status, headers: { Location: "https://other.invalid" } }),
      );
    await expect(withBoundedAiGateway(KEY, generate, { fetchImpl })).rejects.toMatchObject({
      kind: "invalid_response",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never returns a transport error's private message or cause", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private-key and user-data at https://internal.invalid"));
    await expect(withBoundedAiGateway(KEY, generate, { fetchImpl })).rejects.toThrow(
      "AI-kaldet kunne ikke gennemføres sikkert.",
    );
    expect(aiPublicFailure(new Error("429 private upstream text"))).toBe("unknown");
  });

  it.each(["NaN", "-1", "10.5"])("rejects invalid content length %s", async (length) => {
    const response = completion();
    response.headers.set("Content-Length", length);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(withBoundedAiGateway(KEY, generate, { fetchImpl })).rejects.toMatchObject({
      kind: "response_limit",
    });
  });

  it("rejects non-JSON content and SDK parse failures without raw diagnostics", async () => {
    for (const response of [
      new Response("private html", { headers: { "Content-Type": "text/html" } }),
      new Response("not json with private data", {
        headers: { "Content-Type": "application/json" },
      }),
    ]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(withBoundedAiGateway(KEY, generate, { fetchImpl })).rejects.toThrow(
        "AI-kaldet kunne ikke gennemføres sikkert.",
      );
    }
  });

  it("rejects oversized application output and increased/invalid deadlines", async () => {
    expect(() => requireBoundedAiText("x".repeat(601), 600)).toThrow(AiGatewayError);
    expect(requireBoundedAiText("  kort svar  ", 600)).toBe("kort svar");
    for (const timeoutMs of [0, -1, 15_001, 1.5]) {
      const callback = vi.fn();
      await expect(withBoundedAiGateway(KEY, callback, { timeoutMs })).rejects.toMatchObject({
        kind: "invalid_response",
      });
      expect(callback).not.toHaveBeenCalled();
    }
  });
});

describe("caller-provided AI image contract", () => {
  it.each([
    ["jpeg", [255, 216, 255, 0]],
    ["png", [137, 80, 78, 71, 13, 10, 26, 10]],
    ["webp", [...Buffer.from("RIFF\u0004\u0000\u0000\u0000WEBP")]],
  ])(
    "accepts bounded inline %s header bytes without a pixel/project-verification claim",
    (type, bytes) => {
      expect(
        isAllowedAiImageDataUrl(
          `data:image/${type};base64,${Buffer.from(bytes as number[]).toString("base64")}`,
        ),
      ).toBe(true);
    },
  );

  it.each([
    "https://example.invalid/image.jpg",
    "file:///private/image.jpg",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:image/jpeg;base64,AAAA",
    "data:image/jpeg;base64,/9j/AA",
    "data:image/jpeg;base64,/9j/AB==",
    "data:image/jpeg;base64,/9j/AA==\n",
  ])("refuses remote/unsafe/noncanonical input %s", (value) => {
    expect(isAllowedAiImageDataUrl(value)).toBe(false);
  });

  it("rejects bytes above the decoded cap before a provider/download can run", () => {
    const bytes = Buffer.alloc(AI_IMAGE_MAX_BYTES + 1);
    bytes.set([255, 216, 255]);
    expect(isAllowedAiImageDataUrl(`data:image/jpeg;base64,${bytes.toString("base64")}`)).toBe(
      false,
    );
  });
});
