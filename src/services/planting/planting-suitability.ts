import {
  area,
  booleanValid,
  buffer,
  difference,
  feature,
  featureCollection,
  intersect,
  union,
} from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";

export const PLANTING_METHOD = "freyra.planting-suitability/v1" as const;
export const PLANTING_NOTICE = "Skitse – kræver faglig validering";
export const REACH_IDS = ["A", "B", "C", "D", "E"] as const;
export type ReachId = (typeof REACH_IDS)[number];
export type Suitability = "egnet" | "betinget" | "uegnet";
export type PlantingCoverage = "complete" | "partial" | "unavailable";
export type PlantingPolygon = Polygon | MultiPolygon;
export type PlantingSourceId = "watercourse" | "section3" | "woodland" | "lowland" | "fields";

export interface PlantingSource {
  id: PlantingSourceId;
  label: string;
  coverage: PlantingCoverage;
  fetchedAt: string | null;
  sourceUrl: string | null;
  warnings: string[];
}

export interface PlantingLayer extends PlantingSource {
  geometries: PlantingPolygon[];
}

export interface PlantingInput {
  projectId: string;
  baselineId: string;
  baselineSha256: string;
  projectBoundary: PlantingPolygon;
  watercourse: PlantingSource & { geometry: LineString | MultiLineString | null };
  section3: PlantingLayer;
  woodland: PlantingLayer;
  lowland: PlantingLayer;
  fields: PlantingLayer;
  /** Municipality-confirmed boundaries, never inferred from photo positions or equal fifths. */
  reaches: { id: ReachId; geometry: PlantingPolygon; confirmed: boolean }[];
}

export interface PlantingProperties {
  id: string;
  bufferM: 10 | 20;
  suitability: Suitability;
  areaHa: number;
  fieldCandidate: boolean | null;
  carbonRichOrLowland: boolean | null;
  reasons: string[];
  notice: typeof PLANTING_NOTICE;
}

export interface PlantingReachSummary {
  reach: ReachId;
  bufferM: 10 | 20;
  status: "complete" | "unknown";
  suitableHa: number | null;
  conditionalHa: number | null;
  unsuitableHa: number | null;
  reason: string | null;
}

export interface PlantingResult {
  schema: typeof PLANTING_METHOD;
  notice: typeof PLANTING_NOTICE;
  projectId: string;
  baselineId: string;
  baselineSha256: string;
  status: "complete" | "partial" | "unavailable";
  sources: PlantingSource[];
  warnings: string[];
  features: FeatureCollection<PlantingPolygon, PlantingProperties>;
  reaches: PlantingReachSummary[];
  /** Geometry-derived sketch areas only; no local N/P/temperature/carbon effects are calculated. */
  localEffectsCalculated: false;
}

type Surface = Feature<PlantingPolygon> | null;

function overlap(left: Surface, right: Surface): Surface {
  return left && right ? intersect(featureCollection([left, right])) : null;
}

function subtract(left: Surface, right: Surface): Surface {
  return left && right ? difference(featureCollection([left, right])) : left;
}

function merge(geometries: PlantingPolygon[]): Surface {
  if (!geometries.length) return null;
  const features = geometries.map((geometry) => feature(geometry));
  return features.length === 1 ? features[0] : union(featureCollection(features));
}

function positions(value: unknown): number[][] {
  if (!Array.isArray(value)) throw new Error("Ugyldige koordinater");
  if (value.length === 2 && value.every((v) => typeof v === "number")) return [value];
  return value.flatMap(positions);
}

function validGeometry(geometry: PlantingPolygon | LineString | MultiLineString): boolean {
  try {
    const points = positions(geometry.coordinates);
    return (
      points.length > 1 &&
      points.length <= 50_000 &&
      points.every(
        ([lng, lat]) =>
          Number.isFinite(lng) &&
          Number.isFinite(lat) &&
          lng >= 7 &&
          lng <= 16 &&
          lat >= 54 &&
          lat <= 58,
      ) &&
      booleanValid(feature(geometry))
    );
  } catch {
    return false;
  }
}

/** Conservative screening rules: exclusions win; missing coverage can never make land suitable. */
export function classifyPlantingArea(input: {
  excluded: boolean;
  fieldCandidate: boolean | null;
  carbonRichOrLowland: boolean | null;
  allSourcesComplete: boolean;
}): Suitability {
  if (input.excluded || input.fieldCandidate === false) return "uegnet";
  if (
    !input.allSourcesComplete ||
    input.fieldCandidate !== true ||
    input.carbonRichOrLowland !== false
  )
    return "betinget";
  return "egnet";
}

function unknownReaches(reason: string): PlantingReachSummary[] {
  return REACH_IDS.flatMap((reach) =>
    ([10, 20] as const).map((bufferM) => ({
      reach,
      bufferM,
      status: "unknown" as const,
      suitableHa: null,
      conditionalHa: null,
      unsuitableHa: null,
      reason,
    })),
  );
}

/** Pure and deterministic: safe to freeze in a versioned report; never fetches or mutates sources. */
export function buildPlantingSuitability(input: PlantingInput): PlantingResult {
  const layers = [input.section3, input.woodland, input.lowland, input.fields];
  const sources = [input.watercourse, ...layers].map(
    ({ id, label, coverage, fetchedAt, sourceUrl, warnings }) => ({
      id,
      label,
      coverage,
      fetchedAt,
      sourceUrl,
      warnings: [...warnings],
    }),
  );
  const result: PlantingResult = {
    schema: PLANTING_METHOD,
    notice: PLANTING_NOTICE,
    projectId: input.projectId,
    baselineId: input.baselineId,
    baselineSha256: input.baselineSha256,
    status: "unavailable",
    sources,
    warnings: [],
    features: { type: "FeatureCollection", features: [] },
    reaches: unknownReaches("Godkendte delstrækningsgrænser A–E mangler."),
    localEffectsCalculated: false,
  };
  const allSourcesComplete = sources.every((source) => source.coverage === "complete");
  const missing = sources
    .filter((source) => source.coverage !== "complete")
    .map((source) => source.label);
  result.warnings = [
    "10 m og 20 m er to alternative afstande fra den officielle linje; arealerne må ikke lægges sammen. Referencegeometrien er ikke en opmålt vandløbsbred.",
    "Egnet betyder alene, at kortreglerne er opfyldt. Regulativ, beskyttelse, hydrologi, arter, adgang og lodsejeraftale kræver faglig afklaring.",
    "Hentetid er ikke optage- eller opmålingstid. Kortet er en skitse i WGS84 med geodætisk buffer og arealberegning; landmålernøjagtighed er ikke verificeret.",
    ...(missing.length
      ? [
          `Ufuldstændigt datagrundlag: ${missing.join(", ")}. Der vises ingen egnede arealer eller endelige hektartotaler.`,
        ]
      : []),
  ];
  if (!input.watercourse.geometry || input.watercourse.coverage === "unavailable") {
    result.warnings.push(
      "Officiel vandløbslinje mangler; der tegnes ingen buffer fra fotos eller en opdigtet strækning.",
    );
    return result;
  }
  const geometries = [
    input.projectBoundary,
    input.watercourse.geometry,
    ...layers.flatMap((layer) => layer.geometries),
    ...input.reaches.map((reach) => reach.geometry),
  ];
  if (geometries.length > 1000 || geometries.some((geometry) => !validGeometry(geometry))) {
    result.warnings.push(
      "Et eller flere kortlag har ugyldig geometri eller forkert koordinatsystem. Skitsen er ikke beregnet.",
    );
    return result;
  }
  if (layers.some((layer) => layer.coverage === "unavailable" && layer.geometries.length > 0)) {
    result.warnings.push(
      "Et kortlag indeholder geometri uden bekræftet kildegrundlag. Skitsen er ikke beregnet.",
    );
    return result;
  }
  try {
    const boundary = feature(input.projectBoundary);
    const section3 = merge(input.section3.geometries);
    const woodland = merge(input.woodland.geometries);
    const lowland = merge(input.lowland.geometries);
    const fields = merge(input.fields.geometries);
    const confirmed = input.reaches.filter((reach) => reach.confirmed);
    const ids = new Set(confirmed.map((reach) => reach.id));
    const ambiguousReaches =
      ids.size !== confirmed.length ||
      confirmed.some((left, i) =>
        confirmed.slice(i + 1).some((right) => {
          const common = overlap(feature(left.geometry), feature(right.geometry));
          return common !== null && area(common) > 0.01;
        }),
      );
    if (ambiguousReaches)
      result.warnings.push(
        "Delstrækningsgrænser overlapper eller gentager et ID; A–E opgøres ikke dobbelt.",
      );
    for (const bufferM of [10, 20] as const) {
      const buffered = buffer(feature(input.watercourse.geometry), bufferM, {
        units: "meters",
        steps: 16,
      });
      if (!buffered) throw new Error("Buffer mangler");
      const corridor = overlap(buffered, boundary);
      const push = (
        surface: Surface,
        fieldCandidate: boolean | null,
        carbonRichOrLowland: boolean | null,
        excluded: boolean,
        reasons: string[],
      ) => {
        if (!surface || area(surface) < 0.0001) return;
        result.features.features.push(
          feature(surface.geometry, {
            id: `${bufferM}-${result.features.features.length + 1}`,
            bufferM,
            suitability: classifyPlantingArea({
              excluded,
              fieldCandidate,
              carbonRichOrLowland,
              allSourcesComplete,
            }),
            areaHa: area(surface) / 10_000,
            fieldCandidate,
            carbonRichOrLowland,
            reasons,
            notice: PLANTING_NOTICE,
          }),
        );
      };
      // Subtract in order so overlapping exclusion polygons never double-count hectares.
      push(overlap(corridor, section3), null, null, true, [
        "Registreret §3-natur er udeladt fra skitsens kandidatarealer.",
      ]);
      const afterNature = subtract(corridor, section3);
      push(overlap(afterNature, woodland), null, null, true, [
        "Eksisterende skov eller trædække er udeladt fra nye beplantningsarealer.",
      ]);
      const remaining = subtract(afterNature, woodland);
      const candidates = overlap(remaining, fields);
      push(overlap(candidates, lowland), true, true, false, [
        "Markblok i buffer.",
        "Lavbund eller kulstofrig jord: hydrologi, natur og risiko for kulstoftab skal vurderes før beplantning.",
      ]);
      push(
        subtract(candidates, lowland),
        true,
        input.lowland.coverage === "complete" ? false : null,
        false,
        [
          "Markblok i buffer efter kendte fradrag.",
          ...(missing.length ? ["Manglende kildedækning skal afklares."] : []),
        ],
      );
      const other = subtract(remaining, fields);
      // Lowland is shown even where field coverage is absent, but is never promoted to a candidate.
      for (const [surface, isLowland] of [
        [overlap(other, lowland), true],
        [subtract(other, lowland), input.lowland.coverage === "complete" ? false : null],
      ] as const) {
        push(surface, input.fields.coverage === "complete" ? false : null, isLowland, false, [
          input.fields.coverage === "complete"
            ? "Uden for registrerede markblokke; ikke kandidat efter denne metode."
            : "Markblokdækning mangler eller er delvis; kandidatareal er uafklaret.",
          ...(isLowland ? ["Registreret lavbund eller kulstofrig jord."] : []),
        ]);
      }
    }
    result.status = allSourcesComplete ? "complete" : "partial";
    result.reaches = result.reaches.map((summary) => {
      const reach = confirmed.find((item) => item.id === summary.reach);
      if (!reach || ambiguousReaches)
        return {
          ...summary,
          reason: ambiguousReaches ? "Delstrækningsgrænser er ikke entydige." : summary.reason,
        };
      if (!allSourcesComplete)
        return { ...summary, reason: "Kildedækningen er ufuldstændig; hektartotal er ukendt." };
      const totals = { egnet: 0, betinget: 0, uegnet: 0 };
      for (const candidate of result.features.features.filter(
        (item) => item.properties.bufferM === summary.bufferM,
      )) {
        const part = overlap(candidate, feature(reach.geometry));
        if (part) totals[candidate.properties.suitability] += area(part) / 10_000;
      }
      return {
        ...summary,
        status: "complete",
        suitableHa: totals.egnet,
        conditionalHa: totals.betinget,
        unsuitableHa: totals.uegnet,
        reason: null,
      };
    });
    return result;
  } catch {
    result.features.features = [];
    result.status = "unavailable";
    result.warnings.push(
      "Kortlagene kunne ikke kombineres sikkert. Ingen arealer eller resultater er udledt; faglig kontrol af geometrien kræves.",
    );
    return result;
  }
}
