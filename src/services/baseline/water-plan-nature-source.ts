import { z } from "zod";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { RasterQueryProjection } from "@/services/baseline/raster-query-projection";

export const WATER_PLAN_NATURE_SCHEMA = "gofreyra.water-plan-nature-inventory/v1" as const;
export const WATER_PLAN_NATURE_ADAPTER = "water-plan-nature-inventory/v1" as const;
export const WATER_PLAN_NATURE_CRS = "urn:ogc:def:crs:EPSG::25832" as const;
export const MAX_NATURE_REQUESTS = 6;
export const MAX_NATURE_PAGES_PER_PRODUCT = 2;
export const NATURE_PAGE_COUNT = 50;
export const MAX_NATURE_FEATURES = 200;
export const MAX_NATURE_PAGE_BYTES = 1024 * 1024;
export const MAX_NATURE_TOTAL_BYTES = 2 * 1024 * 1024;
export const MAX_NATURE_TIMEOUT_MS = 20_000;
export const MAX_NATURE_GEOMETRY_POSITIONS = 50_000;
const MAX_FEATURE_POSITIONS = 10_000;
const AREALEDITERING_WFS = "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs";
const VP3_WFS = "https://wfs2-miljoegis.mim.dk/vp3_2endelig2025/ows";

export const WATER_PLAN_NATURE_PRODUCTS = [
  {
    id: "protected-nature",
    title: "Beskyttede naturtyper",
    endpoint: AREALEDITERING_WFS,
    layer: "dai:bes_naturtyper",
    geometryName: "Shape",
    sortKey: "Objekt_id",
    themeCode: 2013,
    datasetVersion: null,
    licence: "CC0 1.0",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.da",
    attribution: "Danmarks Miljøportal / Kommunerne",
    catalogueIds: ["urn:dmp:ds:beskyttede-naturtyper"],
  },
  {
    id: "protected-watercourses",
    title: "Beskyttede vandløb",
    endpoint: AREALEDITERING_WFS,
    layer: "dai:bes_vandloeb",
    geometryName: "Shape",
    sortKey: "Objekt_id",
    themeCode: 2014,
    datasetVersion: null,
    licence: "CC0 1.0",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.da",
    attribution: "Danmarks Miljøportal / Kommunerne",
    catalogueIds: ["urn:dmp:ds:beskyttede-vandloeb"],
  },
  {
    id: "vp3-watercourses",
    title: "VP3G: Vandløbsafgrænsning, miljømål og tilstandsvurdering",
    endpoint: VP3_WFS,
    layer: "vp3_2endelig2025:vp3_2e2025_vandloeb_samlet",
    geometryName: "wkb_geometry",
    sortKey: "ov_id",
    themeCode: null,
    datasetVersion: "vp3_2endelig2025",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/deed.da",
    attribution: "Styrelsen for Grøn Arealomlægning og Vandmiljø (SGAV)",
    catalogueIds: [
      "urn:dmp:ds:vp3g-afgraensning-vandloeb",
      "urn:dmp:ds:vp3g-miljoemaal-samlet-oekologisk-tilstand-eller-potentiale-vandloeb",
      "urn:dmp:ds:vp3g-miljoemaal-kemisk-tilstand-vandloeb",
      "urn:dmp:ds:vp3g-tilstandsvurdering-samlet-oekologisk-tilstand-eller-potentiale-vandloeb",
      "urn:dmp:ds:vp3g-tilstandsvurdering-kemisk-tilstand-vandloeb",
    ],
  },
] as const;
export type WaterPlanNatureProduct = (typeof WATER_PLAN_NATURE_PRODUCTS)[number];
export type WaterPlanNatureProductId = WaterPlanNatureProduct["id"];
export interface WaterPlanNatureInput {
  polygon: GeoJSONPolygon;
  dateFrom: string;
  dateTo: string;
  geometrySha256?: string;
}
export class WaterPlanNatureError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WaterPlanNatureError";
  }
}
export type NativePosition = [number, number];
export type NativeGeometry =
  | { type: "Polygon"; coordinates: NativePosition[][] }
  | { type: "MultiPolygon"; coordinates: NativePosition[][][] }
  | { type: "LineString"; coordinates: NativePosition[] }
  | { type: "MultiLineString"; coordinates: NativePosition[][] };
interface CandidateBase {
  featureId: string;
  nativeGeometry: NativeGeometry;
  geometryCrs: "EPSG:25832";
  nativeBBox: [number, number, number, number];
  positionCount: number;
}
export interface RegistrationCandidate extends CandidateBase {
  kind: "protected-nature" | "protected-watercourses";
  objectId: string;
  versionId: string;
  themeCode: number;
  themeName: string | null;
  status: {
    code: number | null;
    name: string | null;
    interpretation: "unknown" | "source_record_status";
    legalApproval: false;
  };
  rawDates: {
    registeredAt: string | null;
    systemValidFrom: string | null;
    systemValidTo: string | null;
  };
  natureType: { code: number | null; name: string | null } | null;
  inspection: {
    rawDate: string | null;
    reportedDate: string | null;
    status: "unknown" | "reported_date";
    newInspectionVerified: false;
  } | null;
  registryMaintenance: { status: string | null; rawDate: string | null } | null;
}
export interface WaterPlanCandidate extends CandidateBase {
  kind: "vp3-watercourses";
  waterbodyId: string;
  sourceName: string | null;
  sourceCategory: string | null;
  sourceDesignation: string | null;
  sourceTypology: string | null;
  planGoals: { ecological: string | null; chemical: string | null };
  assessedState: { ecological: string | null; chemical: string | null };
  assessmentDate: null;
  mappedToMunicipalReach: false;
}
export type WaterPlanNatureCandidate = RegistrationCandidate | WaterPlanCandidate;
export interface WaterPlanNaturePage {
  numberMatched: number;
  numberReturned: number;
  totalFeatures: number;
  serverTimestamp: string;
  candidates: WaterPlanNatureCandidate[];
  positionCount: number;
}
export interface WaterPlanNaturePayload {
  schema: typeof WATER_PLAN_NATURE_SCHEMA;
  wfsVersion: "2.0.0";
  inventoryOnly: true;
  legalAssessmentPerformed: false;
  metricsCalculated: false;
  municipalReachMapped: false;
  upstreamTransactionalSnapshot: false;
  queryProjection: RasterQueryProjection;
  geometrySha256: string;
  requestedPeriod: { from: string; to: string };
  products: {
    id: WaterPlanNatureProductId;
    layer: string;
    endpoint: string;
    geometryName: string;
    sortKey: string;
    datasetVersion: string | null;
    versionBasis: "per_feature_registration_version" | "published_plan_release";
    planPublishedDate: "2025-12-18" | null;
    planEffectiveFrom: "2026-01-01" | null;
    licence: string;
    licenceUrl: string;
    attribution: string;
    catalogueIds: readonly string[];
    receivedInventoryComplete: true;
    pagingIsTransactionSafe: false;
    matchedCount: number;
    candidates: WaterPlanNatureCandidate[];
  }[];
  pages: {
    productId: WaterPlanNatureProductId;
    queryUrl: string;
    responseSha256: string;
    responseBytes: number;
    startIndex: number;
    requestedCount: number;
    sortKey: string;
    numberMatched: number;
    numberReturned: number;
    totalFeatures: number;
    serverTimestamp: string;
  }[];
}
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const NullableText = z.string().max(2000).nullable();
const NullableDate = z.string().datetime({ offset: true }).nullable();
const RegistrationProperties = z.object({
  Temakode: z.number().int(),
  Temanavn: NullableText,
  Objekt_id: Uuid,
  Version_id: Uuid,
  Systid_fra: NullableDate,
  Systid_til: NullableDate,
  Oprettet: NullableDate,
  Statuskode: z.number().int().nullable(),
  Status: NullableText,
});
const NatureProperties = RegistrationProperties.extend({
  Natyp_kode: z.number().int().nullable(),
  Natyp_navn: NullableText,
  Besig_dato: NullableDate,
  Vedligehold_status: NullableText,
  Vedligehold_tid: NullableDate,
});
const PlanProperties = z.object({
  ov_id: z.string().regex(/^DKRIVER[0-9A-Za-z_-]{1,60}$/),
  ov_navn: NullableText,
  ov_kat: NullableText,
  na_kun_stm: NullableText,
  ov_typ: NullableText,
  mal_oko_sm: NullableText,
  ov_mal_kem: NullableText,
  til_oko_sm: NullableText,
  ov_til_kem: NullableText,
});
const FeatureSchema = z
  .object({
    type: z.literal("Feature"),
    id: z.string().min(1).max(150),
    geometry: z.unknown(),
    geometry_name: z.string().min(1).max(30),
    properties: z.unknown(),
  })
  .strict();
const PageSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(FeatureSchema).max(NATURE_PAGE_COUNT),
    totalFeatures: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    numberMatched: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    numberReturned: z.number().int().nonnegative().max(NATURE_PAGE_COUNT),
    timeStamp: z.string().datetime({ offset: true }),
    crs: z
      .object({
        type: z.literal("name"),
        properties: z.object({ name: z.literal(WATER_PLAN_NATURE_CRS) }).strict(),
      })
      .strict(),
    // Returned links may use another front-door host. They are never followed or saved.
    links: z.array(z.unknown()).max(6).optional(),
  })
  .strict();

export function waterPlanNatureProduct(id: WaterPlanNatureProductId): WaterPlanNatureProduct {
  const product = WATER_PLAN_NATURE_PRODUCTS.find((item) => item.id === id);
  if (!product)
    throw new WaterPlanNatureError(
      "UNSUPPORTED_PRODUCT",
      "Natur- og vandplankilden er ikke tilladt.",
    );
  return product;
}
function validNativeBbox(bbox: readonly number[]): boolean {
  return (
    bbox.length === 4 &&
    bbox.every(Number.isFinite) &&
    bbox[0] < bbox[2] &&
    bbox[1] < bbox[3] &&
    bbox[0] >= 100_000 &&
    bbox[2] <= 1_100_000 &&
    bbox[1] >= 5_800_000 &&
    bbox[3] <= 6_600_000
  );
}
export function buildWaterPlanNatureUrl(
  productId: WaterPlanNatureProductId,
  bbox: [number, number, number, number],
  startIndex: number,
  count = NATURE_PAGE_COUNT,
): string {
  const product = waterPlanNatureProduct(productId);
  if (
    !validNativeBbox(bbox) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > NATURE_PAGE_COUNT ||
    !Number.isInteger(startIndex) ||
    startIndex < 0 ||
    startIndex % count !== 0 ||
    startIndex >= MAX_NATURE_PAGES_PER_PRODUCT * count
  )
    throw new WaterPlanNatureError("INVALID_QUERY", "Natur- og vandplanforespørgslen er ugyldig.");
  const url = new URL(product.endpoint);
  const params = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: product.layer,
    outputFormat: "application/json",
    srsName: WATER_PLAN_NATURE_CRS,
    bbox: `${bbox.join(",")},${WATER_PLAN_NATURE_CRS}`,
    count: String(count),
    startIndex: String(startIndex),
    sortBy: product.sortKey,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function nativeGeometry(
  raw: unknown,
  nature: boolean,
  queryBbox: [number, number, number, number],
  budget: { remaining: number },
) {
  const geometry = z
    .object({
      type: z.enum(["Polygon", "MultiPolygon", "LineString", "MultiLineString"]),
      coordinates: z.unknown(),
    })
    .strict()
    .safeParse(raw);
  if (!geometry.success || nature !== ["Polygon", "MultiPolygon"].includes(geometry.data.type))
    throw new WaterPlanNatureError(
      "INVALID_GEOMETRY",
      "Natur- og vandplankilden har en ugyldig geometritype.",
    );
  let positionCount = 0;
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const position = (value: unknown): NativePosition => {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      !value.every(Number.isFinite) ||
      value[0] < 100_000 ||
      value[0] > 1_100_000 ||
      value[1] < 5_800_000 ||
      value[1] > 6_600_000
    )
      throw new WaterPlanNatureError(
        "INVALID_GEOMETRY",
        "Natur- og vandplankildens koordinater er ugyldige.",
      );
    if (++positionCount > MAX_FEATURE_POSITIONS || --budget.remaining < 0)
      throw new WaterPlanNatureError(
        "GEOMETRY_LIMIT",
        "Natur- og vandplankildens geometri overskrider punktgrænsen.",
      );
    bbox[0] = Math.min(bbox[0], value[0]);
    bbox[1] = Math.min(bbox[1], value[1]);
    bbox[2] = Math.max(bbox[2], value[0]);
    bbox[3] = Math.max(bbox[3], value[1]);
    return [value[0], value[1]];
  };
  const line = (value: unknown, ring: boolean): NativePosition[] => {
    if (
      !Array.isArray(value) ||
      value.length < (ring ? 4 : 2) ||
      value.length > MAX_FEATURE_POSITIONS
    )
      throw new WaterPlanNatureError(
        "INVALID_GEOMETRY",
        "Natur- og vandplankildens koordinatliste er ugyldig.",
      );
    const points = value.map(position);
    if (ring && (points[0][0] !== points.at(-1)![0] || points[0][1] !== points.at(-1)![1]))
      throw new WaterPlanNatureError(
        "INVALID_GEOMETRY",
        "Natur- og vandplankildens polygonring er ikke lukket.",
      );
    return points;
  };
  const array = <T>(value: unknown, transform: (item: unknown) => T): T[] => {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FEATURE_POSITIONS)
      throw new WaterPlanNatureError(
        "INVALID_GEOMETRY",
        "Natur- og vandplankildens geometri er tom eller for stor.",
      );
    return value.map(transform);
  };
  let result: NativeGeometry;
  switch (geometry.data.type) {
    case "Polygon":
      result = {
        type: "Polygon",
        coordinates: array(geometry.data.coordinates, (item) => line(item, true)),
      };
      break;
    case "MultiPolygon":
      result = {
        type: "MultiPolygon",
        coordinates: array(geometry.data.coordinates, (item) =>
          array(item, (ring) => line(ring, true)),
        ),
      };
      break;
    case "LineString":
      result = { type: "LineString", coordinates: line(geometry.data.coordinates, false) };
      break;
    case "MultiLineString":
      result = {
        type: "MultiLineString",
        coordinates: array(geometry.data.coordinates, (item) => line(item, false)),
      };
      break;
  }
  if (
    bbox[2] < queryBbox[0] ||
    bbox[0] > queryBbox[2] ||
    bbox[3] < queryBbox[1] ||
    bbox[1] > queryBbox[3]
  )
    throw new WaterPlanNatureError(
      "OUTSIDE_QUERY",
      "Natur- og vandplankilden returnerede geometri uden for forespørgslen.",
    );
  return {
    nativeGeometry: result,
    nativeBBox: bbox,
    positionCount,
    geometryCrs: "EPSG:25832" as const,
  };
}

/** Only the observed native WFS DTO is accepted; unnecessary source attributes are stripped. */
export function parseWaterPlanNaturePage(
  raw: unknown,
  productId: WaterPlanNatureProductId,
  bbox: [number, number, number, number],
  startIndex: number,
  count = NATURE_PAGE_COUNT,
  remainingPositions = MAX_NATURE_GEOMETRY_POSITIONS,
): WaterPlanNaturePage {
  buildWaterPlanNatureUrl(productId, bbox, startIndex, count);
  if (
    !Number.isInteger(remainingPositions) ||
    remainingPositions < 0 ||
    remainingPositions > MAX_NATURE_GEOMETRY_POSITIONS
  )
    throw new WaterPlanNatureError(
      "INVALID_QUERY",
      "Natur- og vandplankildens punktbudget er ugyldigt.",
    );
  const parsed = PageSchema.safeParse(raw);
  if (!parsed.success)
    throw new WaterPlanNatureError(
      "INVALID_SCHEMA",
      "Natur- og vandplankildens svar matcher ikke det verificerede format.",
    );
  const page = parsed.data;
  if (
    page.totalFeatures !== page.numberMatched ||
    page.numberReturned !== page.features.length ||
    page.numberReturned !== Math.max(0, Math.min(count, page.numberMatched - startIndex))
  )
    throw new WaterPlanNatureError(
      "INVALID_COUNTS",
      "Natur- og vandplankildens antal eller sidetal er ufuldstændige.",
    );
  if (page.numberMatched > MAX_NATURE_PAGES_PER_PRODUCT * count)
    throw new WaterPlanNatureError(
      "FEATURE_LIMIT",
      "Natur- og vandplankilden kræver flere data end den afgrænsede inventargrænse.",
    );
  const product = waterPlanNatureProduct(productId);
  const ids = new Set<string>();
  const objectIds = new Set<string>();
  const budget = { remaining: remainingPositions };
  const candidates: WaterPlanNatureCandidate[] = page.features.map((feature) => {
    if (feature.geometry_name !== product.geometryName || ids.has(feature.id))
      throw new WaterPlanNatureError(
        "CONFLICTING_ID",
        "Natur- og vandplankilden gentog et ID eller skiftede geometrifelt.",
      );
    ids.add(feature.id);
    const geometry = nativeGeometry(
      feature.geometry,
      productId === "protected-nature",
      bbox,
      budget,
    );
    if (productId === "vp3-watercourses") {
      const result = PlanProperties.safeParse(feature.properties);
      if (!result.success || !/^vp3_2e2025_vandloeb_samlet\.\d+$/.test(feature.id))
        throw new WaterPlanNatureError(
          "INVALID_FEATURE",
          "Vandplanobjektet matcher ikke det verificerede format.",
        );
      const props = result.data;
      if (objectIds.has(props.ov_id))
        throw new WaterPlanNatureError("CONFLICTING_ID", "Vandplankilden gentog et vandområde-ID.");
      objectIds.add(props.ov_id);
      return {
        ...geometry,
        featureId: feature.id,
        kind: "vp3-watercourses",
        waterbodyId: props.ov_id,
        sourceName: props.ov_navn,
        sourceCategory: props.ov_kat,
        sourceDesignation: props.na_kun_stm,
        sourceTypology: props.ov_typ,
        planGoals: { ecological: props.mal_oko_sm, chemical: props.ov_mal_kem },
        assessedState: { ecological: props.til_oko_sm, chemical: props.ov_til_kem },
        assessmentDate: null,
        mappedToMunicipalReach: false,
      };
    }
    const result = (
      productId === "protected-nature" ? NatureProperties : RegistrationProperties
    ).safeParse(feature.properties);
    if (!result.success)
      throw new WaterPlanNatureError(
        "INVALID_FEATURE",
        "Naturregistreringen matcher ikke det verificerede format.",
      );
    const props = result.data;
    const objectId = props.Objekt_id.toLowerCase(),
      versionId = props.Version_id.toLowerCase();
    const prefix = productId === "protected-nature" ? "bes_naturtyper" : "bes_vandloeb";
    if (
      props.Temakode !== product.themeCode ||
      feature.id !== `${prefix}.${versionId}` ||
      objectIds.has(objectId)
    )
      throw new WaterPlanNatureError(
        "CONFLICTING_ID",
        "Naturregistreringens lag, objekt eller version er inkonsistent.",
      );
    objectIds.add(objectId);
    const nature =
      productId === "protected-nature" ? NatureProperties.parse(feature.properties) : null;
    const inspectionUnknown = !nature?.Besig_dato || Date.parse(nature.Besig_dato) === 0;
    return {
      ...geometry,
      featureId: feature.id,
      kind: productId,
      objectId,
      versionId,
      themeCode: props.Temakode,
      themeName: props.Temanavn,
      status: {
        code: props.Statuskode,
        name: props.Status,
        interpretation:
          props.Statuskode === null ||
          props.Statuskode === 0 ||
          props.Status === null ||
          props.Status.trim().toLowerCase() === "ukendt"
            ? "unknown"
            : "source_record_status",
        legalApproval: false,
      },
      rawDates: {
        registeredAt: props.Oprettet,
        systemValidFrom: props.Systid_fra,
        systemValidTo: props.Systid_til,
      },
      natureType: nature ? { code: nature.Natyp_kode, name: nature.Natyp_navn } : null,
      inspection: nature
        ? {
            rawDate: nature.Besig_dato,
            reportedDate: inspectionUnknown ? null : nature.Besig_dato,
            status: inspectionUnknown ? "unknown" : "reported_date",
            newInspectionVerified: false,
          }
        : null,
      registryMaintenance: nature
        ? { status: nature.Vedligehold_status, rawDate: nature.Vedligehold_tid }
        : null,
    };
  });
  return {
    numberMatched: page.numberMatched,
    numberReturned: page.numberReturned,
    totalFeatures: page.totalFeatures,
    serverTimestamp: page.timeStamp,
    candidates,
    positionCount: remainingPositions - budget.remaining,
  };
}
