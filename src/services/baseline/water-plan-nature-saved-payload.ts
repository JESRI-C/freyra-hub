import { z } from "zod";
import type { PublicBaselineSource } from "./public-baseline-types";
import {
  WATER_PLAN_NATURE_ADAPTER,
  WATER_PLAN_NATURE_SCHEMA,
  WATER_PLAN_NATURE_CRS,
  WATER_PLAN_NATURE_PRODUCTS,
  MAX_NATURE_FEATURES,
  MAX_NATURE_REQUESTS,
  MAX_NATURE_PAGES_PER_PRODUCT,
  MAX_NATURE_PAGE_BYTES,
  MAX_NATURE_TOTAL_BYTES,
  MAX_NATURE_GEOMETRY_POSITIONS,
  NATURE_PAGE_COUNT,
  buildWaterPlanNatureUrl,
  parseWaterPlanNaturePage,
  type WaterPlanNaturePayload,
  type WaterPlanNatureCandidate,
} from "./water-plan-nature-source";

const Timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)));
const NullableText = z.string().max(2000).nullable();
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Uuid = z.string().uuid();
const NativeBbox = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(
    ([minX, minY, maxX, maxY]) =>
      minX >= 100_000 &&
      maxX <= 1_100_000 &&
      minY >= 5_800_000 &&
      maxY <= 6_600_000 &&
      minX <= maxX &&
      minY <= maxY,
  );
const CandidateBase = {
  featureId: z.string().min(1).max(150),
  nativeGeometry: z.unknown(),
  geometryCrs: z.literal("EPSG:25832"),
  nativeBBox: NativeBbox,
  positionCount: z.number().int().min(2).max(10_000),
};
const Registration = {
  ...CandidateBase,
  objectId: Uuid,
  versionId: Uuid,
  themeCode: z.number().int(),
  themeName: NullableText,
  status: z
    .object({
      code: z.number().int().nullable(),
      name: NullableText,
      interpretation: z.enum(["unknown", "source_record_status"]),
      legalApproval: z.literal(false),
    })
    .strict(),
  rawDates: z
    .object({
      registeredAt: Timestamp.nullable(),
      systemValidFrom: Timestamp.nullable(),
      systemValidTo: Timestamp.nullable(),
    })
    .strict(),
};
const Candidate = z.discriminatedUnion("kind", [
  z
    .object({
      ...Registration,
      kind: z.literal("protected-nature"),
      natureType: z.object({ code: z.number().int().nullable(), name: NullableText }).strict(),
      inspection: z
        .object({
          rawDate: Timestamp.nullable(),
          reportedDate: Timestamp.nullable(),
          status: z.enum(["unknown", "reported_date"]),
          newInspectionVerified: z.literal(false),
        })
        .strict(),
      registryMaintenance: z
        .object({ status: NullableText, rawDate: Timestamp.nullable() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...Registration,
      kind: z.literal("protected-watercourses"),
      natureType: z.null(),
      inspection: z.null(),
      registryMaintenance: z.null(),
    })
    .strict(),
  z
    .object({
      ...CandidateBase,
      kind: z.literal("vp3-watercourses"),
      waterbodyId: z.string().regex(/^DKRIVER[0-9A-Za-z_-]{1,60}$/),
      sourceName: NullableText,
      sourceCategory: NullableText,
      sourceDesignation: NullableText,
      sourceTypology: NullableText,
      planGoals: z.object({ ecological: NullableText, chemical: NullableText }).strict(),
      assessedState: z.object({ ecological: NullableText, chemical: NullableText }).strict(),
      assessmentDate: z.null(),
      mappedToMunicipalReach: z.literal(false),
    })
    .strict(),
]);
const ProductId = z.enum(["protected-nature", "protected-watercourses", "vp3-watercourses"]);
const SavedInventory = z
  .object({
    schema: z.literal(WATER_PLAN_NATURE_SCHEMA),
    wfsVersion: z.literal("2.0.0"),
    inventoryOnly: z.literal(true),
    legalAssessmentPerformed: z.literal(false),
    metricsCalculated: z.literal(false),
    municipalReachMapped: z.literal(false),
    upstreamTransactionalSnapshot: z.literal(false),
    queryProjection: z
      .object({
        sourceCrs: z.literal("EPSG:4326"),
        sourceAxisOrder: z.literal("lng-lat"),
        queryCrs: z.literal("EPSG:25832"),
        queryAxisOrder: z.literal("easting-northing"),
        bbox: NativeBbox.refine(
          (bbox) => bbox.every(Number.isInteger) && bbox[0] < bbox[2] && bbox[1] < bbox[3],
        ),
        method: z.literal("proj4-grs80-catalog-envelope/v1"),
        edgeSampleStepDegrees: z.literal(0.01),
        projectedSampleCount: z.number().int().positive().max(20_000),
        queryBufferM: z.literal(25),
        bboxRounding: z.literal("outward-to-integer-metres"),
        datumAssumption: z.literal("wgs84-treated-as-etrs89-without-epoch-or-grid-shift"),
        surveyAccuracyVerified: z.literal(false),
        heightTransformed: z.literal(false),
      })
      .strict(),
    geometrySha256: Hash,
    requestedPeriod: z.object({ from: z.string(), to: z.string() }).strict(),
    products: z
      .array(
        z
          .object({
            id: ProductId,
            layer: z.string(),
            endpoint: z.string(),
            geometryName: z.string(),
            sortKey: z.string(),
            datasetVersion: z.string().nullable(),
            versionBasis: z.enum(["per_feature_registration_version", "published_plan_release"]),
            planPublishedDate: z.literal("2025-12-18").nullable(),
            planEffectiveFrom: z.literal("2026-01-01").nullable(),
            licence: z.string(),
            licenceUrl: z.string(),
            attribution: z.string(),
            catalogueIds: z.array(z.string()).max(5),
            receivedInventoryComplete: z.literal(true),
            pagingIsTransactionSafe: z.literal(false),
            matchedCount: z.number().int().nonnegative().max(100),
            candidates: z.array(Candidate).max(100),
          })
          .strict(),
      )
      .length(3),
    pages: z
      .array(
        z
          .object({
            productId: ProductId,
            queryUrl: z.string().url(),
            responseSha256: Hash,
            responseBytes: z.number().int().positive().max(MAX_NATURE_PAGE_BYTES),
            startIndex: z.number().int().nonnegative(),
            requestedCount: z.number().int().positive().max(NATURE_PAGE_COUNT),
            sortKey: z.string(),
            numberMatched: z.number().int().nonnegative().max(100),
            numberReturned: z.number().int().nonnegative().max(NATURE_PAGE_COUNT),
            totalFeatures: z.number().int().nonnegative().max(100),
            serverTimestamp: Timestamp,
          })
          .strict(),
      )
      .min(3)
      .max(MAX_NATURE_REQUESTS),
  })
  .strict();

function validDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}
function sameJson(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  };
  return canonical(a) === canonical(b);
}
function sourceFeature(candidate: WaterPlanNatureCandidate, geometryName: string) {
  const properties =
    candidate.kind === "vp3-watercourses"
      ? {
          ov_id: candidate.waterbodyId,
          ov_navn: candidate.sourceName,
          ov_kat: candidate.sourceCategory,
          na_kun_stm: candidate.sourceDesignation,
          ov_typ: candidate.sourceTypology,
          mal_oko_sm: candidate.planGoals.ecological,
          ov_mal_kem: candidate.planGoals.chemical,
          til_oko_sm: candidate.assessedState.ecological,
          ov_til_kem: candidate.assessedState.chemical,
        }
      : {
          Temakode: candidate.themeCode,
          Temanavn: candidate.themeName,
          Objekt_id: candidate.objectId,
          Version_id: candidate.versionId,
          Systid_fra: candidate.rawDates.systemValidFrom,
          Systid_til: candidate.rawDates.systemValidTo,
          Oprettet: candidate.rawDates.registeredAt,
          Statuskode: candidate.status.code,
          Status: candidate.status.name,
          ...(candidate.kind === "protected-nature"
            ? {
                Natyp_kode: candidate.natureType!.code,
                Natyp_navn: candidate.natureType!.name,
                Besig_dato: candidate.inspection!.rawDate,
                Vedligehold_status: candidate.registryMaintenance!.status,
                Vedligehold_tid: candidate.registryMaintenance!.rawDate,
              }
            : {}),
        };
  return {
    type: "Feature",
    id: candidate.featureId,
    geometry: candidate.nativeGeometry,
    geometry_name: geometryName,
    properties,
  };
}

/** Browser-safe read validation only. No fetch, projection execution, or new source interpretation. */
export function parseSavedWaterPlanNatureSource(
  source: PublicBaselineSource,
): WaterPlanNaturePayload | null {
  const parsed = SavedInventory.safeParse(source.payload);
  if (!parsed.success) return null;
  const data = parsed.data as WaterPlanNaturePayload;
  if (
    source.id !== "water-plan-nature" ||
    source.provider !== "Danmarks Miljøportal / Kommunerne / SGAV" ||
    source.dataset !== "Naturregistreringer og VP3G-vandløbsafgrænsning, miljømål og tilstand" ||
    source.datasetVersion !== null ||
    source.licence !== "CC0 1.0 (natur); CC BY 4.0 (VP3G)" ||
    source.attribution !==
      "Danmarks Miljøportal / Kommunerne; Styrelsen for Grøn Arealomlægning og Vandmiljø (SGAV)" ||
    source.sourceUrl !== "https://datakatalog.miljoeportal.dk/api/swagger/index.html" ||
    source.sourceModifiedAt !== null ||
    source.adapterVersion !== WATER_PLAN_NATURE_ADAPTER ||
    source.mode !== "live" ||
    source.status !== "partial" ||
    source.error !== null ||
    source.quality.evidenceKind !== "official_registration" ||
    source.quality.method !== "bounded_native_wfs_received_inventory_only" ||
    !Timestamp.safeParse(source.fetchedAt).success ||
    !Hash.safeParse(source.payloadSha256).success ||
    source.coverage.spatial !== "unknown" ||
    source.coverage.temporal !== "unknown" ||
    source.coverage.observedFrom !== null ||
    source.coverage.observedTo !== null ||
    !source.coverage.paginationComplete ||
    data.geometrySha256 !== source.query.geometrySha256 ||
    data.requestedPeriod.from !== source.query.requestedFrom ||
    data.requestedPeriod.to !== source.query.requestedTo ||
    !validDate(data.requestedPeriod.from) ||
    !validDate(data.requestedPeriod.to) ||
    data.requestedPeriod.from > data.requestedPeriod.to ||
    data.pages.reduce((sum, page) => sum + page.responseBytes, 0) > MAX_NATURE_TOTAL_BYTES
  )
    return null;
  let receivedCount = 0;
  let receivedPositions = 0;
  let pageOffset = 0;
  const globalIds = new Set<string>();
  try {
    for (const [index, fixed] of WATER_PLAN_NATURE_PRODUCTS.entries()) {
      const product = data.products[index];
      const vp3 = fixed.id === "vp3-watercourses";
      if (
        product.id !== fixed.id ||
        product.layer !== fixed.layer ||
        product.endpoint !== fixed.endpoint ||
        product.geometryName !== fixed.geometryName ||
        product.sortKey !== fixed.sortKey ||
        product.datasetVersion !== fixed.datasetVersion ||
        product.licence !== fixed.licence ||
        product.licenceUrl !== fixed.licenceUrl ||
        product.attribution !== fixed.attribution ||
        !sameJson(product.catalogueIds, fixed.catalogueIds) ||
        product.versionBasis !==
          (vp3 ? "published_plan_release" : "per_feature_registration_version") ||
        product.planPublishedDate !== (vp3 ? "2025-12-18" : null) ||
        product.planEffectiveFrom !== (vp3 ? "2026-01-01" : null) ||
        product.matchedCount !== product.candidates.length
      )
        return null;
      const count = Math.min(NATURE_PAGE_COUNT, MAX_NATURE_FEATURES - receivedCount);
      const expectedPages = Math.max(1, Math.ceil(product.matchedCount / count));
      if (count < 1 || expectedPages > MAX_NATURE_PAGES_PER_PRODUCT) return null;
      const identities = new Set<string>();
      let previousIdentity: string | undefined;
      for (let pageIndex = 0; pageIndex < expectedPages; pageIndex++) {
        const page = data.pages[pageOffset++];
        if (!page) return null;
        const start = pageIndex * count;
        const candidates = product.candidates.slice(start, start + count);
        if (
          page.productId !== product.id ||
          page.startIndex !== start ||
          page.requestedCount !== count ||
          page.sortKey !== fixed.sortKey ||
          page.numberMatched !== product.matchedCount ||
          page.totalFeatures !== product.matchedCount ||
          page.numberReturned !== candidates.length ||
          page.queryUrl !==
            buildWaterPlanNatureUrl(fixed.id, data.queryProjection.bbox, start, count)
        )
          return null;
        // Replaying the verified pure DTO parser validates native coordinates, metadata,
        // epoch-zero/unknown dates and status semantics rather than trusting saved labels.
        const checked = parseWaterPlanNaturePage(
          {
            type: "FeatureCollection",
            features: candidates.map((candidate) => sourceFeature(candidate, fixed.geometryName)),
            totalFeatures: page.totalFeatures,
            numberMatched: page.numberMatched,
            numberReturned: page.numberReturned,
            timeStamp: page.serverTimestamp,
            crs: { type: "name", properties: { name: WATER_PLAN_NATURE_CRS } },
          },
          fixed.id,
          data.queryProjection.bbox,
          start,
          count,
          MAX_NATURE_GEOMETRY_POSITIONS - receivedPositions,
        );
        if (!sameJson(checked.candidates, candidates)) return null;
        receivedPositions += checked.positionCount;
        for (const candidate of candidates) {
          const identity =
            candidate.kind === "vp3-watercourses" ? candidate.waterbodyId : candidate.objectId;
          if (
            candidate.kind !== fixed.id ||
            globalIds.has(candidate.featureId) ||
            identities.has(identity) ||
            (previousIdentity !== undefined && previousIdentity >= identity)
          )
            return null;
          previousIdentity = identity;
          identities.add(identity);
          globalIds.add(candidate.featureId);
        }
      }
      receivedCount += product.candidates.length;
      if (receivedCount > MAX_NATURE_FEATURES) return null;
    }
    return pageOffset === data.pages.length && source.coverage.returnedCount === receivedCount
      ? data
      : null;
  } catch {
    return null;
  }
}
