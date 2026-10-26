import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export const AI_GATEWAY_TIMEOUT_MS = 15_000;
export const AI_GATEWAY_MAX_RESPONSE_BYTES = 128 * 1024;
export const AI_GATEWAY_MAX_OUTPUT_CHARACTERS = 16_000;
const CHAT_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type AiPublicFailure = "rate_limit" | "credits" | "unknown";

export class AiGatewayError extends Error {
  constructor(
    readonly kind:
      | "timeout"
      | "response_limit"
      | "invalid_response"
      | "upstream"
      | "rate_limit"
      | "credits"
      | "output_limit",
  ) {
    super("AI-kaldet kunne ikke gennemføres sikkert.");
    this.name = "AiGatewayError";
  }
}

/** Classify only our sanitized transport errors, never upstream error text. */
export function aiPublicFailure(error: unknown): AiPublicFailure {
  return error instanceof AiGatewayError &&
    (error.kind === "rate_limit" || error.kind === "credits")
    ? error.kind
    : "unknown";
}

export function requireBoundedAiText(
  text: unknown,
  limit = AI_GATEWAY_MAX_OUTPUT_CHARACTERS,
): string {
  if (typeof text !== "string" || text.length > limit) throw new AiGatewayError("output_limit");
  return text.trim();
}

interface AiGenerationContext {
  model: LanguageModel;
  abortSignal: AbortSignal;
  maxRetries: 0;
}

interface AiGatewayOptions {
  fetchImpl?: typeof fetch;
  /** Tests may shorten, never increase the production deadline. */
  timeoutMs?: number;
}

function rejectCredentialEcho(value: unknown, key: string): void {
  if ((typeof value === "string" && value.includes(key)) || JSON.stringify(value)?.includes(key))
    throw new AiGatewayError("invalid_response");
}

/** Inspect the known completion content before a schema can strip unknown fields. */
function rejectInnerCompletionEcho(value: unknown, key: string): void {
  if (!value || typeof value !== "object" || !("choices" in value) || !Array.isArray(value.choices))
    return;
  for (const choice of value.choices) {
    if (!choice || typeof choice !== "object" || !("message" in choice)) continue;
    const message: unknown = choice.message;
    if (
      !message ||
      typeof message !== "object" ||
      !("content" in message) ||
      typeof message.content !== "string"
    )
      continue;
    const text = message.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) continue;
    let inner: unknown;
    try {
      inner = JSON.parse(text.slice(start, end + 1));
    } catch {
      continue;
    }
    rejectCredentialEcho(inner, key);
  }
}

/** One deadline covers headers, success/error bodies, SDK parsing and generation. */
export async function withBoundedAiGateway<T>(
  key: string,
  generate: (context: AiGenerationContext) => Promise<T>,
  options: AiGatewayOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? AI_GATEWAY_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > AI_GATEWAY_TIMEOUT_MS ||
    !key.trim()
  )
    throw new AiGatewayError("invalid_response");
  const controller = new AbortController();
  let transportFailure: AiGatewayError | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiGatewayError("timeout"));
    }, timeoutMs);
  });

  const boundedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (url.href !== CHAT_ENDPOINT || method !== "POST" || controller.signal.aborted)
      throw new AiGatewayError("invalid_response");
    const incomingSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = incomingSignal
      ? AbortSignal.any([controller.signal, incomingSignal])
      : controller.signal;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;
    let complete = false;
    try {
      const fetching = (options.fetchImpl ?? fetch)(input, { ...init, signal, redirect: "manual" });
      // A transport ignoring abort may resolve after the deadline. Never retain its body.
      void fetching.then(
        (late) => {
          if (signal.aborted) void late.body?.cancel().catch(() => undefined);
        },
        () => undefined,
      );
      response = await Promise.race([fetching, deadline]);
      if (response.redirected || (response.status >= 300 && response.status < 400))
        throw new AiGatewayError("invalid_response");
      const declared = response.headers.get("content-length");
      if (
        declared !== null &&
        (!/^\d+$/.test(declared) || Number(declared) > AI_GATEWAY_MAX_RESPONSE_BYTES)
      )
        throw new AiGatewayError("response_limit");
      if (!response.body) throw new AiGatewayError("invalid_response");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await Promise.race([reader.read(), deadline]);
        if (signal.aborted) throw new AiGatewayError("timeout");
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > AI_GATEWAY_MAX_RESPONSE_BYTES) throw new AiGatewayError("response_limit");
        chunks.push(chunk.value);
      }
      complete = true;
      if (!response.ok)
        throw new AiGatewayError(
          response.status === 429 ? "rate_limit" : response.status === 402 ? "credits" : "upstream",
        );
      if (
        !/^(application\/json|[^;]+\+json)(?:;|$)/i.test(response.headers.get("content-type") ?? "")
      )
        throw new AiGatewayError("invalid_response");
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
      const decoded: unknown = JSON.parse(text);
      // Even a syntactically valid completion must not reflect request credentials.
      // Parsing catches unicode-escaped JSON strings that bypass a raw text check.
      rejectCredentialEcho(text, key);
      rejectCredentialEcho(decoded, key);
      rejectInnerCompletionEcho(decoded, key);
      // Retain only content type. Upstream cookies, URLs and response headers do not escape.
      return new Response(body, {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      transportFailure =
        error instanceof AiGatewayError
          ? error
          : new AiGatewayError(signal.aborted ? "timeout" : "upstream");
      throw transportFailure;
    } finally {
      if (!complete) {
        if (reader) void reader.cancel().catch(() => undefined);
        else void response?.body?.cancel().catch(() => undefined);
      }
      reader?.releaseLock();
    }
  };

  try {
    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: boundedFetch,
    });
    const result = await Promise.race([
      generate({
        model: gateway("google/gemini-3-flash-preview"),
        abortSignal: controller.signal,
        maxRetries: 0,
      }),
      deadline,
    ]);
    // Schemas/parsers may decode content again. Check the final derived return value,
    // rather than assuming the outer HTTP JSON guard covers structured output.
    rejectCredentialEcho(result, key);
    return result;
  } catch (error) {
    // The SDK wraps fetch errors. Preserve only our own out-of-band safe category.
    if (transportFailure) throw transportFailure;
    if (error instanceof AiGatewayError) throw error;
    // SDK errors can contain credentials, caller data and raw upstream response bodies.
    throw new AiGatewayError(controller.signal.aborted ? "timeout" : "upstream");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
