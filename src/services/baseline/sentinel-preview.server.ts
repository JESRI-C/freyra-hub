import { z } from "zod";
import {
  fetchSentinelSceneSource,
  type SentinelSceneInput,
  type SentinelSceneOptions,
} from "./sentinel-scene-source";
import { isSafeSentinelThumbnailUrl, selectSentinelPreview } from "./sentinel-preview";
import type { PublicBaselineSource } from "./public-baseline-types";
import { baselineSha256 } from "./public-baseline-service";
import { bytesSha256, PublicReadError, readPublicBytes } from "./bounded-public-read.server";

const Catalog = z.object({
  schema: z.literal("gofreyra.sentinel-scene-catalog/v1"),
  scenes: z.array(
    z.object({
      id: z.string(),
      datetime: z.string(),
      globalCloudCoverPct: z.number().min(0).max(100).nullable(),
      thumbnail: z
        .object({
          href: z.string().refine(isSafeSentinelThumbnailUrl),
          mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        })
        .nullable()
        .optional(),
    }),
  ),
});

/** CDSE thumbnails currently redirect once from Datahub to its Zipper download host. */
function thumbnailFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (request, init) => {
    const response = await fetchImpl(request, init);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const from = new URL(String(request));
    const location = response.headers.get("location");
    void response.body?.cancel().catch(() => undefined);
    if (!location || !isSafeSentinelThumbnailUrl(from.href))
      throw new PublicReadError("UNSAFE_REDIRECT");
    const target = new URL(location, from);
    if (
      target.protocol !== "https:" ||
      target.hostname !== "zipper.creodias.eu" ||
      target.port ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      target.pathname !== from.pathname
    )
      throw new PublicReadError("UNSAFE_REDIRECT");
    // Same public asset only; no arbitrary redirect, credentials, or second redirect is followed.
    return fetchImpl(target, { ...init, redirect: "manual" });
  };
}

/** A new snapshot keeps its actual image bytes; reopening does not depend on CDSE. */
export async function freezeSentinelPreview(
  source: PublicBaselineSource,
  options: { fetchImpl?: typeof fetch; now?: () => string; timeoutMs?: number } = {},
): Promise<PublicBaselineSource> {
  if (
    source.mode !== "live" ||
    !source.payload ||
    typeof source.payload !== "object" ||
    Array.isArray(source.payload)
  )
    return source;
  const parsed = Catalog.safeParse(source.payload);
  if (!parsed.success) return source;
  // The intake's historical context ends on the flight date; retain this choice explicitly.
  const previewReferenceDate = source.query.requestedTo;
  const preview = selectSentinelPreview(parsed.data.scenes, previewReferenceDate);
  let frozenPreview = null;
  let warning =
    "Ingen udbyder-thumbnail med højst 10 % global skydækning kunne vælges. Skyfri scene er ikke dokumenteret.";
  if (preview?.thumbnail) {
    try {
      const { mediaType, href } = preview.thumbnail;
      const bytes = await readPublicBytes(new URL(href), {
        fetchImpl: thumbnailFetch(options.fetchImpl ?? fetch),
        maxBytes: 300_000,
        timeoutMs: options.timeoutMs ?? 8_000,
        mediaType,
        // Zipper serves the declared STAC image as octet-stream; verify its byte signature below.
        additionalMediaTypes: ["application/octet-stream"],
      });
      const signature =
        mediaType === "image/jpeg"
          ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
          : mediaType === "image/png"
            ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
            : new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
              new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
      if (!signature) throw new PublicReadError("INVALID_IMAGE");
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      frozenPreview = {
        sceneId: preview.id,
        mediaType,
        dataUrl: `data:${mediaType};base64,${btoa(binary)}`,
        imageSha256: await bytesSha256(bytes),
        imageFetchedAt: (options.now ?? (() => new Date().toISOString()))(),
      };
      warning =
        "Satellittens oversigtsbillede er gemt med SHA-256 i denne kildeversion. Hele scenens skyprocent er ikke bevis for lokal skyfrihed.";
    } catch {
      warning =
        "Den valgte satellitscenes billede kunne ikke hentes inden for tids-/størrelsesgrænsen. Kataloget er bevaret, men gemte billedpixels mangler.";
    }
  }
  const payload = {
    ...source.payload,
    previewReferenceDate,
    previewSceneId: preview?.id ?? null,
    frozenPreview,
  };
  return {
    ...source,
    adapterVersion: "sentinel-scene-catalog-frozen/v1",
    payload,
    payloadSha256: await baselineSha256(payload),
    quality: { ...source.quality, warnings: [...source.quality.warnings, warning] },
  };
}

export async function fetchFrozenSentinelSceneSource(
  input: SentinelSceneInput,
  options: SentinelSceneOptions = {},
) {
  return freezeSentinelPreview(await fetchSentinelSceneSource(input, options), options);
}
