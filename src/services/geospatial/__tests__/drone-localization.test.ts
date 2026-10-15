import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDroneLocalization,
  cameraToWatercourseDistanceM,
  rankDroneLocalizationCandidates,
  type DroneLocalizationOriginal,
} from "../drone-localization";
import {
  parseDatafordelerWatercourseGeometry,
  type DatafordelerWatercourseGeometry,
} from "../datafordeler-watercourse-source";

const reference = parseDatafordelerWatercourseGeometry(
  readFileSync(new URL("./fixtures/datafordeler-watercourse.gml", import.meta.url), "utf8"),
  "120b35a4-d910-46b9-e063-6f4f210a952b",
);
function photo(
  index: number,
  lng: number | null = 9.26,
  lat = 55.35,
  eligible = true,
): DroneLocalizationOriginal {
  return {
    media: {
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      original_sha256: "a".repeat(64),
      original_validation_sha256: "b".repeat(64),
    },
    fileName: `photo-${index}.jpg`,
    validation: {
      cameraPositionEligible: eligible,
      metadata: {
        capture: { capturedAtUtc: "2026-10-01T10:00:00.000Z" },
        position: lng === null ? undefined : { longitude: lng, latitude: lat },
      },
    },
  } as DroneLocalizationOriginal;
}
function source(lng: number, id = reference.id): DatafordelerWatercourseGeometry {
  return {
    ...reference,
    id,
    center: { lng: 14, lat: 57 },
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [lng, 55.34],
          [lng, 55.36],
        ],
      ],
    },
  };
}
describe("server-original camera localization proposals", () => {
  it("returns manual-location questions for missing or uncertain GPS without a centroid fallback", () => {
    const result = buildDroneLocalization("project", "actor", [
      photo(1, null),
      photo(2, 9.26, 55.35, false),
    ]);
    expect(result.photos.map((p) => p.status)).toEqual(["missing_gps", "metadata_review"]);
    expect(result.photos.every((p) => p.cameraPosition === null && p.reason)).toBe(true);
    expect(result.clusters).toEqual([]);
    expect(result).toMatchObject({
      requiresConfirmation: true,
      georeferenced: false,
      reportEligible: false,
    });
  });
  it("does not query non-Danish camera coordinates", () => {
    const result = buildDroneLocalization("project", "actor", [photo(1, -74, 40)]);
    expect(result.photos[0].status).toBe("outside_denmark");
    expect(result.clusters).toHaveLength(0);
  });
  it("keeps isolated photos out of the main camera search area", () => {
    const result = buildDroneLocalization("project", "actor", [
      photo(1),
      photo(2, 9.2601),
      photo(3, 9.2602),
      photo(4, 10.5),
    ]);
    expect(result.clusters).toHaveLength(2);
    expect(result.clusters[0].mediaIds).toHaveLength(3);
    expect(result.clusters[0].cameraBounds[2]).toBe(9.2602);
    expect(result.clusters[1]).toMatchObject({ isolated: true, searchStatus: "isolated" });
    expect(result.photos).toHaveLength(4);
  });
  it("limits public-source searches to three separate clusters while retaining all photos", () => {
    const result = buildDroneLocalization("project", "actor", [
      photo(1, 9),
      photo(2, 9.2),
      photo(3, 9.4),
      photo(4, 9.6),
    ]);
    expect(result.clusters.map((c) => c.searchStatus)).toEqual([
      "pending",
      "pending",
      "pending",
      "call_limit",
    ]);
  });
  it("does not turn a long chain of photos into an unbounded source query", () => {
    const result = buildDroneLocalization(
      "project",
      "actor",
      Array.from({ length: 50 }, (_, index) => photo(index + 1, 9 + index * 0.006)),
    );
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].searchStatus).toBe("too_broad");
  });
  it("returns a bounded buffered camera area and stable clusters independent of upload order", () => {
    const first = buildDroneLocalization("p", "a", [photo(2), photo(1)]);
    const second = buildDroneLocalization("p", "a", [photo(1), photo(2)]);
    expect(first).toEqual(second);
    expect(first.clusters[0].suggestedPolygon.type).toBe("Polygon");
    expect(first.clusters[0].suggestedPolygon.coordinates[0]).toHaveLength(5);
    expect(first.photos[0].cameraPosition?.geometryRole).toBe("camera_position_only");
    expect(JSON.stringify(first)).not.toMatch(/storagePath|serial|signedUrl|footprint/);
  });
  it("measures to line segments instead of distant centers or vertices", () => {
    expect(cameraToWatercourseDistanceM([9.26, 55.35], source(9.26).geometry)).toBeCloseTo(0, 5);
    expect(cameraToWatercourseDistanceM([9.261, 55.35], source(9.26).geometry)).toBeGreaterThan(60);
    expect(cameraToWatercourseDistanceM([9.261, 55.35], source(9.26).geometry)).toBeLessThan(65);
    const degenerate: DatafordelerWatercourseGeometry["geometry"] = {
      type: "MultiLineString" as const,
      coordinates: [
        [
          [9.26, 55.35],
          [9.26, 55.35],
        ],
      ],
    };
    expect(cameraToWatercourseDistanceM([9.26, 55.35], degenerate)).toBe(0);
  });
  it("only suggests a close distinguishable reference in complete source results", () => {
    const result = buildDroneLocalization("p", "a", [photo(1)]);
    const ranked = rankDroneLocalizationCandidates(result.clusters[0], result.photos, {
      watercourses: [source(9.263, "second"), source(9.26)],
      numberReturned: 2,
      numberMatched: 2,
      paginationComplete: true,
    });
    expect(ranked.suggestedReferenceId).toBe(reference.id);
    expect(ranked.candidates[0]).toMatchObject({
      distanceM: 0,
      maximumDistanceM: 0,
      supportedPhotoCount: 1,
    });
  });
  it.each([false, true])(
    "parallel references remain choices when completeness is %s",
    (complete) => {
      const result = buildDroneLocalization("p", "a", [photo(1)]);
      const ranked = rankDroneLocalizationCandidates(result.clusters[0], result.photos, {
        watercourses: [source(9.26), source(9.2601, "second")],
        numberReturned: 2,
        numberMatched: complete ? 2 : 100,
        paginationComplete: complete,
      });
      expect(ranked.suggestedReferenceId).toBeNull();
      expect(ranked.searchStatus).toBe(complete ? "complete" : "truncated");
    },
  );
  it("accounts for excluded nonofficial members before suggesting an official reference", () => {
    const result = buildDroneLocalization("p", "a", [photo(1)]);
    const collection = {
      watercourses: [source(9.26)],
      numberReturned: 2,
      numberMatched: 2,
      paginationComplete: true,
      excludedFeatureCount: 1,
    };
    const ranked = rankDroneLocalizationCandidates(result.clusters[0], result.photos, collection);
    expect(ranked).toMatchObject({
      searchStatus: "complete",
      excludedCandidateCount: 1,
      suggestedReferenceId: reference.id,
    });
    const truncated = rankDroneLocalizationCandidates(result.clusters[0], result.photos, {
      ...collection,
      numberMatched: 3,
      paginationComplete: false,
    });
    expect(truncated).toMatchObject({
      searchStatus: "truncated",
      suggestedReferenceId: null,
      excludedCandidateCount: 1,
    });
  });
  it.each([-1, 0.5, NaN, 2])(
    "does not accept inconsistent excluded count %s as a complete source",
    (excludedFeatureCount) => {
      const result = buildDroneLocalization("p", "a", [photo(1)]);
      const ranked = rankDroneLocalizationCandidates(result.clusters[0], result.photos, {
        watercourses: [source(9.26)],
        numberReturned: 2,
        numberMatched: 2,
        paginationComplete: true,
        excludedFeatureCount,
      });
      expect(ranked).toMatchObject({ searchStatus: "truncated", suggestedReferenceId: null });
    },
  );
  it("never suggests a reference when known results are truncated or distant", () => {
    const result = buildDroneLocalization("p", "a", [photo(1)]);
    const truncated = rankDroneLocalizationCandidates(result.clusters[0], result.photos, {
      watercourses: [source(9.26)],
      numberReturned: 1,
      numberMatched: null,
      paginationComplete: false,
    });
    expect(truncated.suggestedReferenceId).toBeNull();
    const distant = rankDroneLocalizationCandidates(result.clusters[0], result.photos, {
      watercourses: [source(9.3)],
      numberReturned: 1,
      numberMatched: 1,
      paginationComplete: true,
    });
    expect(distant.candidates).toEqual([]);
    expect(distant.suggestedReferenceId).toBeNull();
  });
});
