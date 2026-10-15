import { describe, expect, it } from "vitest";
import {
  droneIntakeAreaAssessment,
  droneIntakeEffectiveReference,
  type DroneIntakeCameraPhoto,
} from "../drone-intake-area";
const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [9, 55],
      [9.1, 55],
      [9.1, 55.1],
      [9, 55.1],
      [9, 55],
    ],
  ],
};
const photo = (longitude: number, latitude: number): DroneIntakeCameraPhoto => ({
  status: "located",
  cameraPosition: { longitude, latitude, geometryRole: "camera_position_only" },
});
describe("camera position consistency before fetching area data", () => {
  it("distinguishes matching, boundary and far outside camera positions", () => {
    expect(droneIntakeAreaAssessment(polygon, [photo(9.05, 55.05), photo(9, 55.05)])).toEqual({
      validArea: true,
      locatedCount: 2,
      outsideCount: 0,
    });
    expect(droneIntakeAreaAssessment(polygon, [photo(9.05, 55.05), photo(10, 56)])).toEqual({
      validArea: true,
      locatedCount: 2,
      outsideCount: 1,
    });
  });
  it("does not treat points in polygon holes as part of the selected area", () => {
    const withHole = {
      ...polygon,
      coordinates: [
        ...polygon.coordinates,
        [
          [9.04, 55.04],
          [9.04, 55.06],
          [9.06, 55.06],
          [9.06, 55.04],
          [9.04, 55.04],
        ],
      ],
    };
    expect(droneIntakeAreaAssessment(withHole, [photo(9.05, 55.05)]).outsideCount).toBe(1);
  });
  it("checks all GPS-only date-confirmation photos against the area before fetching sources", () => {
    const within = { ...photo(9.05, 55.05), status: "date_confirmation_required" as const };
    const outside = { ...photo(10, 56), status: "date_confirmation_required" as const };
    expect(droneIntakeAreaAssessment(polygon, [within, outside])).toEqual({
      validArea: true,
      locatedCount: 2,
      outsideCount: 1,
    });
    expect(
      droneIntakeAreaAssessment(polygon, [{ ...within, cameraPosition: null }]).outsideCount,
    ).toBe(1);
  });
  it("fails closed for missing geometry or malformed located positions without inventing GPS for unlocated photos", () => {
    expect(droneIntakeAreaAssessment(null, [photo(9.05, 55.05)]).outsideCount).toBe(1);
    expect(droneIntakeAreaAssessment(polygon, [photo(NaN, 55.05)]).outsideCount).toBe(1);
    expect(
      droneIntakeAreaAssessment(polygon, [{ status: "missing_gps", cameraPosition: null }]),
    ).toEqual({ validArea: true, locatedCount: 0, outsideCount: 0 });
  });
  it("does not carry the old saved reference into a proposed camera area", () => {
    const input = {
      explicitReferenceId: "",
      savedReferenceId: "old",
      suggestedReferenceId: null,
      useProposedArea: true,
    };
    expect(droneIntakeEffectiveReference(input)).toBe("");
    expect(droneIntakeEffectiveReference({ ...input, suggestedReferenceId: "nearby" })).toBe(
      "nearby",
    );
    expect(droneIntakeEffectiveReference({ ...input, explicitReferenceId: "explicit" })).toBe(
      "explicit",
    );
    expect(droneIntakeEffectiveReference({ ...input, useProposedArea: false })).toBe("old");
  });
});
