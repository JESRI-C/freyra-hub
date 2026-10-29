import { describe, it, expect } from "vitest";
import {
  PhotoPointSchema,
  photoDistanceMeters,
  photoPositionAssessment,
  PhotoCaptureSchema,
} from "../field-photo-position";
describe("field photo positions", () => {
  it("uses a 50 metre default and flags excess without rejecting the observation", () => {
    expect(photoPositionAssessment({ lat: 55, lng: 10 }, { lat: 55.0001, lng: 10 })).toMatchObject({
      status: "within_limit",
    });
    expect(photoPositionAssessment({ lat: 55, lng: 10 }, { lat: 55.001, lng: 10 })).toMatchObject({
      status: "needs_review",
    });
  });
  it("does not turn missing original GPS into a verified point", () => {
    expect(photoPositionAssessment(null, { lat: 0, lng: 0 })).toEqual({
      distanceM: null,
      status: "manual_unverified",
    });
  });
  it("preserves zero coordinates and measures across the date line", () => {
    expect(PhotoPointSchema.parse({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0 });
    expect(photoDistanceMeters({ lat: 0, lng: 179.9999 }, { lat: 0, lng: -179.9999 })).toBeCloseTo(
      22.24,
      1,
    );
  });
  it("validates points and radius without coercion", () => {
    for (const p of [
      { lat: 91, lng: 10 },
      { lat: 55, lng: Infinity },
      { lat: "55", lng: 10 },
      { lat: 55, lng: 181 },
    ])
      expect(PhotoPointSchema.safeParse(p).success).toBe(false);
    expect(() => photoPositionAssessment(null, { lat: 55, lng: 10 }, -1)).toThrow();
  });
  it("compares to the original rather than the previous correction", () => {
    const original = { lat: 55, lng: 10 };
    expect(photoPositionAssessment(original, { lat: 55.0001, lng: 10 }, 20).status).toBe(
      "within_limit",
    );
    expect(photoPositionAssessment(original, { lat: 55.0002, lng: 10 }, 20).status).toBe(
      "needs_review",
    );
  });
  it("keeps input positions distinct and does not accept forged server fields", () => {
    const capture = {
      schema: "freyra.field-photo/v1",
      originalPosition: { lat: 55, lng: 10 },
      initialPosition: { lat: 55.001, lng: 10 },
      correctionReason: "GPS offset",
    };
    expect(PhotoCaptureSchema.parse(capture).originalPosition).toEqual({ lat: 55, lng: 10 });
    expect(PhotoCaptureSchema.safeParse({ ...capture, actorId: "spoof" }).success).toBe(false);
  });
});
