import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectGeometry } from "@/lib/supabase/types";

const state = vi.hoisted(() => ({
  demo: false,
  live: true,
  datafordelerKey: false,
  copernicusKey: true,
}));
vi.mock("@/lib/data-mode", () => ({
  get isDemoDataEnabled() {
    return state.demo;
  },
}));
vi.mock("@/config/live-data-config", () => ({
  getLiveDataConfig: () => ({
    isLiveDataEnabled: state.live,
    dmiBaseUrl: "https://opendataapi.dmi.dk",
    credentials: {
      datafordeler: {
        present: state.datafordelerKey,
        key: state.datafordelerKey ? "test-key" : null,
      },
      copernicus: {
        present: state.copernicusKey,
        token: state.copernicusKey ? "test-token" : null,
      },
    },
  }),
}));

import * as dmi from "../connectors/dmi-client";
import * as nature from "../connectors/miljoeportal-client";
import * as places from "../connectors/dataforsyningen-client";
import * as satellite from "../connectors/copernicus-client";
import { fetchWithTimeout, missingKeyResponse } from "../live-data-client";

const geometry: ProjectGeometry = {
  polygon: null,
  centroid: { lat: 55.249, lng: 9.487 },
  areaHa: null,
  hasValidGeometry: true,
  geometrySource: "manual",
  bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
};
const connectors = [
  { name: "DMI", fetch: dmi.fetchByGeometry, preview: dmi.fetchPreview },
  { name: "Miljøportal", fetch: nature.fetchByGeometry, preview: nature.fetchPreview },
  { name: "Dataforsyningen", fetch: places.fetchByGeometry, preview: places.fetchPreview },
  { name: "Copernicus", fetch: satellite.fetchByGeometry, preview: satellite.fetchPreview },
];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  state.demo = false;
  state.live = true;
  state.datafordelerKey = false;
  state.copernicusKey = true;
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each(connectors)("$name customer source integrity", ({ fetch: fetchSource, preview }) => {
  it("returns disabled with no sample values when customer live mode is off", async () => {
    state.live = false;
    const response = await fetchSource(geometry);
    expect(response).toMatchObject({ data: null, mode: "error", status: "disabled" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects sample data even with the removed offline switch", async () => {
    state.live = false;
    state.demo = true;
    expect(await fetchSource(geometry)).toMatchObject({
      data: null,
      mode: "error",
      status: "disabled",
    });
    expect((await preview()).data).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not expose sample data through an explicit preview call in customer mode", async () => {
    state.live = false;
    expect(await preview()).toMatchObject({ data: null, mode: "error", status: "disabled" });
  });

  it("does not offer preview as a live failure fallback even if demo was selected", async () => {
    state.demo = true;
    expect(await preview()).toMatchObject({ data: null, mode: "error", status: "disabled" });
  });

  it("returns invalid geometry instead of inventing local data or querying without a location", async () => {
    const response = await fetchSource({ ...geometry, centroid: null, hasValidGeometry: false });
    expect(response).toMatchObject({ data: null, mode: "error", status: "invalid_geometry" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves upstream network errors without preview or empty success", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Network unavailable"));
    expect(await fetchSource(geometry)).toMatchObject({
      data: null,
      mode: "error",
      status: "error",
    });
  });

  it("preserves HTTP 429 as an error", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 429));
    const response = await fetchSource(geometry);
    expect(response).toMatchObject({ data: null, mode: "error", status: "error" });
    expect(response.error).toContain("429");
  });

  it("preserves an aborted request as a timeout", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("Request cancelled", "AbortError"));
    expect(await fetchSource(geometry)).toMatchObject({
      data: null,
      mode: "error",
      status: "timeout",
    });
  });
});

describe("DMI observations", () => {
  it("accepts real precipitation data without requiring a temperature observation", async () => {
    const observed = "2026-08-24T08:00:00Z";
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        features: [
          {
            properties: {
              parameterId: "precip_past10min",
              value: 0,
              unit: "mm",
              observed,
              stationId: "test-station",
            },
          },
        ],
      }),
    );
    const response = await dmi.fetchByGeometry(geometry);
    expect(response).toMatchObject({
      mode: "live",
      status: "ok",
      data: {
        observedAt: observed,
        precipitation: { value: 0, stationId: "test-station" },
      },
    });
    expect(response.data?.temperature).toBeUndefined();
  });

  it("reports a valid empty response as no coverage", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ features: [] }));
    expect(await dmi.fetchByGeometry(geometry)).toMatchObject({
      data: null,
      mode: "error",
      status: "no_coverage",
    });
  });

  it("reports malformed upstream data as an error rather than empty coverage", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: "unexpected provider payload" }));
    expect(await dmi.fetchByGeometry(geometry)).toMatchObject({
      data: null,
      mode: "error",
      status: "error",
    });
  });

  it("does not treat latitude or longitude zero as a missing location", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ features: [] }));
    await dmi.fetchByGeometry({ ...geometry, centroid: { lat: 0, lng: 0 } });
    expect(fetch).toHaveBeenCalledOnce();
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.get("bbox")).toBe("-0.5,-0.5,0.5,0.5");
  });
});

describe("nature source coverage", () => {
  it("does not disguise a failed §3 request as zero protected habitats", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ species: [] }))
      .mockResolvedValueOnce(jsonResponse({}, 503));
    const response = await nature.fetchByGeometry(geometry);
    expect(response).toMatchObject({ data: null, status: "error" });
    expect(nature.normalizeResult(response).protectedCount).toBeUndefined();
  });

  it("reports a successful empty species and habitat lookup as no coverage", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ species: [] }))
      .mockResolvedValueOnce(jsonResponse({ features: [] }));
    expect(await nature.fetchByGeometry(geometry)).toMatchObject({
      data: null,
      status: "no_coverage",
    });
  });
});

describe("place source errors", () => {
  it("does not replace a keyed Datafordeler rate limit with another source or preview", async () => {
    state.datafordelerKey = true;
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 429));
    expect(await places.fetchByGeometry(geometry)).toMatchObject({ data: null, status: "error" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("can use the real public reverse geocoder without a Datafordeler key", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ kommunenavn: "Haderslev", regionsnavn: "Region Syddanmark" }),
    );
    expect(await places.fetchByGeometry(geometry)).toMatchObject({
      mode: "live",
      status: "ok",
      data: {
        municipalityName: "Haderslev",
      },
    });
  });
});

describe("satellite source availability", () => {
  it("returns missing key with no simulated NDVI or scene", async () => {
    state.copernicusKey = false;
    expect(await satellite.fetchByGeometry(geometry)).toMatchObject({
      data: null,
      mode: "error",
      status: "missing_key",
    });
    expect(missingKeyResponse()).toMatchObject({
      data: null,
      mode: "error",
      status: "missing_key",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not report unknown scene cloud cover as measured zero", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        features: [
          {
            id: "real-scene",
            properties: { datetime: "2026-08-24T10:00:00Z", platform: "sentinel-2a" },
          },
        ],
      }),
    );
    const response = await satellite.fetchByGeometry(geometry);
    expect(response).toMatchObject({
      mode: "live",
      status: "ok",
      data: { ndviIsSimulated: false },
    });
    expect(response.data?.scenes[0].cloudCover).toBeUndefined();
    expect(response.data?.latestNdviEstimate).toBeUndefined();
  });

  it("reports an empty catalogue as no coverage without NDVI preview", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ features: [] }));
    expect(await satellite.fetchByGeometry(geometry)).toMatchObject({
      data: null,
      status: "no_coverage",
    });
  });
});

it("aborts the actual timeout request and clears the timer", async () => {
  vi.useFakeTimers();
  let requestSignal: AbortSignal | null | undefined;
  vi.mocked(fetch).mockImplementation((_input, options) => {
    requestSignal = options?.signal;
    return new Promise((_resolve, reject) => {
      requestSignal?.addEventListener("abort", () =>
        reject(new DOMException("Request timed out", "AbortError")),
      );
    });
  });
  const result = fetchWithTimeout("https://example.test/source", { timeoutMs: 100 }).catch(
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(100);
  expect(await result).toBeInstanceOf(DOMException);
  expect(requestSignal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
