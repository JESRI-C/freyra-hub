import { describe, expect, it, vi } from "vitest";
import { makeManifest, PROJECT_ID, COLLECTED_AT } from "./public-baseline.fixtures";
import { baselineSha256 } from "../public-baseline-service";
import {
  collectCachedPublicSource,
  PublicSourceCache,
  publicSourceCacheKey,
} from "../public-source-cache.server";

async function fixture() {
  const initial = (await makeManifest()).sources.find((s) => s.id === "sentinel-2-scenes")!;
  const payload = { scenes: ["test-fixture"] };
  return {
    initial,
    result: {
      ...initial,
      mode: "live" as const,
      status: "partial" as const,
      error: null,
      payload,
      payloadSha256: await baselineSha256(payload),
    },
  };
}
describe("bounded public-source cache", () => {
  it("uses exact project/geometry/period and retains original source date on a fresh hit", async () => {
    const { initial, result } = await fixture();
    const cache = new PublicSourceCache();
    const nowMs = () => Date.parse(COLLECTED_AT) + 60_000;
    const fetch = vi.fn().mockResolvedValue(result);
    await collectCachedPublicSource(PROJECT_ID, initial, fetch, { cache, nowMs });
    const cached = await collectCachedPublicSource(PROJECT_ID, initial, fetch, { cache, nowMs });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cached.fetchedAt).toBe(COLLECTED_AT);
    expect(cached.retrieval?.mode).toBe("cache");
    await collectCachedPublicSource("other-project", initial, fetch, { cache, nowMs });
    expect(fetch).toHaveBeenCalledTimes(2);
    await collectCachedPublicSource(
      PROJECT_ID,
      { ...initial, query: { ...initial.query, requestedFrom: "2026-09-02" } },
      fetch,
      { cache, nowMs },
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("retains valid saved data after outage, visibly partial, without changing the original", async () => {
    const { initial, result } = await fixture();
    const original = structuredClone(result);
    const cache = new PublicSourceCache();
    await cache.put(publicSourceCacheKey(PROJECT_ID, initial), result);
    const saved = await collectCachedPublicSource(
      PROJECT_ID,
      initial,
      () => Promise.reject(new Error("private token")),
      { cache, nowMs: () => Date.parse(COLLECTED_AT) + 60 * 60_000 },
    );
    expect(saved).toMatchObject({
      status: "partial",
      payload: result.payload,
      fetchedAt: COLLECTED_AT,
      retrieval: { mode: "saved_fallback" },
      error: { code: "SAVED_SOURCE_FALLBACK" },
    });
    expect(result).toEqual(original);
    expect(JSON.stringify(saved)).not.toContain("private token");
  });
  it("bounds a collector that ignores abort signals and never converts it to zero", async () => {
    const { initial } = await fixture();
    const result = await collectCachedPublicSource(
      PROJECT_ID,
      initial,
      () => new Promise(() => undefined),
      { timeoutMs: 5 },
    );
    expect(result).toMatchObject({
      status: "timeout",
      mode: "error",
      payload: null,
      coverage: { returnedCount: null },
    });
  });
  it("does not cache invalid checksums, credential errors or expired responses", async () => {
    const { initial, result } = await fixture();
    const cache = new PublicSourceCache();
    const key = publicSourceCacheKey(PROJECT_ID, initial);
    await cache.put(key, { ...result, payload: { changed: true } });
    expect(cache.get(key, Date.parse(COLLECTED_AT))).toBeNull();
    await cache.put(key, result);
    expect(cache.get(key, Date.parse(COLLECTED_AT) + 25 * 60 * 60_000)).toBeNull();
    await cache.put(key, result);
    const denied = await collectCachedPublicSource(
      PROJECT_ID,
      initial,
      async () => ({
        ...initial,
        status: "failed",
        error: { code: "ACCESS_DENIED", message: "Adgang mangler" },
      }),
      { cache, nowMs: () => Date.parse(COLLECTED_AT) + 60 * 60_000 },
    );
    expect(denied.status).toBe("failed");
    expect(denied.payload).toBeNull();
  });
});
