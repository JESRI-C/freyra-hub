import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { buildRasterQueryProjection } from "@/services/baseline/raster-query-projection";
import {
  buildWaterPlanNatureUrl,
  parseWaterPlanNaturePage,
  WATER_PLAN_NATURE_PRODUCTS,
  WATER_PLAN_NATURE_CRS,
  type WaterPlanNaturePayload,
  type WaterPlanNatureProductId,
} from "../water-plan-nature-source";
import { fetchWaterPlanNatureSource } from "../water-plan-nature-source.server";
import { ACTUAL_NATIVE_FEATURES } from "./water-plan-nature.fixtures";

const POLYGON: GeoJSONPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [9.25103, 55.33809],
      [9.27103, 55.33809],
      [9.27103, 55.37137],
      [9.25103, 55.37137],
      [9.25103, 55.33809],
    ],
  ],
};
const INPUT = { polygon: POLYGON, dateFrom: "2026-08-24", dateTo: "2026-09-07" };
const BBOX = buildRasterQueryProjection(POLYGON).bbox;
const TIMESTAMP = "2026-10-13T17:31:04.782Z";
interface FixtureFeature {
  type: "Feature";
  id: string;
  geometry: { type: string; coordinates: unknown };
  geometry_name: string;
  properties: Record<string, unknown>;
}
function fixtureFeature(productId: WaterPlanNatureProductId, index = 1): FixtureFeature {
  const product = WATER_PLAN_NATURE_PRODUCTS.find((p) => p.id === productId)!;
  const n = WATER_PLAN_NATURE_PRODUCTS.indexOf(product) + 1;
  const uuid = (prefix: number) =>
    `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const geometry =
    productId === "protected-nature"
      ? {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [516000, 6135000],
                [516100, 6135000],
                [516100, 6135100],
                [516000, 6135100],
                [516000, 6135000],
              ],
            ],
          ],
        }
      : {
          type: "MultiLineString",
          coordinates: [
            [
              [516000, 6135000],
              [516100, 6135100],
            ],
          ],
        };
  const registration = {
    Temakode: product.themeCode,
    Temanavn: product.title,
    Objekt_id: uuid(n),
    Version_id: uuid(n + 4),
    Systid_fra: TIMESTAMP,
    Systid_til: null,
    Oprettet: "2006-12-31T23:59:00Z",
    Statuskode: 3,
    Status: "Gældende / Vedtaget",
  };
  const properties =
    productId === "vp3-watercourses"
      ? {
          ov_id: `DKRIVER${String(index).padStart(6, "0")}`,
          ov_navn: "Uden navn",
          ov_kat: "Vandløb",
          na_kun_stm: "Naturlig",
          ov_typ: "RW2",
          mal_oko_sm: "God økologisk tilstand",
          til_oko_sm: "Dårlig økologisk tilstand",
          ov_mal_kem: "God kemisk tilstand",
          ov_til_kem: "God kemisk tilstand",
        }
      : productId === "protected-nature"
        ? {
            ...registration,
            Natyp_kode: 1,
            Natyp_navn: "Eng",
            Besig_dato: null,
            Vedligehold_status: null,
            Vedligehold_tid: null,
          }
        : registration;
  return {
    type: "Feature",
    id:
      productId === "vp3-watercourses"
        ? `vp3_2e2025_vandloeb_samlet.${index}`
        : `${productId === "protected-nature" ? "bes_naturtyper" : "bes_vandloeb"}.${uuid(n + 4)}`,
    geometry,
    geometry_name: product.geometryName,
    properties,
  };
}
function page(productId: WaterPlanNatureProductId, total = 1, start = 0, count = 50) {
  return {
    type: "FeatureCollection",
    totalFeatures: total,
    numberMatched: total,
    numberReturned: Math.max(0, Math.min(count, total - start)),
    timeStamp: TIMESTAMP,
    crs: { type: "name", properties: { name: WATER_PLAN_NATURE_CRS } },
    features: Array.from({ length: Math.max(0, Math.min(count, total - start)) }, (_, index) =>
      fixtureFeature(productId, start + index + 1),
    ),
  };
}
function jsonResponse(value: unknown, padding = 0) {
  return new Response(" ".repeat(padding) + JSON.stringify(value), {
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
}
function fixtureFetch(totals: Partial<Record<WaterPlanNatureProductId, number>> = {}) {
  return vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input));
    const product = WATER_PLAN_NATURE_PRODUCTS.find(
      (p) => p.layer === url.searchParams.get("typeNames"),
    )!;
    return jsonResponse(
      page(
        product.id,
        totals[product.id] ?? 1,
        Number(url.searchParams.get("startIndex")),
        Number(url.searchParams.get("count")),
      ),
    );
  });
}
const payloadOf = (source: Awaited<ReturnType<typeof fetchWaterPlanNatureSource>>) =>
  source.payload as unknown as WaterPlanNaturePayload;

describe("verified native nature and VP3G DTO", () => {
  it.each(WATER_PLAN_NATURE_PRODUCTS)(
    "keeps exact safe actual $id features/native coordinates",
    (product) => {
      const features = structuredClone(ACTUAL_NATIVE_FEATURES[product.id]);
      const value = { ...page(product.id, features.length), features };
      const result = parseWaterPlanNaturePage(value, product.id, BBOX, 0);
      expect(result.candidates).toHaveLength(features.length);
      expect(result.candidates[0].nativeGeometry).toEqual(features[0].geometry);
      expect(result.candidates[0]).toMatchObject({
        geometryCrs: "EPSG:25832",
        featureId: features[0].id,
      });
      expect(JSON.stringify(result)).not.toMatch(/Bruger_id|Sagsbeh|Journalnr|supportContact/);
      if (product.id === "protected-nature")
        expect(result.candidates[1]).toMatchObject({
          status: { code: 0, name: "Ukendt", interpretation: "unknown", legalApproval: false },
          inspection: {
            rawDate: "1970-01-01T00:00:00Z",
            reportedDate: null,
            status: "unknown",
            newInspectionVerified: false,
          },
        });
      if (product.id === "vp3-watercourses")
        expect(result.candidates[0]).toMatchObject({
          waterbodyId: "DKRIVER2580",
          sourceName: "Uden navn",
          planGoals: { ecological: "God økologisk tilstand", chemical: "God kemisk tilstand" },
          assessedState: {
            ecological: "Dårlig økologisk tilstand",
            chemical: "God kemisk tilstand",
          },
          assessmentDate: null,
          mappedToMunicipalReach: false,
        });
    },
  );
  it("strips arbitrary personal/contact/case attrs while preserving raw dates and unknown status", () => {
    const value = page("protected-nature");
    Object.assign(value.features[0].properties, {
      Bruger_id: "DO-NOT-PERSIST-USER",
      Sagsbeh: "DO-NOT-PERSIST-PERSON",
      Journalnr: "DO-NOT-PERSIST-CASE",
      Link: "https://example.invalid/private",
      arbitrary: { token: "DO-NOT-PERSIST-TOKEN" },
      Statuskode: 0,
      Status: "Ukendt",
      Besig_dato: "1970-01-01T00:00:00Z",
    });
    const result = parseWaterPlanNaturePage(value, "protected-nature", BBOX, 0);
    expect(JSON.stringify(result)).not.toContain("DO-NOT-PERSIST");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.candidates[0]).toMatchObject({
      status: { code: 0, name: "Ukendt", interpretation: "unknown" },
      inspection: { status: "unknown", reportedDate: null, rawDate: "1970-01-01T00:00:00Z" },
      rawDates: { registeredAt: "2006-12-31T23:59:00Z" },
    });
  });
  it("keeps a reported inspection date as source context without calling it a new verified inspection", () => {
    const value = page("protected-nature");
    value.features[0].properties.Besig_dato = "2025-05-02T00:00:00Z";
    expect(
      parseWaterPlanNaturePage(value, "protected-nature", BBOX, 0).candidates[0],
    ).toMatchObject({
      inspection: {
        rawDate: "2025-05-02T00:00:00Z",
        reportedDate: "2025-05-02T00:00:00Z",
        status: "reported_date",
        newInspectionVerified: false,
      },
    });
  });
  it("builds fixed native CRS/count/sort endpoints and never adds requested dates as observation filters", () => {
    for (const product of WATER_PLAN_NATURE_PRODUCTS) {
      const url = new URL(buildWaterPlanNatureUrl(product.id, BBOX, 50));
      expect(url.origin + url.pathname).toBe(product.endpoint);
      expect(url.searchParams.get("typeNames")).toBe(product.layer);
      expect(url.searchParams.get("srsName")).toBe(WATER_PLAN_NATURE_CRS);
      expect(url.searchParams.get("sortBy")).toBe(product.sortKey);
      expect(url.searchParams.get("bbox")).toBe(
        "515884,6132418,517217,6136177," + WATER_PLAN_NATURE_CRS,
      );
      expect(url.searchParams.has("dateFrom")).toBe(false);
      expect(url.searchParams.has("apiKey")).toBe(false);
    }
    expect(() => buildWaterPlanNatureUrl("unsupported" as never, BBOX, 0)).toThrow();
    expect(() => buildWaterPlanNatureUrl("protected-nature", BBOX, 100)).toThrow();
    expect(() => buildWaterPlanNatureUrl("protected-nature", [55, 9, 56, 10], 0)).toThrow();
  });
  it.each([
    "wrong-crs",
    "wrong-theme",
    "wrong-id",
    "missing-uuid",
    "wrong-geometry-name",
    "unknown-hits",
    "full-available-false",
    "missing-feature",
    "wrong-returned",
    "wrong-total",
    "invalid-timestamp",
    "extra-root-field",
    "invalid-source-date",
  ])("rejects %s as unavailable, never zero", (change) => {
    const value = page("protected-nature");
    if (change === "wrong-crs")
      Object.assign(value.crs.properties, { name: "urn:ogc:def:crs:CRS::84" });
    if (change === "wrong-theme") value.features[0].properties.Temakode = 2014;
    if (change === "wrong-id") value.features[0].id = "bes_vandloeb.fake";
    if (change === "missing-uuid") delete value.features[0].properties.Version_id;
    if (change === "wrong-geometry-name") value.features[0].geometry_name = "wrong";
    if (change === "unknown-hits") Object.assign(value, { numberMatched: "unknown" });
    if (change === "full-available-false") Object.assign(value, { fullAvailable: false });
    if (change === "missing-feature") value.features = [];
    if (change === "wrong-returned") value.numberReturned = 0;
    if (change === "wrong-total") value.totalFeatures = 2;
    if (change === "invalid-timestamp") value.timeStamp = "2026-02-30T00:00:00Z";
    if (change === "extra-root-field") Object.assign(value, { next: "https://example.invalid" });
    if (change === "invalid-source-date")
      value.features[0].properties.Oprettet = "2026-02-30T00:00:00Z";
    expect(() => parseWaterPlanNaturePage(value, "protected-nature", BBOX, 0)).toThrow();
  });
  it.each([
    "latlng-in-native",
    "height",
    "outside-bbox",
    "empty",
    "unclosed",
    "wrong-type",
    "point-budget",
  ])("bounds and rejects geometry %s", (change) => {
    const value = page("protected-nature");
    const geometry = value.features[0].geometry as { type: string; coordinates: number[][][][] };
    if (change === "latlng-in-native") geometry.coordinates[0][0][0] = [9.26, 55.36];
    if (change === "height") geometry.coordinates[0][0][0] = [516000, 6135000, 1];
    if (change === "outside-bbox")
      geometry.coordinates = [
        [
          [
            [600000, 6200000],
            [600100, 6200000],
            [600100, 6200100],
            [600000, 6200000],
          ],
        ],
      ];
    if (change === "empty") geometry.coordinates = [];
    if (change === "unclosed") geometry.coordinates[0][0].pop();
    if (change === "wrong-type") geometry.type = "MultiLineString";
    expect(() =>
      parseWaterPlanNaturePage(
        value,
        "protected-nature",
        BBOX,
        0,
        50,
        change === "point-budget" ? 4 : 50000,
      ),
    ).toThrow();
  });
  it("rejects two logical-object versions and duplicate feature IDs in a page", () => {
    const value = page("protected-nature", 2);
    value.features[1].properties.Objekt_id = value.features[0].properties.Objekt_id;
    expect(() => parseWaterPlanNaturePage(value, "protected-nature", BBOX, 0)).toThrow();
    value.features[1] = structuredClone(value.features[0]);
    expect(() => parseWaterPlanNaturePage(value, "protected-nature", BBOX, 0)).toThrow();
  });
});

describe("bounded source11 collection", () => {
  it("fits the actual larger synthetic QA area's observed82/4/3 hits without widening bounds", async () => {
    // Public13Oct2026 resultType=hits probes:82 nature,4 protected watercourses,
    // 3 VP3 waterbodies. Objects below are synthetic, not raw official features.
    const polygon: GeoJSONPolygon = {
      type: "Polygon",
      coordinates: [
        [
          [9.249033116, 55.336099018],
          [9.273036068, 55.336099018],
          [9.273036068, 55.373372295],
          [9.249033116, 55.373372295],
          [9.249033116, 55.336099018],
        ],
      ],
    };
    const fetchImpl = fixtureFetch({
      "protected-nature": 82,
      "protected-watercourses": 4,
      "vp3-watercourses": 3,
    });
    const source = await fetchWaterPlanNatureSource({ ...INPUT, polygon }, { fetchImpl });
    expect(source).toMatchObject({
      status: "partial",
      coverage: {
        returnedCount: 89,
        paginationComplete: true,
        spatial: "unknown",
        temporal: "unknown",
      },
    });
    expect(payloadOf(source).queryProjection.bbox).toEqual([515756, 6132196, 517345, 6136401]);
    expect(payloadOf(source).products.map((product) => product.matchedCount)).toEqual([82, 4, 3]);
    expect(payloadOf(source).pages.map((page) => page.numberReturned)).toEqual([50, 32, 4, 3]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
  it("receives64+4+3 in four page reads, with exact pagehashes, period and nontransactional partial provenance", async () => {
    const fetchImpl = fixtureFetch({
      "protected-nature": 64,
      "protected-watercourses": 4,
      "vp3-watercourses": 3,
    });
    const source = await fetchWaterPlanNatureSource(
      { ...INPUT, geometrySha256: await baselineSha256(POLYGON) },
      { fetchImpl, now: () => TIMESTAMP },
    );
    expect(source).toMatchObject({
      id: "water-plan-nature",
      mode: "live",
      status: "partial",
      error: null,
      sourceModifiedAt: null,
      coverage: {
        spatial: "unknown",
        temporal: "unknown",
        observedFrom: null,
        observedTo: null,
        paginationComplete: true,
        returnedCount: 71,
      },
    });
    expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
    const payload = payloadOf(source);
    expect(payload).toMatchObject({
      schema: "gofreyra.water-plan-nature-inventory/v1",
      metricsCalculated: false,
      legalAssessmentPerformed: false,
      upstreamTransactionalSnapshot: false,
      municipalReachMapped: false,
      requestedPeriod: { from: INPUT.dateFrom, to: INPUT.dateTo },
      geometrySha256: await baselineSha256(POLYGON),
    });
    expect(payload.products.map((p) => p.matchedCount)).toEqual([64, 4, 3]);
    expect(payload.products.every((p) => p.pagingIsTransactionSafe === false)).toBe(true);
    expect(payload.products[2]).toMatchObject({
      datasetVersion: "vp3_2endelig2025",
      planPublishedDate: "2025-12-18",
      planEffectiveFrom: "2026-01-01",
      licence: "CC BY 4.0",
    });
    expect(payload.products[0].licence).toBe("CC0 1.0");
    expect(payload.pages.map((p) => p.startIndex)).toEqual([0, 50, 0, 0]);
    expect(payload.pages[0].responseSha256).toBe(
      createHash("sha256")
        .update(JSON.stringify(page("protected-nature", 64)))
        .digest("hex"),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]?.redirect).toBe("manual");
      expect(call[1]?.credentials).toBe("omit");
      expect(call[1]?.headers).toEqual({ Accept: "application/json" });
    }
  });
  it("retains all-empty complete received inventories as partial/unknown, without legal zero inference", async () => {
    const source = await fetchWaterPlanNatureSource(INPUT, {
      fetchImpl: fixtureFetch({
        "protected-nature": 0,
        "protected-watercourses": 0,
        "vp3-watercourses": 0,
      }),
    });
    expect(source.status).toBe("partial");
    expect(source.coverage).toMatchObject({
      spatial: "unknown",
      temporal: "unknown",
      returnedCount: 0,
      paginationComplete: true,
    });
    expect(payloadOf(source).products.map((p) => p.candidates)).toEqual([[], [], []]);
    expect(payloadOf(source).legalAssessmentPerformed).toBe(false);
  });
  it("fits three51-record products within six requests and the combined200-feature ceiling", async () => {
    const fetchImpl = fixtureFetch({
      "protected-nature": 51,
      "protected-watercourses": 51,
      "vp3-watercourses": 51,
    });
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl });
    expect(source.status).toBe("partial");
    expect(source.coverage.returnedCount).toBe(153);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
  it("narrows the final request to the remaining global budget", async () => {
    const fetchImpl = fixtureFetch({
      "protected-nature": 100,
      "protected-watercourses": 75,
      "vp3-watercourses": 25,
    });
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl });
    expect(source.coverage.returnedCount).toBe(200);
    expect(source.status).toBe("partial");
    expect(new URL(String(fetchImpl.mock.calls.at(-1)![0])).searchParams.get("count")).toBe("25");
  });
  it.each(["per-product", "total", "fully-consumed"])(
    "fails closed on %s feature limit, never filling an unfetched product with0",
    async (kind) => {
      const totals =
        kind === "per-product"
          ? { "protected-nature": 101 }
          : kind === "total"
            ? { "protected-nature": 100, "protected-watercourses": 75, "vp3-watercourses": 26 }
            : { "protected-nature": 100, "protected-watercourses": 100, "vp3-watercourses": 0 };
      const fetchImpl = fixtureFetch(totals);
      const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl });
      expect(source).toMatchObject({
        status: "failed",
        payload: null,
        payloadSha256: null,
        coverage: { returnedCount: null, paginationComplete: false },
        error: { code: "FEATURE_LIMIT" },
      });
      if (kind === "fully-consumed") expect(fetchImpl).toHaveBeenCalledTimes(4);
    },
  );
  it.each([
    "changed-hits",
    "missing-page",
    "same-object-new-version",
    "same-feature",
    "changed-sort",
  ])("fails closed on %s between pages", async (change) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const start = Number(url.searchParams.get("startIndex"));
      const value = page(
        "protected-nature",
        change === "changed-hits" && start === 50 ? 65 : 64,
        start,
      );
      if (start === 50) {
        if (change === "missing-page") {
          value.features = [];
          value.numberReturned = 0;
        }
        if (change === "same-object-new-version")
          value.features[0].properties.Objekt_id =
            fixtureFeature("protected-nature").properties.Objekt_id;
        if (change === "same-feature") value.features[0] = fixtureFeature("protected-nature");
        if (change === "changed-sort")
          value.features[0].properties.Objekt_id = "00000000-0000-4000-8000-000000000001";
      }
      return jsonResponse(value);
    });
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl });
    expect(source.status).toBe("failed");
    expect(source.payload).toBeNull();
    expect(source.coverage.returnedCount).toBeNull();
    expect(source.error?.code).toBe(
      change === "changed-hits"
        ? "PAGINATION_CHANGED"
        : change === "missing-page"
          ? "INVALID_COUNTS"
          : change === "changed-sort"
            ? "SORT_CHANGED"
            : "CONFLICTING_ID",
    );
  });
  it("accepts changing per-page service timestamps without claiming a transactional snapshot", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const product = WATER_PLAN_NATURE_PRODUCTS.find(
        (p) => p.layer === url.searchParams.get("typeNames"),
      )!;
      const start = Number(url.searchParams.get("startIndex"));
      const value = page(product.id, product.id === "protected-nature" ? 64 : 0, start);
      if (start === 50) value.timeStamp = "2026-10-13T17:31:10.123Z";
      return jsonResponse(value);
    });
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl });
    expect(source.status).toBe("partial");
    expect(payloadOf(source).pages[1].serverTimestamp).toBe("2026-10-13T17:31:10.123Z");
    expect(payloadOf(source).upstreamTransactionalSnapshot).toBe(false);
  });
  it("bounds the combined geometry position budget before persisting", async () => {
    const value = page("protected-watercourses", 7);
    for (const feature of value.features)
      feature.geometry = {
        type: "LineString",
        coordinates: Array.from({ length: 8000 }, (_, index) => [516000 + (index % 100), 6135000]),
      };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        new URL(String(input)).searchParams.get("typeNames") === "dai:bes_naturtyper"
          ? jsonResponse(page("protected-nature", 0))
          : jsonResponse(value),
      );
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl });
    expect(source).toMatchObject({
      status: "failed",
      payload: null,
      error: { code: "GEOMETRY_LIMIT" },
    });
  });
  it.each(["text/html", "application/xml", "image/png"])(
    "rejects HTTP200 %s rather than successful empty data",
    async (contentType) => {
      const source = await fetchWaterPlanNatureSource(INPUT, {
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response("not public feature JSON", { headers: { "content-type": contentType } }),
          ),
      });
      expect(source).toMatchObject({
        status: "failed",
        payload: null,
        coverage: { returnedCount: null },
        error: { code: "SOURCE_HTTP_ERROR" },
      });
    },
  );
  it("rejects redirects and never follows arbitrary returned pagination links", async () => {
    const denied = await fetchWaterPlanNatureSource(INPUT, {
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("redirect", {
          status: 302,
          headers: { location: "https://example.invalid" },
        }),
      ),
    });
    expect(denied.payload).toBeNull();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const product = WATER_PLAN_NATURE_PRODUCTS.find(
        (p) => p.layer === url.searchParams.get("typeNames"),
      )!;
      const value = {
        ...page(product.id),
        links: [{ rel: "next", href: "https://example.invalid/private" }],
      };
      return jsonResponse(value);
    });
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl });
    expect(source.status).toBe("partial");
    expect(JSON.stringify(source)).not.toContain("example.invalid");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it.each(["header", "body", "total"])("enforces %s byte budgets", async (kind) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (kind === "header")
        return new Response("{}", {
          headers: { "content-type": "application/json", "content-length": "1048577" },
        });
      const product = WATER_PLAN_NATURE_PRODUCTS.find(
        (p) => p.layer === new URL(String(input)).searchParams.get("typeNames"),
      )!;
      return jsonResponse(page(product.id), kind === "body" ? 1048576 : 750 * 1024);
    });
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl });
    expect(source).toMatchObject({
      status: "failed",
      payload: null,
      error: { code: "SOURCE_SIZE_LIMIT" },
    });
  });
  it.each(["headers", "body"])("bounds stalled %s by the total deadline", async (phase) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() =>
      phase === "headers"
        ? new Promise<Response>(() => {})
        : Promise.resolve(
            new Response(new ReadableStream({ start() {} }), {
              headers: { "content-type": "application/json" },
            }),
          ),
    );
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl, totalTimeoutMs: 20 });
    expect(source).toMatchObject({
      status: "timeout",
      payload: null,
      error: { code: "SOURCE_TIMEOUT" },
    });
  });
  it("uses one shared deadline across requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const product = WATER_PLAN_NATURE_PRODUCTS.find(
        (p) => p.layer === new URL(String(input)).searchParams.get("typeNames"),
      )!;
      return jsonResponse(page(product.id));
    });
    const source = await fetchWaterPlanNatureSource(INPUT, { fetchImpl, totalTimeoutMs: 50 });
    expect(source.status).toBe("timeout");
    expect(source.payload).toBeNull();
    expect(fetchImpl.mock.calls.length).toBeLessThan(3);
  });
  it("does not expose arbitrary transport error details", async () => {
    const source = await fetchWaterPlanNatureSource(INPUT, {
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("PRIVATE-SYNTHETIC-TOKEN / person@example.invalid")),
    });
    expect(source.payload).toBeNull();
    expect(JSON.stringify(source)).not.toContain("PRIVATE-SYNTHETIC");
    expect(JSON.stringify(source)).not.toContain("person@example.invalid");
  });
  it("validates period/geometry/hash/deadline/time before any upstream request", async () => {
    const fetchImpl = fixtureFetch();
    for (const [input, options] of [
      [{ ...INPUT, dateFrom: "2026-02-30" }, {}],
      [{ ...INPUT, geometrySha256: "a".repeat(64) }, {}],
      [INPUT, { totalTimeoutMs: 20001 }],
      [INPUT, { now: () => "2026-02-30T00:00:00Z" }],
    ] as const)
      await expect(fetchWaterPlanNatureSource(input, { ...options, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
