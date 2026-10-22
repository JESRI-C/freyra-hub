import { z } from "zod";
import { booleanIntersects, booleanValid, feature, polygon } from "@turf/turf";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { PublicBaselineSource } from "./public-baseline-types";
import { baselineSha256 } from "./public-baseline-service";
import { bytesSha256, PublicReadError, readPublicBytes } from "./bounded-public-read.server";

/** Current official GEUS service and polygon layer, verified 22 October 2026. */
export const SOIL_TYPE_LAYER =
  "https://data.geus.dk/arcgis/rest/services/Denmark/Jordartskort_25000/MapServer/1";
const Position = z.tuple([z.number().finite().min(7).max(16), z.number().finite().min(54).max(58)]);
const Ring = z
  .array(Position)
  .min(4)
  .max(10_000)
  .refine((r) => r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1]);
// Real official polygons can have more than 200 holes. Byte and total vertex caps remain unchanged.
const PolygonCoordinates = z.array(Ring).min(1).max(1_000);
const Geometry = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: PolygonCoordinates }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(PolygonCoordinates).min(1).max(200),
  }),
]);
const Text = z.string().trim().max(255);
const Page = z.object({
  type: z.literal("FeatureCollection"),
  // RFC 7946 / outSR 4326. A conflicting legacy CRS cannot silently change axis order.
  crs: z
    .object({
      type: z.literal("name"),
      properties: z.object({ name: z.literal("urn:ogc:def:crs:OGC:1.3:CRS84") }),
    })
    .optional(),
  features: z
    .array(
      z.object({
        type: z.literal("Feature"),
        id: z.number().int(),
        geometry: Geometry,
        properties: z.object({
          OBJECTID: z.number().int(),
          jsym1: Text,
          jsym2: Text,
          tsym: Text,
          Jordart: Text,
          Tidsalder: Text,
          Version: Text,
        }),
      }),
    )
    .max(200),
  exceededTransferLimit: z.boolean().optional(),
  properties: z.object({ exceededTransferLimit: z.boolean().optional() }).optional(),
});

export async function fetchSoilTypeSource(
  input: { polygon: GeoJSONPolygon; dateFrom: string; dateTo: string; geometrySha256?: string },
  options: { fetchImpl?: typeof fetch; now?: () => string } = {},
): Promise<PublicBaselineSource> {
  const geometrySha256 = await baselineSha256(input.polygon);
  if (input.geometrySha256 && input.geometrySha256 !== geometrySha256)
    throw new Error("Jordartskildens område matcher ikke sagen.");
  const positions = input.polygon.coordinates.flat();
  const bbox: [number, number, number, number] = [
    Math.min(...positions.map((p) => p[0])),
    Math.min(...positions.map((p) => p[1])),
    Math.max(...positions.map((p) => p[0])),
    Math.max(...positions.map((p) => p[1])),
  ];
  const source: PublicBaselineSource = {
    id: "soil-type",
    mode: "live",
    status: "partial",
    provider: "GEUS",
    dataset: "Danmarks Digitale Jordartskort 1:25.000",
    datasetVersion: null,
    licence: null,
    attribution: "GEUS · Lærke T. Andersen, Henrik J. Granat, Karen L. Anthonsen",
    sourceUrl: SOIL_TYPE_LAYER,
    sourceModifiedAt: null,
    fetchedAt: (options.now ?? (() => new Date().toISOString()))(),
    adapterVersion: "geus-jordart-arcgis/v2",
    query: { geometrySha256, bbox, requestedFrom: input.dateFrom, requestedTo: input.dateTo },
    coverage: {
      spatial: "unknown",
      temporal: "unknown",
      observedFrom: null,
      observedTo: null,
      paginationComplete: false,
      returnedCount: null,
    },
    quality: {
      evidenceKind: "official_registration",
      method: "bounded-geus-arcgis-geojson",
      warnings: [
        "Jordartskortet viser kortlagt overfladegeologi omkring en meters dybde. Det er ikke jordprøver fra projektet eller en måling på flyvedagen.",
        "Kortet dækker ikke alle landarealer. Modtagne polygoner dokumenterer ikke fuld lokal kortlægning; fravær er ukendt.",
        "Geometrien er generaliseret af GEUS-tjenesten med maksimal afvigelse 0,00001 grad og 7 decimaler. Bruges som kortkontekst, ikke opmåling eller beregnet kulstofeffekt.",
        "Tjenestens svar angiver ingen særskilt licens; vilkår for videre aflevering skal kontrolleres hos GEUS.",
      ],
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  try {
    const params = {
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      where: "1=1",
    };
    const countUrl = new URL(`${SOIL_TYPE_LAYER}/query`);
    countUrl.search = new URLSearchParams({
      ...params,
      f: "json",
      returnCountOnly: "true",
    }).toString();
    const countBytes = await readPublicBytes(countUrl, {
      fetchImpl: options.fetchImpl,
      maxBytes: 16_384,
      timeoutMs: 8_000,
      mediaType: "application/json",
    });
    const count = z
      .object({ count: z.number().int().nonnegative() })
      .parse(JSON.parse(new TextDecoder().decode(countBytes))).count;
    const url = new URL(`${SOIL_TYPE_LAYER}/query`);
    url.search = new URLSearchParams({
      ...params,
      f: "geojson",
      outSR: "4326",
      outFields: "OBJECTID,jsym1,jsym2,tsym,Jordart,Tidsalder,Version",
      returnGeometry: "true",
      resultRecordCount: "200",
      orderByFields: "OBJECTID",
      geometryPrecision: "7",
      maxAllowableOffset: "0.00001",
    }).toString();
    const bytes = await readPublicBytes(url, {
      fetchImpl: options.fetchImpl,
      maxBytes: 512 * 1024,
      timeoutMs: 8_000,
      mediaType: "application/geo+json",
    });
    const page = Page.parse(JSON.parse(new TextDecoder().decode(bytes)));
    if (
      page.features.length > count ||
      new Set(page.features.map((f) => f.id)).size !== page.features.length ||
      page.features.some((f) => f.id !== f.properties.OBJECTID)
    )
      throw new PublicReadError("INVALID_COUNTS");
    const vertices = page.features.reduce(
      (total, f) =>
        total +
        (f.geometry.type === "Polygon"
          ? f.geometry.coordinates
          : f.geometry.coordinates.flat()
        ).reduce((count, ring) => count + ring.length, 0),
      0,
    );
    if (vertices > 24_000) throw new PublicReadError("GEOMETRY_LIMIT");
    for (const f of page.features)
      if (!booleanValid(feature(f.geometry))) throw new PublicReadError("INVALID_GEOMETRY");
    const complete =
      page.features.length === count &&
      !page.exceededTransferLimit &&
      !page.properties?.exceededTransferLimit;
    const features = page.features
      .filter((f) => booleanIntersects(polygon(input.polygon.coordinates), feature(f.geometry)))
      .map((f) => ({
        id: f.id,
        soilCode: f.properties.jsym1,
        secondaryCode: f.properties.jsym2,
        ageCode: f.properties.tsym,
        soilType: f.properties.Jordart,
        age: f.properties.Tidsalder,
        version: f.properties.Version,
        geometry: f.geometry,
      }));
    const versions = [...new Set(features.map((f) => f.version).filter(Boolean))];
    source.datasetVersion = versions.length ? versions.join("; ") : null;
    source.coverage = {
      ...source.coverage,
      spatial: features.length ? "partial" : "unknown",
      paginationComplete: complete,
      returnedCount: features.length,
    };
    if (!complete)
      source.quality.warnings.push(
        "Kun et afgrænset udsnit af jordartspolygonerne er modtaget. Fuld registreringsdækning er ikke dokumenteret.",
      );
    const payload = {
      schema: "freyra.soil-type-polygons/v1",
      crs: "EPSG:4326",
      features,
      numberMatched: count,
      numberReturned: page.features.length,
      generalizationDegrees: 0.00001,
      coordinateDecimals: 7,
      responseSha256: await bytesSha256(bytes),
      countResponseSha256: await bytesSha256(countBytes),
      documentationUrl: SOIL_TYPE_LAYER,
    };
    source.payload = payload;
    source.payloadSha256 = await baselineSha256(payload);
    return source;
  } catch (error) {
    const code = error instanceof PublicReadError ? error.code : "INVALID_OR_UNAVAILABLE";
    return {
      ...source,
      mode: "error",
      status: code === "TIMEOUT" ? "timeout" : "failed",
      error: {
        code,
        message: "Jordartsgeometri kunne ikke hentes eller valideres. Dækning er ukendt.",
      },
    };
  }
}
