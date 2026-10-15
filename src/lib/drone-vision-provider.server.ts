import { createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DRONE_IMAGE_INSPECTION_SYSTEM_PROMPT,
  DroneImageVisualDraftSchema,
  buildDroneImageInspectionUserPrompt,
  type DroneImageSourceContext,
} from "@/services/monitoring/drone-image-inspection";

export const DRONE_VISION_PROVIDER = "cloudflare-workers-ai";
export const DRONE_VISION_MODEL = "@cf/qwen/qwen3.8-27b";
export const DRONE_VISION_MAX_ORIGINAL_BYTES = 20_000_000;
export const DRONE_VISION_TRANSFORM = "cloudflare-images-jpeg-1536-q85-strip-app/v1";
// One attempt stays below the three-minute claim lease. Upstream inference may
// queue; the same deadline also covers Images, reauthorization and body reads.
export const DRONE_VISION_TIMEOUT_MS = 100_000;
const MAX_DERIVATIVE_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;

/** Narrow server capability matching the generated runtime types in types/.
 * Keeping Worker globals out of the browser compilation preserves DOM types. */
export interface DroneVisionBindings {
  AI: {
    run(
      model: string,
      inputs: Record<string, unknown>,
      options: { signal: AbortSignal; returnRawResponse: true },
    ): Promise<unknown>;
  };
  IMAGES: {
    input(stream: ReadableStream<Uint8Array>): {
      transform(options: { width: number; height: number; fit: "scale-down" }): {
        output(options: {
          format: "image/jpeg";
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

export class DroneVisionError extends Error {
  constructor(
    readonly code:
      | "unavailable"
      | "image_size"
      | "invalid_image"
      | "timeout"
      | "provider"
      | "invalid_output",
  ) {
    const messages = {
      unavailable: "Billed-AI er endnu ikke tilgængelig i denne drift.",
      image_size:
        "Billed-AI understøtter her JPEG-originaler op til 20 MB. Originalen er bevaret; større billeder afventer behandling.",
      invalid_image:
        "Originalen kunne ikke afkodes til et læsbart billede. Den er bevaret til manuel gennemgang.",
      timeout:
        "Billedanalysen tog for lang tid. Et gemt resultat kan hentes igen uden en ny analyse.",
      provider: "Billed-AI kunne ikke fuldføre analysen. Prøv igen senere.",
      invalid_output:
        "Billed-AI gav ikke et gyldigt forslag. Ingen observationer er godkendt eller indsat i rapporten.",
    };
    super(messages[code]);
    this.name = "DroneVisionError";
  }
}

/** Strip every APP/COM segment, including EXIF, XMP, ICC and maker identifiers.
 * Dimensions come from a decoded/re-encoded image, never caller metadata. */
export function sanitizeVisionJpeg(bytes: Uint8Array) {
  if (
    bytes.length < 4 ||
    bytes.length > MAX_DERIVATIVE_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  )
    throw new DroneVisionError("invalid_image");
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2,
    widthPx = 0,
    heightPx = 0,
    scans = 0,
    markers = 0,
    entropy = false;
  // Progressive JPEGs can have metadata between scans. Walk through EOI while
  // preserving stuffed bytes and restart markers inside the image scan data.
  while (offset < bytes.length) {
    if (entropy) {
      const start = offset;
      let ended = false;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) continue;
        const markerStart = offset - 1;
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        parts.push(bytes.subarray(start, markerStart));
        offset = markerStart;
        entropy = false;
        ended = true;
        break;
      }
      if (!ended) throw new DroneVisionError("invalid_image");
      continue;
    }
    if (++markers > 4096) throw new DroneVisionError("invalid_image");
    const start = offset;
    if (bytes[offset++] !== 0xff) throw new DroneVisionError("invalid_image");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (!marker || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7))
      throw new DroneVisionError("invalid_image");
    if (marker === 0xd9) {
      if (!scans || !widthPx || !heightPx || offset !== bytes.length)
        throw new DroneVisionError("invalid_image");
      parts.push(bytes.subarray(start, offset));
      const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
      let position = 0;
      for (const part of parts) {
        result.set(part, position);
        position += part.length;
      }
      return { bytes: result, widthPx, heightPx };
    }
    if (offset + 1 >= bytes.length) throw new DroneVisionError("invalid_image");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new DroneVisionError("invalid_image");
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || widthPx || heightPx) throw new DroneVisionError("invalid_image");
      heightPx = (bytes[offset + 3] << 8) | bytes[offset + 4];
      widthPx = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (!widthPx || !heightPx || Math.max(widthPx, heightPx) > 1536)
        throw new DroneVisionError("invalid_image");
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      throw new DroneVisionError("invalid_image");
    }
    if (marker === 0xda) {
      if (!widthPx || !heightPx || ++scans > 256) throw new DroneVisionError("invalid_image");
      entropy = true;
    }
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe)
      parts.push(bytes.subarray(start, offset + length));
    offset += length;
  }
  throw new DroneVisionError("invalid_image");
}

async function readBounded(
  response: Response,
  limit: number,
  code: "invalid_image" | "invalid_output",
  signal: AbortSignal,
) {
  if (signal.aborted) {
    void response.body?.cancel().catch(() => undefined);
    throw new DroneVisionError("timeout");
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new DroneVisionError(code);
  }
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body.cancel().catch(() => undefined);
    throw new DroneVisionError(code);
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (signal.aborted) throw new DroneVisionError("timeout");
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw new DroneVisionError(code);
      chunks.push(next.value);
    }
  } catch {
    void reader.cancel().catch(() => undefined);
    throw new DroneVisionError(signal.aborted ? "timeout" : code);
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export const inspectDroneImageBytes = createServerOnlyFn(
  async (
    bytes: Uint8Array,
    options: {
      bindings?: DroneVisionBindings;
      timeoutMs?: number;
      beforeModelTransfer?: () => Promise<void>;
      sourceContext?: DroneImageSourceContext | null;
    } = {},
  ) => {
    if (!bytes.length || bytes.length > DRONE_VISION_MAX_ORIGINAL_BYTES)
      throw new DroneVisionError("image_size");
    const { Buffer } = await import("node:buffer");
    let bindings: DroneVisionBindings;
    try {
      bindings = options.bindings ?? (await import("cloudflare:workers")).env;
    } catch {
      throw new DroneVisionError("unavailable");
    }
    if (!bindings.AI?.run || !bindings.IMAGES?.input) throw new DroneVisionError("unavailable");
    type Phase =
      | "image_transform"
      | "image_body"
      | "reauthorization"
      | "ai_inference"
      | "ai_body"
      | "output_validation";
    const startedAt = Date.now();
    let phase: Phase = "image_transform";
    let phaseStartedAt = startedAt;
    let outcome: "completed" | DroneVisionError["code"] = "provider";
    const phaseMs: Partial<Record<Phase, number>> = {};
    const enter = (next: Phase) => {
      const now = Date.now();
      phaseMs[phase] = Math.max(0, now - phaseStartedAt);
      phase = next;
      phaseStartedAt = now;
    };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new DroneVisionError("timeout"));
      }, options.timeoutMs ?? DRONE_VISION_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        timeout,
        (async () => {
          let transformed: Response;
          try {
            const image = await bindings.IMAGES.input(new Blob([bytes.slice().buffer]).stream())
              .transform({ width: 1536, height: 1536, fit: "scale-down" })
              .output({ format: "image/jpeg", quality: 85 });
            transformed = image.response();
          } catch {
            throw new DroneVisionError("invalid_image");
          }
          enter("image_body");
          const derivative = sanitizeVisionJpeg(
            await readBounded(
              transformed,
              MAX_DERIVATIVE_BYTES,
              "invalid_image",
              controller.signal,
            ),
          );
          const digest = await crypto.subtle.digest("SHA-256", derivative.bytes.slice().buffer);
          const sha256 = [...new Uint8Array(digest)]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
          if (controller.signal.aborted) throw new DroneVisionError("timeout");
          enter("reauthorization");
          await options.beforeModelTransfer?.();
          if (controller.signal.aborted) throw new DroneVisionError("timeout");
          enter("ai_inference");
          let result: unknown;
          try {
            result = await bindings.AI.run(
              DRONE_VISION_MODEL,
              {
                messages: [
                  { role: "system", content: DRONE_IMAGE_INSPECTION_SYSTEM_PROMPT },
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: buildDroneImageInspectionUserPrompt(options.sourceContext),
                      },
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:image/jpeg;base64,${Buffer.from(derivative.bytes).toString("base64")}`,
                        },
                      },
                    ],
                  },
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "drone_visual_draft",
                    strict: true,
                    schema: z.toJSONSchema(DroneImageVisualDraftSchema, { unrepresentable: "any" }),
                  },
                },
                max_completion_tokens: 2400,
                reasoning_effort: "low",
                temperature: 0.1,
                stream: false,
                store: false,
                tool_choice: "none",
              },
              { signal: controller.signal, returnRawResponse: true },
            );
          } catch {
            throw new DroneVisionError(controller.signal.aborted ? "timeout" : "provider");
          }
          if (!(result instanceof Response)) throw new DroneVisionError("invalid_output");
          enter("ai_body");
          const text = new TextDecoder("utf-8", { fatal: true }).decode(
            await readBounded(result, MAX_RESPONSE_BYTES, "invalid_output", controller.signal),
          );
          enter("output_validation");
          let visual: unknown;
          try {
            const envelope = z
              .object({
                choices: z
                  .array(
                    z.object({
                      finish_reason: z.literal("stop"),
                      message: z.object({ content: z.string().min(1).max(16_000) }),
                    }),
                  )
                  .min(1)
                  .max(1),
              })
              .parse(JSON.parse(text));
            visual = DroneImageVisualDraftSchema.parse(
              JSON.parse(envelope.choices[0].message.content),
            );
          } catch {
            throw new DroneVisionError("invalid_output");
          }
          outcome = "completed";
          return {
            visual,
            derivative: {
              sha256,
              mimeType: "image/jpeg" as const,
              widthPx: derivative.widthPx,
              heightPx: derivative.heightPx,
              transformVersion: DRONE_VISION_TRANSFORM,
            },
            provider: DRONE_VISION_PROVIDER,
            model: DRONE_VISION_MODEL,
          };
        })(),
      ]);
    } catch (error) {
      if (error instanceof DroneVisionError) {
        outcome = error.code;
        throw error;
      }
      throw new DroneVisionError("provider");
    } finally {
      clearTimeout(timer);
      controller.abort();
      phaseMs[phase] = Math.max(0, Date.now() - phaseStartedAt);
      // Deliberately exclude image bytes, hashes, IDs, URLs and error payloads.
      // This single event identifies which boundary exhausted the deadline.
      console.info("drone_vision_timing", {
        outcome,
        phase,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        phaseMs: { ...phaseMs },
      });
    }
  },
);
