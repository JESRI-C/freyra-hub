import { z } from "zod";
import { booleanIntersects, feature, polygon } from "@turf/turf";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { PublicBaselineSource } from "./public-baseline-types";
import { baselineSha256 } from "./public-baseline-service";
import { PublicReadError, readPublicBytes, bytesSha256 } from "./bounded-public-read.server";

/** Endpoint/type names verified against the official DMP catalogue on 22 October 2026. */
export const PLANTING_POLYGON_SOURCES = [
  {
    id: "planting-markblocks",
    title: "Markblokke 2026",
    provider: "Landbrugs- og Fiskeristyrelsen",
    endpoint: "https://geodata.fvm.dk/geoserver/ows",
    layer: "Markblokke:Markblokke_2026",
    catalogueId: "urn:dmp:ds:markblokke-2026",
    version: "2026-05-04",
    licence: "CC0 1.0",
    apiKey: false,
  },
  {
    id: "planting-lowland",
    title: "Kulstof 2022 (lavbundskort)",
    provider: "DCA / Aarhus Universitet via MiljøGIS",
    endpoint: "https://wfs2-miljoegis.mim.dk/natur/ows",
    layer: "natur:kulstof2022",
    catalogueId: "urn:dmp:ds:kulstof-2022-lavbundskort",
    version: "Kulstof2022",
    licence: null,
    apiKey: false,
  },
  {
    id: "planting-woodland",
    title: "Skove, GeoDanmark",
    provider: "GeoDanmark / Klimadatastyrelsen",
    endpoint: "https://wfs.datafordeler.dk/GEODKV/GEODKV_WFS/1.0.0/WFS",
    layer: "geodkv_v001:skov_current",
    catalogueId: "urn:dmp:ds:skove-geodanmark",
    version: null,
    licence: "Vilkår for anvendelse af GeoDanmark grunddata",
    apiKey: true,
  },
] as const;
export type PlantingPolygonSourceId = (typeof PLANTING_POLYGON_SOURCES)[number]["id"];
const Position = z.tuple([z.number().finite().min(7).max(16), z.number().finite().min(54).max(58)]);
const Ring = z
  .array(Position)
  .min(4)
  .max(10_000)
  .refine((r) => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]);
const PolygonCoordinates = z.array(Ring).min(1).max(200);
const Geometry = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: PolygonCoordinates }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(PolygonCoordinates).min(1).max(200),
  }),
]);
const Page = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z.object({
          type: z.literal("Feature"),
          id: z.union([z.string(), z.number()]),
          geometry: Geometry,
        }),
      )
      .max(200),
    numberMatched: z.number().int().nonnegative(),
    numberReturned: z.number().int().nonnegative().optional(),
    totalFeatures: z.number().int().nonnegative().optional(),
    crs: z
      .object({
        type: z.literal("name"),
        properties: z.object({
          name: z.enum(["urn:ogc:def:crs:CRS::84", "urn:ogc:def:crs:OGC:1.3:CRS84"]),
        }),
      })
      .nullable(),
  })
  .refine(
    // GeoServer returns crs:null for a verified empty result. No coordinates need interpreting.
    // Missing/unknown CRS with any feature or conflicting count must still fail closed.
    (page) =>
      page.crs !== null ||
      (page.features.length === 0 &&
        page.numberMatched === 0 &&
        page.numberReturned === 0 &&
        page.totalFeatures === 0),
  );

/** GeoDanmark returns optional finite Z values even with CRS84. This layer uses XY only. */
function woodlandPageIn2D(raw: unknown) {
  let discardedZ = false;
  const coordinate = z
    .tuple([
      z.number().finite().min(7).max(16),
      z.number().finite().min(54).max(58),
      z.number().finite().optional(),
    ])
    .transform(([x, y, height]): [number, number] => {
      if (height !== undefined) discardedZ = true;
      return [x, y];
    });
  const rings = z.array(z.array(coordinate).min(4).max(10_000)).min(1).max(200);
  const geometry = z.union([
    z.object({ type: z.literal("Polygon"), coordinates: rings }),
    z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(rings).min(1).max(200) }),
  ]);
  const normalized = z
    .object({
      features: z.array(z.object({ geometry }).passthrough()).max(200),
    })
    .passthrough()
    .parse(raw);
  return { normalized, discardedZ };
}

export async function fetchPlantingPolygonSource(
  id: PlantingPolygonSourceId,
  input: { polygon: GeoJSONPolygon; dateFrom: string; dateTo: string; geometrySha256?: string },
  options: { fetchImpl?: typeof fetch; now?: () => string } = {},
): Promise<PublicBaselineSource> {
  const config = PLANTING_POLYGON_SOURCES.find((s) => s.id === id)!;
  const geometrySha256 = await baselineSha256(input.polygon);
  if (input.geometrySha256 && geometrySha256 !== input.geometrySha256)
    throw new Error("Polygonkildens område matcher ikke sagen.");
  const positions = input.polygon.coordinates.flat();
  const bbox: [number, number, number, number] = [
    Math.min(...positions.map((p) => p[0])),
    Math.min(...positions.map((p) => p[1])),
    Math.max(...positions.map((p) => p[0])),
    Math.max(...positions.map((p) => p[1])),
  ];
  const source: PublicBaselineSource = {
    id,
    mode: "live",
    status: "partial",
    provider: config.provider,
    dataset: config.title,
    datasetVersion: config.version,
    licence: config.licence,
    attribution: config.provider,
    sourceUrl: config.endpoint,
    sourceModifiedAt: null,
    fetchedAt: (options.now ?? (() => new Date().toISOString()))(),
    adapterVersion: id === "planting-woodland" ? "planting-polygons-2d/v2" : "planting-polygons/v1",
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
      method: "bounded-wfs-polygon-inventory",
      warnings: [
        "Registergeometrier er offentlige kilder, ikke feltverificering. Kilden dokumenterer ikke automatisk tilstanden på flyvedagen.",
        ...(id === "planting-markblocks"
          ? [
              "Markblokke 2026 er registerudtrækket ved laglukning 4. maj 2026; ikke en juridisk ejendomsgrænse.",
            ]
          : []),
        ...(id === "planting-lowland"
          ? [
              "Kulstof2022 viser kortlagte jorder med 6–12 % og over 12 % kulstof; det er ikke en jordprøve eller en beregnet klimaeffekt.",
              "Kataloget angiver ingen særskilt licens. Vilkår skal afklares før videre aflevering.",
            ]
          : []),
        ...(id === "planting-woodland"
          ? [
              "GeoDanmark skov omfatter som udgangspunkt mindst 2.500 m² og visse administrativt udpegede mindre arealer. Enkelttræer og alle små træbælter er ikke dækket; trædækket skal fagligt kontrolleres.",
            ]
          : []),
      ],
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  try {
    const url = new URL(config.endpoint);
    url.search = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: config.layer,
      srsName: "urn:ogc:def:crs:OGC:1.3:CRS84",
      bbox: `${bbox.join(",")},urn:ogc:def:crs:OGC:1.3:CRS84`,
      count: "200",
      outputFormat: "application/json",
    }).toString();
    const apiKey = config.apiKey ? process.env.DATAFORDELER_API_KEY?.trim() : undefined;
    if (config.apiKey && !apiKey) throw new PublicReadError("NOT_CONFIGURED");
    if (apiKey) url.searchParams.set("apikey", apiKey);
    const bytes = await readPublicBytes(url, {
      fetchImpl: options.fetchImpl,
      maxBytes: 384 * 1024,
      mediaType: "application/json",
    });
    const text = new TextDecoder().decode(bytes);
    const raw: unknown = JSON.parse(text);
    if (apiKey && (text.includes(apiKey) || JSON.stringify(raw).includes(apiKey)))
      throw new PublicReadError("CREDENTIAL_ECHO");
    const { normalized, discardedZ } =
      id === "planting-woodland" ? woodlandPageIn2D(raw) : { normalized: raw, discardedZ: false };
    const page = Page.parse(normalized);
    if (discardedZ)
      source.quality.warnings.push(
        "GeoDanmark leverede finite tredjekoordinater (Z). Højden er eksplicit udeladt; skitsen bruger kun længde-/breddegrad, og der udledes ingen højder eller terræneffekter.",
      );
    if (
      page.numberMatched < page.features.length ||
      (page.numberReturned !== undefined && page.numberReturned !== page.features.length) ||
      new Set(page.features.map((f) => String(f.id))).size !== page.features.length
    )
      throw new PublicReadError("INVALID_COUNTS");
    let positionCount = 0;
    for (const f of page.features) {
      positionCount +=
        f.geometry.type === "Polygon"
          ? f.geometry.coordinates.flat().length
          : f.geometry.coordinates.flat(2).length;
    }
    if (positionCount > 24_000) throw new PublicReadError("GEOMETRY_LIMIT");
    // The upstream BBOX returns candidates, including polygons overlapping only the envelope.
    const candidates = page.features.filter((f) =>
      booleanIntersects(polygon(input.polygon.coordinates), feature(f.geometry)),
    );
    const complete = page.features.length === page.numberMatched;
    source.coverage = {
      ...source.coverage,
      spatial: complete && id !== "planting-woodland" ? "complete" : "partial",
      paginationComplete: complete,
      returnedCount: candidates.length,
    };
    if (!complete)
      source.quality.warnings.push(
        "Kildens antal overstiger det hentede udsnit. Manglende arealer må ikke fortolkes som fri plads til beplantning.",
      );
    source.payload = {
      schema: "freyra.planting-polygons/v1",
      crs: "EPSG:4326",
      geometries: candidates.map((f) => f.geometry),
      featureIds: candidates.map((f) => String(f.id)),
      responseSha256: await bytesSha256(bytes),
      catalogueUrl: `https://arealdata.miljoeportal.dk/datasets/${config.catalogueId}`,
      layer: config.layer,
      numberMatched: page.numberMatched,
      numberReturned: page.features.length,
      ...(discardedZ ? { coordinateHandling: "finite-z-omitted" } : {}),
    };
    source.payloadSha256 = await baselineSha256(source.payload);
    return source;
  } catch (error) {
    const code = error instanceof PublicReadError ? error.code : "INVALID_OR_UNAVAILABLE";
    return {
      ...source,
      mode: "error",
      status:
        code === "NOT_CONFIGURED" ? "not_configured" : code === "TIMEOUT" ? "timeout" : "failed",
      error: {
        code,
        message:
          code === "NOT_CONFIGURED"
            ? "Serveradgang til kortlaget mangler."
            : "Kortlaget kunne ikke hentes eller valideres. Dækning er ukendt.",
      },
    };
  }
}
