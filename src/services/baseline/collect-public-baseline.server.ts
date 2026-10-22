import type { PublicBaselineManifest, PublicBaselineSource } from "./public-baseline-types";
import { validatePublicBaselineManifest } from "./public-baseline-service";
import { fetchDmiHistoricalSource } from "./dmi-historical-source";
import { fetchFrozenSentinelSceneSource } from "./sentinel-preview.server";
import { fitCollectedBaselineBudget } from "./public-baseline-budget";
import {
  collectCachedPublicSource,
  publicSourceCache,
  type PublicSourceCache,
} from "./public-source-cache.server";

type CollectorInput = {
  polygon: PublicBaselineManifest["project"]["polygon"];
  dateFrom: string;
  dateTo: string;
  geometrySha256: string;
};
type Collector = (input: CollectorInput) => Promise<PublicBaselineSource>;
type Collectors = {
  dmi: Collector;
  sentinel: Collector;
  raster: Collector;
  nature: Collector;
  monitoring: Collector;
  ortho?: Collector;
  markblocks?: Collector;
  lowland?: Collector;
  woodland?: Collector;
  cadastral?: Collector;
  soil?: Collector;
};

/** Called only after project authorization and canonical area/reference loading. */
export async function collectPublicBaselineSources(
  manifest: PublicBaselineManifest,
  collectors?: Collectors,
  options: { cache?: PublicSourceCache; timeoutMs?: number; nowMs?: () => number } = {},
): Promise<PublicBaselineManifest> {
  const adapters: Collectors =
    collectors ??
    ({
      dmi: fetchDmiHistoricalSource,
      sentinel: fetchFrozenSentinelSceneSource,
      raster: async (input) => {
        const { fetchDatafordelerRasterInventorySource } =
          await import("./datafordeler-raster-inventory.server");
        return fetchDatafordelerRasterInventorySource(input);
      },
      nature: async (input) => {
        const { fetchWaterPlanNatureSource } = await import("./water-plan-nature-source.server");
        return fetchWaterPlanNatureSource(input);
      },
      monitoring: async (input) => {
        const { fetchPublicMonitoringStationsSource } =
          await import("./public-monitoring-stations-source.server");
        return fetchPublicMonitoringStationsSource(input);
      },
      ortho: async (input) =>
        (await import("./orthophoto-preview.server")).fetchOrthophotoPreviewSource(input),
      cadastral: async (input) =>
        (await import("./cadastral-source.server")).fetchCadastralSource(input),
      soil: async (input) => (await import("./soil-type-source.server")).fetchSoilTypeSource(input),
      markblocks: async (input) =>
        (await import("./planting-polygon-sources.server")).fetchPlantingPolygonSource(
          "planting-markblocks",
          input,
        ),
      lowland: async (input) =>
        (await import("./planting-polygon-sources.server")).fetchPlantingPolygonSource(
          "planting-lowland",
          input,
        ),
      woodland: async (input) =>
        (await import("./planting-polygon-sources.server")).fetchPlantingPolygonSource(
          "planting-woodland",
          input,
        ),
    } satisfies Collectors);
  const input: CollectorInput = {
    polygon: manifest.project.polygon,
    dateFrom: manifest.period.from,
    dateTo: manifest.period.to,
    geometrySha256: manifest.project.polygonSha256,
  };
  const ids: string[] = [
    "dmi-historical",
    "sentinel-2-scenes",
    "orthophoto-terrain",
    "water-plan-nature",
    "public-monitoring-stations",
  ];
  const collect = [
    adapters.dmi,
    adapters.sentinel,
    adapters.raster,
    adapters.nature,
    adapters.monitoring,
  ];
  for (const [id, adapter] of [
    ["orthophoto-preview", adapters.ortho],
    ["planting-markblocks", adapters.markblocks],
    ["planting-lowland", adapters.lowland],
    ["planting-woodland", adapters.woodland],
    ["cadastral-parcels", adapters.cadastral],
    ["soil-type", adapters.soil],
  ] as const) {
    if (adapter && manifest.sources.some((source) => source.id === id)) {
      ids.push(id);
      collect.push(adapter);
    }
  }
  const results = await Promise.allSettled(
    ids.map((id, index) => {
      const placeholder = manifest.sources.find((source) => source.id === id);
      if (!placeholder) throw new Error("Datagrundlaget mangler den forventede kildekontrakt.");
      return collectCachedPublicSource(
        manifest.project.id,
        placeholder,
        () => collect[index](input),
        {
          ...options,
          cache: options.cache ?? (collectors ? undefined : publicSourceCache),
          // New versions must attempt to freeze pixels instead of inheriting a legacy URL.
          acceptCached:
            id === "sentinel-2-scenes" && !collectors
              ? (source) => source.adapterVersion === "sentinel-scene-catalog-frozen/v1"
              : undefined,
        },
      );
    }),
  );
  const replacements = new Map<string, PublicBaselineSource>();
  for (const [index, result] of results.entries()) {
    const id = ids[index];
    const placeholder = manifest.sources.find((source) => source.id === id);
    if (!placeholder) throw new Error("Datagrundlaget mangler den forventede kildekontrakt.");
    if (result.status === "fulfilled") {
      if (result.value.id !== id) throw new Error("Datakilden matcher ikke den bestilte kilde.");
      replacements.set(id, result.value);
    } else {
      // Preserve a collection failure, never a preview or an invented zero.
      replacements.set(id, {
        ...placeholder,
        mode: "error",
        status: "failed",
        payload: null,
        payloadSha256: null,
        coverage: {
          ...placeholder.coverage,
          spatial: "unknown",
          temporal: "unknown",
          observedFrom: null,
          observedTo: null,
          paginationComplete: false,
          returnedCount: null,
        },
        error: {
          code: "COLLECTOR_FAILED",
          message: "Kilden kunne ikke hentes eller valideres. Prøv en ny dataversion senere.",
        },
      });
    }
  }
  return validatePublicBaselineManifest(
    fitCollectedBaselineBudget({
      ...manifest,
      sources: manifest.sources.map((source) => replacements.get(source.id) ?? source),
    }),
  );
}
