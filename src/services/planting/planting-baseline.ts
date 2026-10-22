import proj4 from "proj4";
import { z } from "zod";
import type { Polygon, MultiPolygon } from "geojson";
import type {
  PublicBaselineSnapshot,
  PublicBaselineSource,
} from "@/services/baseline/public-baseline-types";
import { parseSavedWaterPlanNatureSource } from "@/services/baseline/water-plan-nature-saved-payload";
import { hasOfficialWatercourseProvenance } from "@/services/geospatial/watercourse-source-provenance";
import {
  buildPlantingSuitability,
  type PlantingInput,
  type PlantingLayer,
  type PlantingSourceId,
  type ReachId,
} from "./planting-suitability";

const Position = z.tuple([z.number().finite().min(7).max(16), z.number().finite().min(54).max(58)]);
const PolygonSchema = z
  .object({ type: z.literal("Polygon"), coordinates: z.array(z.array(Position).min(4)).min(1) })
  .strict();
const MultiPolygonSchema = z
  .object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(z.array(Position).min(4)).min(1)).min(1),
  })
  .strict();
const Geometry = z.union([PolygonSchema, MultiPolygonSchema]);
/** Optional source contract, persisted inside the same immutable public baseline as other layers. */
export const PlantingPolygonsPayload = z
  .object({
    schema: z.literal("freyra.planting-polygons/v1"),
    crs: z.literal("EPSG:4326"),
    geometries: z.array(Geometry).max(1000),
  })
  .strip();
const ReachesPayload = z
  .object({
    schema: z.literal("freyra.municipal-reaches/v1"),
    crs: z.literal("EPSG:4326"),
    approvedBy: z.string().min(1),
    approvedAt: z.string().datetime(),
    reaches: z
      .array(z.object({ id: z.enum(["A", "B", "C", "D", "E"]), geometry: Geometry }))
      .max(5),
  })
  .strict();

const LABELS: Record<PlantingSourceId, string> = {
  watercourse: "Officiel vandløbslinje",
  section3: "§3-natur",
  woodland: "Eksisterende skov og trædække",
  lowland: "Lavbund og kulstofrig jord",
  fields: "Markblokke",
};

function missingLayer(id: PlantingSourceId): PlantingLayer {
  return {
    id,
    label: LABELS[id],
    coverage: "unavailable",
    fetchedAt: null,
    sourceUrl: null,
    warnings: ["Intet kontrolleret polygonlag i denne kildeversion."],
    geometries: [],
  };
}

function usableSource(source: PublicBaselineSource | undefined): source is PublicBaselineSource {
  return (
    !!source &&
    ["live", "import"].includes(source.mode) &&
    ["complete", "partial"].includes(source.status) &&
    source.quality.evidenceKind === "official_registration" &&
    source.error === null &&
    /^[a-f0-9]{64}$/.test(source.payloadSha256 ?? "")
  );
}

function polygonLayer(
  sources: PublicBaselineSource[],
  sourceId: string,
  id: PlantingSourceId,
): PlantingLayer {
  const source = sources.find((entry) => entry.id === sourceId);
  const parsed = PlantingPolygonsPayload.safeParse(source?.payload);
  if (!usableSource(source) || !parsed.success) return missingLayer(id);
  return {
    id,
    label: LABELS[id],
    fetchedAt: source.fetchedAt,
    sourceUrl: source.sourceUrl,
    coverage:
      source.coverage.spatial === "complete" && source.coverage.paginationComplete
        ? "complete"
        : "partial",
    warnings: [
      ...source.quality.warnings,
      "Registergeometri ved kildens hentning; tilstanden på flyvedagen er ikke verificeret.",
    ],
    geometries: parsed.data.geometries,
  };
}

function protectedNature(sources: PublicBaselineSource[]): PlantingLayer {
  const source = sources.find((entry) => entry.id === "water-plan-nature");
  if (!source) return missingLayer("section3");
  const payload = parseSavedWaterPlanNatureSource(source);
  const product = payload?.products.find((entry) => entry.id === "protected-nature");
  if (!product) return missingLayer("section3");
  try {
    const transform = (point: [number, number]): [number, number] => {
      const result = proj4(
        "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs +type=crs",
        "+proj=longlat +datum=WGS84 +no_defs +type=crs",
        point,
      );
      return [result[0], result[1]];
    };
    const geometries: (Polygon | MultiPolygon)[] = product.candidates.flatMap<
      Polygon | MultiPolygon
    >((candidate) => {
      const native = candidate.nativeGeometry;
      if (native.type === "Polygon")
        return [
          {
            type: "Polygon" as const,
            coordinates: native.coordinates.map((ring) => ring.map(transform)),
          },
        ];
      if (native.type === "MultiPolygon")
        return [
          {
            type: "MultiPolygon" as const,
            coordinates: native.coordinates.map((polygon) =>
              polygon.map((ring) => ring.map(transform)),
            ),
          },
        ];
      return [];
    });
    return {
      id: "section3",
      label: LABELS.section3,
      coverage: "partial",
      sourceUrl: product.endpoint,
      fetchedAt: source.fetchedAt,
      geometries,
      warnings: [
        ...source.quality.warnings,
        "Gemte §3-registreringer genbruges; registerfravær er ikke bevis for ubeskyttet natur. Kildens rumlige dækning er ukendt.",
        "ETRS89/UTM32 er transformeret til WGS84 uden epoke-/gridkorrektion; opmålingsnøjagtighed er ikke verificeret.",
      ],
    };
  } catch {
    return missingLayer("section3");
  }
}

export function plantingInputFromBaseline(snapshot: PublicBaselineSnapshot): PlantingInput {
  const { manifest } = snapshot;
  const source = manifest.sources.find((entry) => entry.id === "official-watercourse-reference");
  const hasReference = usableSource(source) && hasOfficialWatercourseProvenance(manifest.reference);
  const reachSource = manifest.sources.find((entry) => entry.id === "municipal-reaches");
  const reachPayload = ReachesPayload.safeParse(reachSource?.payload);
  const reaches =
    usableSource(reachSource) && reachPayload.success
      ? reachPayload.data.reaches.map((reach) => ({
          id: reach.id as ReachId,
          geometry: reach.geometry,
          confirmed: true,
        }))
      : [];
  return {
    projectId: snapshot.projectId,
    baselineId: snapshot.id,
    baselineSha256: snapshot.manifestSha256,
    projectBoundary: manifest.project.polygon,
    watercourse: {
      id: "watercourse",
      label: LABELS.watercourse,
      coverage: hasReference ? "complete" : "unavailable",
      geometry: hasReference ? manifest.reference.geometry : null,
      fetchedAt: hasReference ? source.fetchedAt : null,
      sourceUrl: hasReference ? source.sourceUrl : null,
      warnings: hasReference
        ? source.quality.warnings
        : ["Kontrolleret officiel reference mangler."],
    },
    section3: protectedNature(manifest.sources),
    woodland: polygonLayer(manifest.sources, "planting-woodland", "woodland"),
    lowland: polygonLayer(manifest.sources, "planting-lowland", "lowland"),
    fields: polygonLayer(manifest.sources, "planting-markblocks", "fields"),
    reaches,
  };
}

/** Freeze the returned object with the report. Reopening must never call new public sources. */
export function buildPlantingFromBaseline(snapshot: PublicBaselineSnapshot) {
  return buildPlantingSuitability(plantingInputFromBaseline(snapshot));
}
