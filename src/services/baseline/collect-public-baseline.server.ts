import type { PublicBaselineManifest, PublicBaselineSource } from "./public-baseline-types";
import { validatePublicBaselineManifest } from "./public-baseline-service";
import { fetchDmiHistoricalSource } from "./dmi-historical-source";
import { fetchSentinelSceneSource } from "./sentinel-scene-source";

type CollectorInput = {
  polygon: PublicBaselineManifest["project"]["polygon"];
  dateFrom: string;
  dateTo: string;
  geometrySha256: string;
};
type Collector = (input: CollectorInput) => Promise<PublicBaselineSource>;

/** Called only after project authorization and canonical area/reference loading. */
export async function collectPublicBaselineSources(
  manifest: PublicBaselineManifest,
  collectors: { dmi: Collector; sentinel: Collector } = {
    dmi: fetchDmiHistoricalSource,
    sentinel: fetchSentinelSceneSource,
  },
): Promise<PublicBaselineManifest> {
  const input: CollectorInput = {
    polygon: manifest.project.polygon,
    dateFrom: manifest.period.from,
    dateTo: manifest.period.to,
    geometrySha256: manifest.project.polygonSha256,
  };
  const ids = ["dmi-historical", "sentinel-2-scenes"] as const;
  const results = await Promise.allSettled([collectors.dmi(input), collectors.sentinel(input)]);
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
        error: {
          code: "COLLECTOR_FAILED",
          message: "Kilden kunne ikke hentes eller valideres. Prøv en ny dataversion senere.",
        },
      });
    }
  }
  return validatePublicBaselineManifest({
    ...manifest,
    sources: manifest.sources.map((source) => replacements.get(source.id) ?? source),
  });
}
