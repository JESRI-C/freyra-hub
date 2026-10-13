import { booleanIntersects, multiLineString, polygon } from "@turf/turf";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { OfficialWatercourseGeometry } from "@/services/geospatial/official-watercourse-source";
import { baselineSha256, validatePublicBaselineManifest } from "./public-baseline-service";
import type { PublicBaselineSnapshot, PublicBaselineSource } from "./public-baseline-types";

export type VerificationResult = "supported" | "refuted" | "inconclusive" | "site_visit";
export type VerificationPriority = "high" | "normal" | "low";

export interface DraftVerificationQuestion {
  id: string;
  snapshotId: string;
  snapshotSha256: string;
  sourceIds: string[];
  priority: VerificationPriority;
  title: string;
  question: string;
  rationale: string;
  area: {
    crs: "EPSG:4326";
    aoi: GeoJSONPolygon;
    referenceGeometry: OfficialWatercourseGeometry["geometry"];
    restriction: string;
  };
  dates: {
    baselineFrom: string;
    baselineTo: string;
    sourceFetchedAt: string;
    sourceModifiedAt: string | null;
    sourceObservedFrom: string | null;
    sourceObservedTo: string | null;
  };
  method: string;
  requiredEvidence: {
    kind: "original_photo" | "field_control";
    requirement: "required" | "if_needed";
    description: string;
  }[];
  uncertainty: string[];
  allowedResults: VerificationResult[];
  result: null;
}

export interface DraftVerificationPlan {
  schema: "gofreyra.verification-plan-draft/v1";
  status: "draft";
  snapshotId: string;
  snapshotSha256: string;
  projectId: string;
  questions: DraftVerificationQuestion[];
  baselineDataGaps: { sourceId: string; provider: string; dataset: string; reason: string }[];
  contextSourceIds: string[];
  warnings: string[];
}

function sourceAvailable(source: PublicBaselineSource): boolean {
  return (
    (source.mode === "live" || source.mode === "import") &&
    source.status === "complete" &&
    source.payload !== null &&
    source.payloadSha256 !== null &&
    source.error === null
  );
}

/**
 * Creates reviewable suggestions from one immutable snapshot. This function
 * neither fetches newer sources nor saves decisions or approves observations.
 * Missing public data are collection gaps; a drone cannot resolve those gaps.
 */
export async function createDraftVerificationPlanV1(
  snapshot: PublicBaselineSnapshot,
): Promise<DraftVerificationPlan> {
  const manifest = await validatePublicBaselineManifest(snapshot.manifest);
  if (
    snapshot.projectId !== manifest.project.id ||
    (await baselineSha256(manifest)) !== snapshot.manifestSha256
  ) {
    throw new Error("Verifikationsplanen kræver en gyldig, uændret baselineversion.");
  }
  const plan: DraftVerificationPlan = {
    schema: "gofreyra.verification-plan-draft/v1",
    status: "draft",
    snapshotId: snapshot.id,
    snapshotSha256: snapshot.manifestSha256,
    projectId: snapshot.projectId,
    questions: [],
    baselineDataGaps: manifest.sources
      .filter((source) => !sourceAvailable(source))
      .map((source) => ({
        sourceId: source.id,
        provider: source.provider,
        dataset: source.dataset,
        reason:
          source.error?.message ??
          "Kilden mangler fuld, dokumenteret dækning. Afklar datagrundlaget før en faglig konklusion.",
      })),
    contextSourceIds: [],
    warnings: [
      "Spørgsmålene er faglige udkast. Resultater og godkendelser er endnu ikke registreret.",
      "Vejrdata dokumenterer forhold ved en station eller modelcelle. De beviser ikke vandføring, opstuvning eller behov for vedligeholdelse.",
    ],
  };
  const referenceSource = manifest.sources.find(
    (source) => source.id === "official-watercourse-reference",
  );
  const availableSources = manifest.sources.filter(sourceAvailable);
  plan.contextSourceIds = availableSources
    .filter((source) => source.id !== referenceSource?.id)
    .map((source) => source.id);
  if (
    !referenceSource ||
    !sourceAvailable(referenceSource) ||
    referenceSource.quality.evidenceKind !== "official_registration"
  ) {
    plan.warnings.push(
      "En dokumenteret officiel vandløbsreference mangler. Der dannes derfor intet spørgsmål om referencegeometrien.",
    );
    return plan;
  }
  const intersectsAoi = booleanIntersects(
    polygon(manifest.project.polygon.coordinates),
    multiLineString(manifest.reference.geometry.coordinates),
  );
  if (!intersectsAoi) {
    plan.warnings.push(
      "Den valgte referencegeometri overlapper ikke projektgrænsen. Afklar sagens geografi før droneverifikation.",
    );
    return plan;
  }
  // Availability of named reference geometry supports one location question.
  // It supports no automatic obstruction, habitat, species or hydraulic finding.
  plan.questions.push({
    id: `verification:${snapshot.id}:official-reference-location:v1`,
    snapshotId: snapshot.id,
    snapshotSha256: snapshot.manifestSha256,
    sourceIds: [referenceSource.id],
    priority: "normal",
    title: "Kontrollér vandløbets synlige placering",
    question:
      "Stemmer vandløbets synlige placering inden for projektgrænsen med den valgte offentlige referencegeometri?",
    rationale:
      "Den gemte, navngivne reference overlapper projektgrænsen. En billed- eller feltkontrol kan støtte den geografiske sammenhæng før senere faglige vurderinger.",
    area: {
      crs: "EPSG:4326",
      aoi: structuredClone(manifest.project.polygon),
      referenceGeometry: structuredClone(manifest.reference.geometry),
      restriction:
        "Undersøg kun den del af referencegeometrien, som ligger inden for projektgrænsen. Den fulde navngivne streng er ikke automatisk den kommunale delstrækning.",
    },
    dates: {
      baselineFrom: manifest.period.from,
      baselineTo: manifest.period.to,
      sourceFetchedAt: referenceSource.fetchedAt,
      sourceModifiedAt: referenceSource.sourceModifiedAt,
      sourceObservedFrom: referenceSource.coverage.observedFrom,
      sourceObservedTo: referenceSource.coverage.observedTo,
    },
    method:
      "Sammenhold daterede originalfotos og genkendelige terrænpunkter med reference og projektgrænse. Registrér observeret objekt adskilt fra kameraets GPS-position. Brug feltkontrol, hvis den geografiske sammenhæng er uklar.",
    requiredEvidence: [
      {
        kind: "original_photo",
        requirement: "required",
        description:
          "Originalfotos med optagetid, afklaret tidszone og dokumenteret geografisk sammenhæng. En thumbnail eller kameraposition alene er ikke tilstrækkeligt.",
      },
      {
        kind: "field_control",
        requirement: "if_needed",
        description:
          "Besigtigelse eller kontrolleret geografisk reference, hvis fotos, skygge, vegetation eller position ikke gør placeringen vurderbar.",
      },
    ],
    uncertainty: [
      manifest.reference.disclaimer,
      "Navngivet referencegeometri dokumenterer ikke juridisk stationering, præcise bredder eller hydraulisk skikkelse.",
      "Kildens gyldighed gennem hele undersøgelsesperioden er ikke dokumenteret. Sammenlign foto- og kildedatoer før en retrospektiv vurdering.",
      "Et understøttet stedmatch er ingen godkendelse af vedligeholdelsesbehov, naturtilstand eller en udført indsats.",
    ],
    allowedResults: ["supported", "refuted", "inconclusive", "site_visit"],
    result: null,
  });
  return plan;
}

/** Preview remains v1. A future generator must keep the saved v1 implementation. */
export const createDraftVerificationPlan = createDraftVerificationPlanV1;
