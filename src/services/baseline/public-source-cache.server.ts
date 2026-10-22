import { baselineSha256, canonicalBaselineJson } from "./public-baseline-service";
import type { PublicBaselineSource } from "./public-baseline-types";

const FRESH_MS = 15 * 60_000;
const MAX_AGE_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 24;
const MAX_BYTES = 4 * 1024 * 1024;
export const PUBLIC_SOURCE_TIMEOUT_MS = 25_000;

/** Bounded worker-local acceleration. Saved project snapshots remain the durable cache. */
export class PublicSourceCache {
  private entries = new Map<string, { source: PublicBaselineSource; bytes: number }>();

  get(key: string, nowMs: number): PublicBaselineSource | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const age = nowMs - Date.parse(entry.source.fetchedAt);
    if (!Number.isFinite(age) || age < -60_000 || age > MAX_AGE_MS) {
      this.entries.delete(key);
      return null;
    }
    return structuredClone(entry.source);
  }

  async put(key: string, source: PublicBaselineSource): Promise<void> {
    if (
      source.mode !== "live" ||
      source.error !== null ||
      source.payload === null ||
      !["complete", "partial", "no_coverage"].includes(source.status) ||
      (await baselineSha256(source.payload)) !== source.payloadSha256
    )
      return;
    const bytes = new TextEncoder().encode(canonicalBaselineJson(source)).byteLength;
    if (bytes > MAX_BYTES) return;
    this.entries.delete(key);
    this.entries.set(key, { source: structuredClone(source), bytes });
    while (
      this.entries.size > MAX_ENTRIES ||
      [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0) > MAX_BYTES
    )
      this.entries.delete(this.entries.keys().next().value!);
  }
}

export const publicSourceCache = new PublicSourceCache();

export function publicSourceCacheKey(projectId: string, source: PublicBaselineSource): string {
  return `${projectId}/${source.id}/${canonicalBaselineJson(source.query)}`;
}

function sameQuery(a: PublicBaselineSource, b: PublicBaselineSource): boolean {
  return a.id === b.id && canonicalBaselineJson(a.query) === canonicalBaselineJson(b.query);
}

export async function collectCachedPublicSource(
  projectId: string,
  placeholder: PublicBaselineSource,
  collect: () => Promise<PublicBaselineSource>,
  options: { cache?: PublicSourceCache; nowMs?: () => number; timeoutMs?: number } = {},
): Promise<PublicBaselineSource> {
  const nowMs = options.nowMs ?? Date.now;
  const key = publicSourceCacheKey(projectId, placeholder);
  const cached = options.cache?.get(key, nowMs()) ?? null;
  const reuse = (stale: boolean): PublicBaselineSource => ({
    ...cached!,
    status: stale ? "partial" : cached!.status,
    retrieval: {
      mode: stale ? "saved_fallback" : "cache",
      checkedAt: new Date(nowMs()).toISOString(),
    },
    quality: {
      ...cached!.quality,
      warnings: [
        ...cached!.quality.warnings,
        stale
          ? "Kilden kunne ikke genhentes. Et tidligere valideret svar for præcis samme område og periode vises med sin oprindelige hentedato."
          : "Et valideret kildesvar fra de seneste 15 minutter genbruges. Hentedatoen er uændret.",
      ],
    },
    error: stale
      ? { code: "SAVED_SOURCE_FALLBACK", message: "Gemt kilde · aktuel hentning ikke tilgængelig." }
      : cached!.error,
  });
  if (cached && nowMs() - Date.parse(cached.fetchedAt) <= FRESH_MS) return reuse(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const timeoutMs = Math.max(
      1,
      Math.min(PUBLIC_SOURCE_TIMEOUT_MS, options.timeoutMs ?? PUBLIC_SOURCE_TIMEOUT_MS),
    );
    const result = await Promise.race([
      Promise.resolve().then(collect),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error("SOURCE_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
    // Invalid scope/checksums must fail the manifest validation, never populate a cache.
    if (!sameQuery(result, placeholder)) return result;
    if (
      cached &&
      ["timeout", "failed"].includes(result.status) &&
      !/ACCESS|CREDENTIAL|401|403|UNSAFE|INVALID/.test(result.error?.code ?? "")
    )
      return reuse(true);
    await options.cache?.put(key, result);
    return result;
  } catch {
    if (cached) return reuse(true);
    return {
      ...placeholder,
      mode: "error",
      status: timedOut ? "timeout" : "failed",
      fetchedAt: new Date(nowMs()).toISOString(),
      payload: null,
      payloadSha256: null,
      coverage: {
        ...placeholder.coverage,
        spatial: "unknown",
        temporal: "unknown",
        observedFrom: null,
        observedTo: null,
        paginationComplete: false,
        returnedCount: null,
      },
      error: {
        code: timedOut ? "COLLECTOR_TIMEOUT" : "COLLECTOR_FAILED",
        message: timedOut
          ? "Kilden nåede tidsgrænsen. De øvrige kilder er bevaret."
          : "Kilden kunne ikke hentes eller valideres. Prøv en ny dataversion senere.",
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
