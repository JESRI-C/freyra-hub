import { describe, it, expect, vi } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { buildRasterQueryProjection } from "@/services/baseline/raster-query-projection";
import {
  PUBLIC_MONITORING_STATIONS_PRODUCT,
  PUBLIC_MONITORING_STATIONS_SCHEMA,
  MAX_MONITORING_PAGE_BYTES,
  MAX_MONITORING_TIMEOUT_MS,
  MONITORING_PAGE_COUNT,
  parsePublicMonitoringStationsPage,
  buildPublicMonitoringStationsUrl,
  PublicMonitoringStationsError,
  type PublicMonitoringStationsPayload,
} from "../public-monitoring-stations-source";
import { fetchPublicMonitoringStationsSource } from "../public-monitoring-stations-source.server";
import {
  MONITORING_INPUT,
  MONITORING_NATIVE_BBOX,
  monitoringQaPage,
  syntheticMonitoringPage,
  PUBLIC_QA_CANDIDATE_EVIDENCE,
} from "./public-monitoring-stations.fixtures";

type MutableTestPage = {
  type: string;
  features: {
    type: string;
    id: string;
    geometry_name: string;
    geometry: { type: string; coordinates: number[] } | null;
    properties: Record<string, unknown>;
  }[];
  numberMatched?: number | string;
  numberReturned: number;
  totalFeatures: number;
  timeStamp: string;
  crs?: { type: string; properties: { name: string } } | null;
};
const NOW = "2026-10-13T19:00:00Z";
const jsonResponse = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=UTF-8", ...headers },
  });
const utf8Sha = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
const fetchPages = (pages: unknown[]) =>
  vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(pages.shift()));
const payloadOf = (source: Awaited<ReturnType<typeof fetchPublicMonitoringStationsSource>>) =>
  source.payload as unknown as PublicMonitoringStationsPayload;
async function expectFailed(fetchImpl: typeof fetch, code?: string) {
  const source = await fetchPublicMonitoringStationsSource(MONITORING_INPUT, {
    fetchImpl,
    now: () => NOW,
  });
  expect(source).toMatchObject({
    id: "public-monitoring-stations",
    mode: "error",
    status: "failed",
    payload: null,
    payloadSha256: null,
    coverage: {
      paginationComplete: false,
      returnedCount: null,
      spatial: "unknown",
      temporal: "unknown",
    },
  });
  if (code) expect(source.error?.code).toBe(code);
  return source;
}
function parse(raw: unknown) {
  return parsePublicMonitoringStationsPage(raw, MONITORING_NATIVE_BBOX, 0);
}

describe("general VanDa site DTO", () => {
  it("preserves actual native QA IDs/coordinates as general candidates, no inferred type or association", () => {
    const input = monitoringQaPage(),
      before = structuredClone(input);
    const page = parse(input);
    expect(input).toEqual(before);
    expect(page.numberReturned).toBe(7);
    expect(page.candidates[1]).toMatchObject({
      kind: "generic_vanda_site",
      siteUuid: "035258be-b261-401a-abd1-1b767cc96466",
      stationNumber: "38000308",
      sourceName: null,
      nameStatus: "omitted_unstructured_label",
      sourceType: { code: null, name: null, status: "not_reported" },
      nativeGeometry: { type: "Point", coordinates: [517070, 6134364] },
      geometryCrs: "EPSG:25832",
      hydrometricStationRelation: "not_verified",
      watercourseRelation: "not_verified",
      catchmentRelation: "not_verified",
      municipalReachMapped: false,
      measurements: "not_fetched",
    });
    expect(PUBLIC_QA_CANDIDATE_EVIDENCE.municipalAcceptance).toBe(false);
  });
  it("strips owner/link/contact/CVR and fabricated measurements/types from extra source properties", () => {
    const raw = monitoringQaPage();
    Object.assign(raw.features[0].properties, {
      Stationsejer: "CVR 12345678",
      Link: "https://evil.invalid/?key=private",
      Kontakt: "person@example.invalid",
      Telefon: "+45 12 34 56 78",
      Medie: "Hydrometri",
      type: "approved_station",
      result: 999,
    });
    const serialized = JSON.stringify(parse(raw));
    for (const value of [
      "12345678",
      "evil.invalid",
      "example.invalid",
      "Telefon",
      "Stationsejer",
      "approved_station",
      "999",
    ])
      expect(serialized).not.toContain(value);
  });
  it.each([
    "mail person@example.invalid",
    "CVR 12345678",
    "Tlf 12345678",
    "+45 12345678",
    "12 34 56 78",
    "https://site.invalid",
    "Name\ncontact",
    "CPR 010190-1234",
    "Bykær Bæk, ejer Jens Hansen, Skovvej 12",
    "Station ved Jens Hansen",
    "Jens Hansen",
  ])("redacts contact-like source label %s", (name) => {
    const raw = monitoringQaPage();
    raw.features[0].properties.Stationsnavn = name;
    expect(parse(raw).candidates[0]).toMatchObject({
      sourceName: null,
      nameStatus: "omitted_unstructured_label",
    });
  });
  it("empty source label stays unknown, without inventing a name", () => {
    const raw = monitoringQaPage();
    raw.features[0].properties.Stationsnavn = "  ";
    expect(parse(raw).candidates[0]).toMatchObject({
      sourceName: null,
      nameStatus: "not_reported",
    });
  });
  it.each([
    { key: "fullAvailable", value: false },
    { key: "truncated", value: true },
    { key: "unknownSourceMetadata", value: { complete: true } },
  ])("fails closed on unknown/incomplete root marker $key", ({ key, value }) => {
    const raw = monitoringQaPage();
    Object.assign(raw, { [key]: value });
    expect(() => parse(raw)).toThrow(PublicMonitoringStationsError);
  });
  it("rejects unknown Feature and CRS fields while intentionally stripping extra source properties", () => {
    const featureExtra = monitoringQaPage();
    Object.assign(featureExtra.features[0], { fullAvailable: false });
    expect(() => parse(featureExtra)).toThrow(PublicMonitoringStationsError);
    const crsExtra = monitoringQaPage();
    Object.assign(crsExtra.crs.properties, { axis: "northing-easting" });
    expect(() => parse(crsExtra)).toThrow(PublicMonitoringStationsError);
  });
  it("accepts only observed optional link/bbox metadata and does not retain it as candidate evidence", () => {
    const raw = monitoringQaPage();
    raw.features = raw.features.slice(0, 5);
    raw.numberReturned = 5;
    for (const feature of raw.features) {
      const [x, y] = feature.geometry.coordinates;
      Object.assign(feature, { bbox: [x, y, x, y] });
    }
    const xs = raw.features.map((f) => f.geometry.coordinates[0]),
      ys = raw.features.map((f) => f.geometry.coordinates[1]);
    Object.assign(raw, {
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      links: [
        {
          title: "next page",
          type: "application/json",
          rel: "next",
          href: "https://evil.invalid/next",
        },
      ],
    });
    const page = parsePublicMonitoringStationsPage(raw, MONITORING_NATIVE_BBOX, 0, 5);
    expect(page.numberReturned).toBe(5);
    expect(JSON.stringify(page)).not.toContain("evil.invalid");
    expect(JSON.stringify(page)).not.toContain('"bbox"');
  });
  it.each([
    { name: "terminal next", total: 7, start: 0, relations: ["next"] },
    { name: "first-page previous", total: 51, start: 0, relations: ["previous"] },
    { name: "duplicate next", total: 51, start: 0, relations: ["next", "next"] },
    { name: "duplicate previous", total: 51, start: 50, relations: ["previous", "previous"] },
    { name: "empty terminal next", total: 0, start: 0, relations: ["next"] },
  ])("rejects contradictory paging marker: $name", ({ total, start, relations }) => {
    const raw = syntheticMonitoringPage(total, start);
    Object.assign(raw, {
      links: relations.map((rel) => ({
        title: `${rel} page`,
        type: "application/json",
        rel,
        href: "https://evil.invalid/ignored",
      })),
    });
    expect(() => parsePublicMonitoringStationsPage(raw, MONITORING_NATIVE_BBOX, start)).toThrow(
      /sidemarkører/,
    );
  });
  it("accepts the observed last-page previous marker without retaining its link", () => {
    const raw = monitoringQaPage();
    raw.features = raw.features.slice(5);
    raw.numberReturned = 2;
    Object.assign(raw, {
      links: [
        {
          title: "previous page",
          type: "application/json",
          rel: "previous",
          href: "https://evil.invalid/ignored",
        },
      ],
    });
    const parsed = parsePublicMonitoringStationsPage(raw, MONITORING_NATIVE_BBOX, 5, 5);
    expect(parsed.numberReturned).toBe(2);
    expect(JSON.stringify(parsed)).not.toContain("evil.invalid");
  });
  it("rejects inconsistent optional feature and page bboxes", () => {
    const pointMismatch = monitoringQaPage();
    Object.assign(pointMismatch.features[0], { bbox: [0, 0, 0, 0] });
    expect(() => parse(pointMismatch)).toThrow(/punktområde/);
    const pageMismatch = monitoringQaPage();
    Object.assign(pageMismatch, { bbox: [0, 0, 1, 1] });
    expect(() => parse(pageMismatch)).toThrow(PublicMonitoringStationsError);
  });
  it("valid empty collection can omit a CRS only as explicit null and keeps received zero candidates", () => {
    const page = parse(syntheticMonitoringPage(0));
    expect(page.candidates).toEqual([]);
    expect(page.numberMatched).toBe(0);
  });
  it.each([
    { name: "missing matched count", change: (p: MutableTestPage) => delete p.numberMatched },
    { name: "string count", change: (p: MutableTestPage) => (p.numberMatched = "7") },
    { name: "unknown count", change: (p: MutableTestPage) => (p.numberMatched = "unknown") },
    { name: "negative count", change: (p: MutableTestPage) => (p.numberMatched = -1) },
    { name: "total mismatch", change: (p: MutableTestPage) => (p.totalFeatures = 8) },
    { name: "returned mismatch", change: (p: MutableTestPage) => (p.numberReturned = 6) },
    { name: "missing row", change: (p: MutableTestPage) => p.features.pop() },
    {
      name: "invalid timestamp",
      change: (p: MutableTestPage) => (p.timeStamp = "1970-not-a-date"),
    },
    { name: "no native CRS", change: (p: MutableTestPage) => (p.crs = null) },
    { name: "wrong CRS", change: (p: MutableTestPage) => (p.crs!.properties.name = "EPSG:4326") },
    { name: "missing CRS", change: (p: MutableTestPage) => delete p.crs },
    { name: "unknown FC type", change: (p: MutableTestPage) => (p.type = "NotFeatureCollection") },
    {
      name: "non-native point",
      change: (p: MutableTestPage) => (p.features[0].geometry!.coordinates = [9.25, 55.36]),
    },
    {
      name: "reversed axes",
      change: (p: MutableTestPage) => p.features[0].geometry!.coordinates.reverse(),
    },
    {
      name: "altitude",
      change: (p: MutableTestPage) => p.features[0].geometry!.coordinates.push(10),
    },
    {
      name: "nonfinite point",
      change: (p: MutableTestPage) => (p.features[0].geometry!.coordinates[0] = Infinity),
    },
    {
      name: "outside envelope",
      change: (p: MutableTestPage) => (p.features[0].geometry!.coordinates[0] = 515755.9),
    },
    { name: "missing point", change: (p: MutableTestPage) => (p.features[0].geometry = null) },
    {
      name: "line geometry",
      change: (p: MutableTestPage) => (p.features[0].geometry!.type = "LineString"),
    },
    {
      name: "wrong geometry field",
      change: (p: MutableTestPage) => (p.features[0].geometry_name = "Shape"),
    },
    {
      name: "wrong layer identity",
      change: (p: MutableTestPage) =>
        (p.features[0].id = p.features[0].id.replace("steder.", "vandloeb.")),
    },
    { name: "bad UUID", change: (p: MutableTestPage) => (p.features[0].id = "steder.not-uuid") },
    {
      name: "bad station number",
      change: (p: MutableTestPage) => (p.features[0].properties.Stationsnummer = "1064_6508"),
    },
    {
      name: "numeric station number",
      change: (p: MutableTestPage) => (p.features[0].properties.Stationsnummer = 38000292),
    },
    {
      name: "missing name",
      change: (p: MutableTestPage) => delete p.features[0].properties.Stationsnavn,
    },
    {
      name: "name too large",
      change: (p: MutableTestPage) => (p.features[0].properties.Stationsnavn = "x".repeat(501)),
    },
    {
      name: "repeated UUID",
      change: (p: MutableTestPage) => (p.features[1].id = p.features[0].id.toLowerCase()),
    },
    {
      name: "repeated station",
      change: (p: MutableTestPage) =>
        (p.features[1].properties.Stationsnummer = p.features[0].properties.Stationsnummer),
    },
    { name: "sort reversed", change: (p: MutableTestPage) => p.features.reverse() },
  ])("rejects $name, without returning an empty-success substitute", ({ change }) => {
    const raw = monitoringQaPage();
    change(raw);
    expect(() => parse(raw)).toThrow(PublicMonitoringStationsError);
  });
  it("rejects requested inventory beyond 100 candidates", () =>
    expect(() => parse(syntheticMonitoringPage(101))).toThrow(/kandidatgrænsen/));
  it("bounds points at the inclusive query envelope", () => {
    const raw = syntheticMonitoringPage(1);
    raw.features[0].geometry.coordinates = [MONITORING_NATIVE_BBOX[0], MONITORING_NATIVE_BBOX[3]];
    expect(parse(raw).candidates).toHaveLength(1);
  });
});

describe("bounded anonymous catalogue adapter", () => {
  it("gets only the fixed public WFS, binds saved polygon/period and hashes exact received bytes", async () => {
    const raw = monitoringQaPage(),
      rawText = JSON.stringify(raw),
      fetchImpl = fetchPages([raw]);
    const input = {
      ...MONITORING_INPUT,
      geometrySha256: await baselineSha256(MONITORING_INPUT.polygon),
    };
    const source = await fetchPublicMonitoringStationsSource(input, { fetchImpl, now: () => NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(requestUrl));
    expect(url.origin + url.pathname).toBe(PUBLIC_MONITORING_STATIONS_PRODUCT.endpoint);
    expect(url.searchParams.get("bbox")).toBe(
      "515756,6132196,517345,6136401,urn:ogc:def:crs:EPSG::25832",
    );
    expect(url.searchParams.get("typeNames")).toBe("vanda:steder");
    expect(url.searchParams.get("sortBy")).toBe("Stationsnummer A");
    expect(url.searchParams.has("dateFrom")).toBe(false);
    expect(init).toMatchObject({ credentials: "omit", redirect: "manual", method: "GET" });
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(source).toMatchObject({
      id: "public-monitoring-stations",
      status: "partial",
      mode: "live",
      licence: "CC0 1.0",
      datasetVersion: null,
      sourceModifiedAt: null,
      fetchedAt: NOW,
      query: {
        geometrySha256: input.geometrySha256,
        requestedFrom: "2025-10-01",
        requestedTo: "2025-10-31",
      },
      coverage: {
        spatial: "unknown",
        temporal: "unknown",
        observedFrom: null,
        observedTo: null,
        paginationComplete: true,
        returnedCount: 7,
      },
      quality: { evidenceKind: "official_registration" },
      error: null,
    });
    const payload = payloadOf(source);
    expect(payload).toMatchObject({
      schema: PUBLIC_MONITORING_STATIONS_SCHEMA,
      catalogueView: "current_received_registry",
      historicalRegistryCoverageVerified: false,
      measurementDataFetched: false,
      hydrometricStationCoverage: "not_verified",
      automaticWatercourseAssociationPerformed: false,
      automaticCatchmentAssociationPerformed: false,
      metricsCalculated: false,
      municipalReachMapped: false,
      legalAssessmentPerformed: false,
      upstreamTransactionalSnapshot: false,
      requestedPeriod: { from: input.dateFrom, to: input.dateTo },
    });
    expect(payload.pages[0].serverTimestamp).toBe("2026-10-13T18:54:54.012Z");
    expect(payload.pages[0].responseSha256).toBe(await utf8Sha(rawText));
    expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
    expect(payload.queryProjection).toEqual(buildRasterQueryProjection(input.polygon));
  });
  it("two sorted pages freeze 51 candidates, never follow attacker next links or assert transactional consistency", async () => {
    const first = syntheticMonitoringPage(51),
      second = syntheticMonitoringPage(51, 50);
    Object.assign(first, {
      links: [
        {
          title: "next page",
          type: "application/json",
          rel: "next",
          href: "https://evil.invalid/?apiKey=private",
        },
      ],
    });
    Object.assign(second, {
      links: [
        {
          title: "previous page",
          type: "application/json",
          rel: "previous",
          href: "https://evil.invalid/ignored",
        },
      ],
    });
    const fetchImpl = fetchPages([first, second]);
    const source = await fetchPublicMonitoringStationsSource(MONITORING_INPUT, {
      fetchImpl,
      now: () => NOW,
    });
    expect(source.status).toBe("partial");
    expect(source.coverage.returnedCount).toBe(51);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchImpl.mock.calls[1][0])).searchParams.get("startIndex")).toBe("50");
    expect(payloadOf(source).pages.map((p) => p.startIndex)).toEqual([0, 50]);
    expect(payloadOf(source).upstreamTransactionalSnapshot).toBe(false);
    expect(JSON.stringify(source)).not.toContain("evil.invalid");
  });
  it("keeps a terminal next contradiction as a failed source with unknown count and no payload", async () => {
    const raw = monitoringQaPage();
    Object.assign(raw, {
      links: [
        {
          title: "next page",
          type: "application/json",
          rel: "next",
          href: "https://evil.invalid/ignored",
        },
      ],
    });
    const fetchImpl = fetchPages([raw]);
    await expectFailed(fetchImpl, "INCOMPLETE_INVENTORY");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("valid empty response remains partial/unknown and performs no Hydro or nearest-station search", async () => {
    const fetchImpl = fetchPages([syntheticMonitoringPage(0)]);
    const source = await fetchPublicMonitoringStationsSource(MONITORING_INPUT, {
      fetchImpl,
      now: () => NOW,
    });
    expect(source).toMatchObject({
      status: "partial",
      mode: "live",
      coverage: {
        returnedCount: 0,
        paginationComplete: true,
        spatial: "unknown",
        temporal: "unknown",
      },
    });
    expect(payloadOf(source).measurementDataFetched).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("the inclusive hard boundary is 100 candidates in exactly two requests", async () => {
    const fetchImpl = fetchPages([syntheticMonitoringPage(100), syntheticMonitoringPage(100, 50)]);
    const source = await fetchPublicMonitoringStationsSource(MONITORING_INPUT, {
      fetchImpl,
      now: () => NOW,
    });
    expect(source.coverage.returnedCount).toBe(100);
    expect(source.status).toBe("partial");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("incomplete-provider metadata yields null, never a complete seven-row inventory", async () => {
    const raw = monitoringQaPage();
    Object.assign(raw, { fullAvailable: false });
    await expectFailed(fetchPages([raw]), "INVALID_SCHEMA");
  });
  it("person and address labels cannot enter canonical persisted source payload", async () => {
    const raw = monitoringQaPage();
    raw.features[0].properties.Stationsnavn = "Bykær Bæk, ejer Jens Hansen, Skovvej 12";
    const source = await fetchPublicMonitoringStationsSource(MONITORING_INPUT, {
      fetchImpl: fetchPages([raw]),
      now: () => NOW,
    });
    expect(source.status).toBe("partial");
    const text = JSON.stringify(source.payload);
    for (const fragment of ["Jens", "Hansen", "Skovvej", "Bykær Bæk"])
      expect(text).not.toContain(fragment);
    expect(payloadOf(source).product.candidates[0]).toMatchObject({
      sourceName: null,
      nameStatus: "omitted_unstructured_label",
    });
    expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
  });
  it.each([
    {
      name: "HTTP 200 HTML",
      response: () =>
        new Response("<html>SPA</html>", { headers: { "content-type": "text/html" } }),
      code: "SOURCE_HTTP_ERROR",
    },
    {
      name: "HTTP 503",
      response: () =>
        new Response("error", { status: 503, headers: { "content-type": "application/json" } }),
      code: "SOURCE_HTTP_ERROR",
    },
    {
      name: "redirect",
      response: () =>
        new Response(null, { status: 302, headers: { location: "https://evil.invalid" } }),
      code: "SOURCE_HTTP_ERROR",
    },
    {
      name: "invalid JSON",
      response: () => new Response("{broken", { headers: { "content-type": "application/json" } }),
      code: "INVALID_JSON",
    },
    {
      name: "empty body",
      response: () => new Response(null, { headers: { "content-type": "application/json" } }),
      code: "SOURCE_EMPTY_BODY",
    },
    {
      name: "declared oversize",
      response: () =>
        jsonResponse(monitoringQaPage(), {
          "content-length": String(MAX_MONITORING_PAGE_BYTES + 1),
        }),
      code: "SOURCE_SIZE_LIMIT",
    },
    {
      name: "bad content length",
      response: () => jsonResponse(monitoringQaPage(), { "content-length": "-1" }),
      code: "SOURCE_SIZE_LIMIT",
    },
    {
      name: "unknown source schema",
      response: () => jsonResponse({ data: [] }),
      code: "INVALID_SCHEMA",
    },
    {
      name: "over 100 candidates",
      response: () => jsonResponse(syntheticMonitoringPage(101)),
      code: "CANDIDATE_LIMIT",
    },
  ])("$name fails closed with null payload and unknown count", async ({ response, code }) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response());
    await expectFailed(fetchImpl, code);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("network rejection cannot expose private error text", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("person@example.invalid secret-url"));
    const source = await expectFailed(fetchImpl, "SOURCE_FAILED");
    expect(JSON.stringify(source)).not.toContain("example.invalid");
  });
  it.each([
    {
      name: "matched count changed",
      change: (p: MutableTestPage) => {
        p.numberMatched = 52;
        p.totalFeatures = 52;
        p.numberReturned = 2;
        p.features.push(syntheticMonitoringPage(52, 50).features[1]);
      },
      code: "PAGINATION_CHANGED",
    },
    {
      name: "duplicate UUID across pages",
      change: (p: MutableTestPage) =>
        (p.features[0].id = syntheticMonitoringPage(51).features[0].id),
      code: "CONFLICTING_ID",
    },
    {
      name: "duplicate station across pages",
      change: (p: MutableTestPage) => (p.features[0].properties.Stationsnummer = "80000000"),
      code: "CONFLICTING_ID",
    },
    {
      name: "cross-page sort regress",
      change: (p: MutableTestPage) => (p.features[0].properties.Stationsnummer = "79000000"),
      code: "SORT_CHANGED",
    },
    {
      name: "empty missing final page",
      change: (p: MutableTestPage) => {
        p.features = [];
        p.numberReturned = 0;
      },
      code: "INCOMPLETE_INVENTORY",
    },
  ])("$name discards all first-page candidates", async ({ change, code }) => {
    const second = syntheticMonitoringPage(51, 50);
    change(second);
    const fetchImpl = fetchPages([syntheticMonitoringPage(51), second]);
    await expectFailed(fetchImpl, code);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("stream bytes enforce the page limit and cancel the unread body", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_MONITORING_PAGE_BYTES + 1));
      },
      cancel: cancelled,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body, { headers: { "content-type": "application/json" } }));
    await expectFailed(fetchImpl, "SOURCE_SIZE_LIMIT");
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
  it("invalid UTF-8 is rejected without schema substitution", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xfe]), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expectFailed(fetchImpl, "SOURCE_FAILED");
  });
  it("one total deadline covers a response body that stalls after headers", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body, { headers: { "content-type": "application/json" } }));
    const source = await fetchPublicMonitoringStationsSource(MONITORING_INPUT, {
      fetchImpl,
      now: () => NOW,
      totalTimeoutMs: 60,
    });
    expect(source).toMatchObject({
      status: "timeout",
      payload: null,
      payloadSha256: null,
      coverage: { returnedCount: null },
    });
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
  it("one total deadline also covers fetch before headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const source = await fetchPublicMonitoringStationsSource(MONITORING_INPUT, {
      fetchImpl,
      now: () => NOW,
      totalTimeoutMs: 60,
    });
    expect(source.status).toBe("timeout");
    expect(source.payload).toBeNull();
  });
  it.each([
    { name: "bad date", input: { ...MONITORING_INPUT, dateFrom: "2025-02-30" }, options: {} },
    {
      name: "reversed period",
      input: { ...MONITORING_INPUT, dateFrom: "2025-11-01" },
      options: {},
    },
    {
      name: "polygon hash mismatch",
      input: { ...MONITORING_INPUT, geometrySha256: "0".repeat(64) },
      options: {},
    },
    {
      name: "invalid polygon",
      input: { ...MONITORING_INPUT, polygon: { type: "Polygon" as const, coordinates: [] } },
      options: {},
    },
    {
      name: "widened deadline",
      input: MONITORING_INPUT,
      options: { totalTimeoutMs: MAX_MONITORING_TIMEOUT_MS + 1 },
    },
    { name: "invalid fetched time", input: MONITORING_INPUT, options: { now: () => "not-a-date" } },
  ])("$name rejects before upstream network", async ({ input, options }) => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchPublicMonitoringStationsSource(input, { fetchImpl, now: () => NOW, ...options }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("URL helper has no caller host/layer and rejects malformed bbox/paging", () => {
    expect(
      new URL(buildPublicMonitoringStationsUrl(MONITORING_NATIVE_BBOX, 0)).searchParams.get(
        "count",
      ),
    ).toBe(String(MONITORING_PAGE_COUNT));
    for (const bbox of [
      [0, 0, 1, 1],
      [515756, 6132196, 515756, 6136401],
      [NaN, 6132196, 517345, 6136401],
    ])
      expect(() => buildPublicMonitoringStationsUrl(bbox, 0)).toThrow();
    for (const start of [-1, 0.5, 100])
      expect(() => buildPublicMonitoringStationsUrl(MONITORING_NATIVE_BBOX, start)).toThrow();
    expect(() => buildPublicMonitoringStationsUrl(MONITORING_NATIVE_BBOX, 0, 51)).toThrow();
  });
});
