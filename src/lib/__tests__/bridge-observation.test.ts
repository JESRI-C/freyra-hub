import { describe, expect, it } from "vitest";
import { bridgeObservationInsert } from "../bridge-observation";

const photo = "media:00000000-0000-4000-8000-000000000001";
const observation = {
  objectId: " BR-01 ",
  structureType: "culvert",
  latitude: 55.1,
  longitude: 9.2,
  accuracyM: 0,
  materials: "Beton",
  dimensions: "Ca. Ø 80 cm",
  conditions: "Synlig tilstopning ved indløb.",
  photoSourceIds: [photo, photo],
};

describe("visual bridge registration", () => {
  it("uses the existing field observation record and retains GPS precision and source references", () => {
    expect(bridgeObservationInsert(observation, "project", "actor", "observation")).toEqual({
      id: "observation",
      project_id: "project",
      observer_id: "actor",
      observation_type: "bridge_visual",
      latitude: 55.1,
      longitude: 9.2,
      accuracy_m: 0,
      notes: observation.conditions,
      metadata: {
        schema: "freyra.bridge-visual/v1",
        objectId: "BR-01",
        structureType: "culvert",
        materials: "Beton",
        dimensions: "Ca. Ø 80 cm",
        photoSourceIds: [photo],
      },
    });
  });
  it.each([
    { latitude: NaN },
    { longitude: 190 },
    { conditions: "" },
    { photoSourceIds: ["external"] },
  ])("rejects incomplete or invalid field evidence: %j", (change) => {
    expect(() =>
      bridgeObservationInsert({ ...observation, ...change }, "project", "actor", "observation"),
    ).toThrow();
  });
});
