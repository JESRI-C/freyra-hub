import {
  buildOfficialWatercourseGeometryUrl,
  type OfficialWatercourseGeometry,
} from "./official-watercourse-source";
import {
  buildDatafordelerWatercourseGeometryUrl,
  DATAFORDELER_WATERCOURSE_PROVIDER,
  DATAFORDELER_WATERCOURSE_CRS,
  DATAFORDELER_WATERCOURSE_AXIS_ORDER,
  DATAFORDELER_WATERCOURSE_DATASET_VERSION,
} from "./datafordeler-watercourse-source";

export type DatafordelerWatercourseReference = OfficialWatercourseGeometry &
  Required<
    Pick<
      OfficialWatercourseGeometry,
      | "sourceProvider"
      | "sourceCrs"
      | "sourceAxisOrder"
      | "datasetVersion"
      | "sourceRegisteredAt"
      | "sourceValidFrom"
      | "officialLengthM"
    >
  >;

function isNullableSourceDate(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)))
  );
}

/** A provider's registration date is never a new measured geometry date. */
export function isDatafordelerWatercourseReference(
  reference: OfficialWatercourseGeometry,
): reference is DatafordelerWatercourseReference {
  return (
    reference.sourceProvider === DATAFORDELER_WATERCOURSE_PROVIDER &&
    reference.sourceCrs === DATAFORDELER_WATERCOURSE_CRS &&
    reference.sourceAxisOrder === DATAFORDELER_WATERCOURSE_AXIS_ORDER &&
    reference.datasetVersion === DATAFORDELER_WATERCOURSE_DATASET_VERSION &&
    isNullableSourceDate(reference.sourceRegisteredAt) &&
    isNullableSourceDate(reference.sourceValidFrom) &&
    (reference.officialLengthM === null ||
      (typeof reference.officialLengthM === "number" &&
        Number.isFinite(reference.officialLengthM) &&
        reference.officialLengthM >= 0)) &&
    reference.modifiedAt === null &&
    reference.geometryVersion === null &&
    reference.sourceUrl === buildDatafordelerWatercourseGeometryUrl(reference.id)
  );
}

export function hasOfficialWatercourseProvenance(reference: OfficialWatercourseGeometry): boolean {
  if (reference.sourceProvider !== undefined) {
    return isDatafordelerWatercourseReference(reference);
  }
  // Preserve legacy serialization exactly. A partial modern identity cannot be
  // laundered into a v1 reference by omitting only its provider discriminator.
  return (
    reference.sourceCrs === undefined &&
    reference.sourceAxisOrder === undefined &&
    reference.datasetVersion === undefined &&
    reference.sourceRegisteredAt === undefined &&
    reference.sourceValidFrom === undefined &&
    reference.officialLengthM === undefined &&
    reference.sourceUrl === buildOfficialWatercourseGeometryUrl(reference.id)
  );
}
