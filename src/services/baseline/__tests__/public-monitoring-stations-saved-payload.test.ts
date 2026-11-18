import { describe, expect, it, vi } from "vitest";
import { parseSavedPublicMonitoringStationsSource } from "../public-monitoring-stations-saved-payload";
import type { PublicMonitoringStationsPayload } from "../public-monitoring-stations-source";
import { monitoringSource } from "./public-monitoring-stations-saved.fixtures";

describe("saved generic VanDa site inventory", () => {
  it.each([0, 1, 50, 51, 100])(
    "replays %i candidates without fetching, projecting or interpreting station coverage",
    (count) => {
      const source = monitoringSource(count);
      const before = structuredClone(source);
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Saved reads cannot fetch"));
      try {
        const data = parseSavedPublicMonitoringStationsSource(source);
        expect(data?.product.candidates).toHaveLength(count);
        expect(data?.hydrometricStationCoverage).toBe("not_verified");
        expect(data?.measurementDataFetched).toBe(false);
        expect(data?.product.candidates.every((candidate) => candidate.sourceName === null)).toBe(
          true,
        );
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(source).toEqual(before);
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

  const mutations: [string, (data: PublicMonitoringStationsPayload) => void][] = [
    [
      "point outside the query",
      (data) => {
        data.product.candidates[0].nativeGeometry.coordinates[0] = 500000;
      },
    ],
    [
      "feature/site UUID disagreement",
      (data) => {
        data.product.candidates[0].siteUuid = "20000000-0000-4000-8000-000000000001";
      },
    ],
    [
      "duplicate site across pages",
      (data) => {
        data.product.candidates[50].featureId = data.product.candidates[0].featureId;
        data.product.candidates[50].siteUuid = data.product.candidates[0].siteUuid;
      },
    ],
    [
      "station order changed across pages",
      (data) => {
        data.product.candidates[50].stationNumber = "37999999";
      },
    ],
    [
      "incorrect received count",
      (data) => {
        data.pages[0].numberReturned--;
      },
    ],
    [
      "changed matched count",
      (data) => {
        data.pages[1].numberMatched++;
      },
    ],
    [
      "missing page",
      (data) => {
        data.pages.pop();
      },
    ],
    [
      "duplicate page",
      (data) => {
        data.pages.push(data.pages[0]);
      },
    ],
    [
      "changed start index",
      (data) => {
        data.pages[1].startIndex++;
      },
    ],
    [
      "changed endpoint",
      (data) => {
        data.pages[0].queryUrl = "https://example.test/source";
      },
    ],
    [
      "credential appended to query",
      (data) => {
        data.pages[0].queryUrl += "&apiKey=DO-NOT-RENDER";
      },
    ],
    [
      "wrong requested bbox",
      (data) => {
        data.queryProjection.bbox[0]++;
      },
    ],
    [
      "invalid catalogue calendar date",
      (data) => {
        data.pages[0].serverTimestamp = "2026-02-30T12:00:00Z";
      },
    ],
    [
      "invalid raw response hash",
      (data) => {
        data.pages[0].responseSha256 = "not-a-hash";
      },
    ],
    [
      "oversized response",
      (data) => {
        data.pages[0].responseBytes = 1024 * 1024 + 1;
      },
    ],
    [
      "wrong geometry binding",
      (data) => {
        data.geometrySha256 = "f".repeat(64);
      },
    ],
    [
      "wrong period binding",
      (data) => {
        data.requestedPeriod.from = "2026-08-25";
      },
    ],
  ];
  it.each(mutations)("rejects %s", (_name, mutate) => {
    const source = monitoringSource(51);
    mutate(source.payload as unknown as PublicMonitoringStationsPayload);
    expect(parseSavedPublicMonitoringStationsSource(source)).toBeNull();
  });

  it.each([
    ["sourceName", "DO-NOT-RENDER"],
    ["Stationsejer", "DO-NOT-RENDER"],
    ["Link", "https://example.test/private"],
    ["sourceType", { code: 23, name: "Groundwater", status: "verified" }],
    ["hydrometricStationRelation", "verified"],
    ["watercourseRelation", "verified"],
    ["catchmentRelation", "verified"],
    ["municipalReachMapped", true],
    ["measurements", "fetched"],
  ])(
    "rejects candidate field %s instead of trusting saved labels or association",
    (field, value) => {
      const source = monitoringSource();
      const data = source.payload as unknown as PublicMonitoringStationsPayload;
      Object.assign(data.product.candidates[0], { [field]: value });
      expect(parseSavedPublicMonitoringStationsSource(source)).toBeNull();
    },
  );

  it.each([
    ["measurementDataFetched", true],
    ["historicalRegistryCoverageVerified", true],
    ["hydrometricStationCoverage", "complete"],
    ["automaticWatercourseAssociationPerformed", true],
    ["automaticCatchmentAssociationPerformed", true],
    ["municipalReachMapped", true],
    ["legalAssessmentPerformed", true],
    ["metricsCalculated", true],
    ["upstreamTransactionalSnapshot", true],
  ])("rejects unsupported interpretation %s", (field, value) => {
    const source = monitoringSource();
    Object.assign(source.payload!, { [field]: value });
    expect(parseSavedPublicMonitoringStationsSource(source)).toBeNull();
  });

  it("rejects false coverage, timestamps, altered provider provenance and old empty placeholders", () => {
    for (const mutate of [
      (source: ReturnType<typeof monitoringSource>) => {
        source.coverage.returnedCount = 0;
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.coverage.temporal = "complete";
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.coverage.observedFrom = source.fetchedAt;
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.coverage.paginationComplete = false;
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.status = "complete";
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.mode = "preview";
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.provider = "Unknown provider";
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.fetchedAt = "2026-02-30T12:00:00Z";
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.adapterVersion = "unknown/v2";
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.payload = null;
        source.status = "not_implemented";
      },
      (source: ReturnType<typeof monitoringSource>) => {
        source.sourceUrl += "?apiKey=DO-NOT-RENDER";
      },
    ]) {
      const source = monitoringSource();
      mutate(source);
      expect(parseSavedPublicMonitoringStationsSource(source)).toBeNull();
    }
  });
});
