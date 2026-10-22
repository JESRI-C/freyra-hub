import { describe, expect, it, vi } from "vitest";
import { makeManifest, PROJECT_ID, COLLECTED_AT } from "./public-baseline.fixtures";
import { baselineSha256 } from "../public-baseline-service";
import {
  collectCachedPublicSource,
  PublicSourceCache,
  publicSourceCacheKey,
} from "../public-source-cache.server";
import { monitoringSource } from "./public-monitoring-stations-saved.fixtures";
import { parseSavedPublicMonitoringStationsSource } from "../public-monitoring-stations-saved-payload";

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
  it("does not reuse a legacy representation when the caller requires frozen pixels", async () => {
    const { initial, result } = await fixture();
    const cache = new PublicSourceCache();
    await cache.put(publicSourceCacheKey(PROJECT_ID, initial), result);
    const upgraded = { ...result, adapterVersion: "sentinel-scene-catalog-frozen/v1" };
    const collect = vi.fn().mockResolvedValue(upgraded);
    const options = {
      cache,
      nowMs: () => Date.parse(COLLECTED_AT) + 60_000,
      acceptCached: (source: { adapterVersion: string }) =>
        source.adapterVersion === upgraded.adapterVersion,
    };
    expect(await collectCachedPublicSource(PROJECT_ID, initial, collect, options)).toEqual(
      upgraded,
    );
    expect(collect).toHaveBeenCalledTimes(1);
    expect(
      (await collectCachedPublicSource(PROJECT_ID, initial, collect, options)).retrieval?.mode,
    ).toBe("cache");
    expect(collect).toHaveBeenCalledTimes(1);
  });
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
      error: null,
    });
    expect(result).toEqual(original);
    expect(JSON.stringify(saved)).not.toContain("private token");
  });
  it("keeps a valid fallback readable by strict frozen-source consumers", async () => {
    const original = monitoringSource(2);
    original.payloadSha256 = await baselineSha256(original.payload);
    const cache = new PublicSourceCache();
    await cache.put(publicSourceCacheKey(PROJECT_ID, original), original);
    const fallback = await collectCachedPublicSource(
      PROJECT_ID,
      original,
      () => Promise.reject(new Error("outage")),
      { cache, nowMs: () => Date.parse(original.fetchedAt) + 60 * 60_000 },
    );
    expect(fallback.retrieval?.mode).toBe("saved_fallback");
    expect(parseSavedPublicMonitoringStationsSource(fallback)).not.toBeNull();
    expect(fallback.status).toBe("partial");
    expect(fallback.quality.warnings.join(" ")).toContain("oprindelige hentedato");
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
