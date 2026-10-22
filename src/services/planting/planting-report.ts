import { z } from "zod";
import { buildPlantingFromBaseline } from "./planting-baseline";
import { PLANTING_LITERATURE } from "./planting-literature";
import { PLANTING_METHOD, PLANTING_NOTICE } from "./planting-suitability";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";

const Ha = z.number().finite().nonnegative().nullable();
const Source = z
  .object({
    id: z.enum(["watercourse", "section3", "woodland", "lowland", "fields"]),
    label: z.string().max(200),
    coverage: z.enum(["complete", "partial", "unavailable"]),
    fetchedAt: z.string().max(100).nullable(),
    sourceUrl: z.string().url().nullable(),
    warnings: z.array(z.string().max(5000)).max(100),
  })
  .strict();
export const PlantingReportSchema = z
  .object({
    schema: z.literal(PLANTING_METHOD),
    notice: z.literal(PLANTING_NOTICE),
    projectId: z.string().uuid(),
    baselineId: z.string().uuid(),
    baselineSha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["complete", "partial", "unavailable"]),
    sources: z.array(Source).length(5),
    warnings: z.array(z.string().max(5000)).max(100),
    reaches: z
      .array(
        z
          .object({
            reach: z.enum(["A", "B", "C", "D", "E"]),
            bufferM: z.union([z.literal(10), z.literal(20)]),
            status: z.enum(["complete", "unknown"]),
            suitableHa: Ha,
            conditionalHa: Ha,
            unsuitableHa: Ha,
            reason: z.string().max(3000).nullable(),
          })
          .strict(),
      )
      .length(10),
    localEffectsCalculated: z.literal(false),
    literature: z
      .array(
        z
          .object({
            effect: z.string().max(100),
            interval: z.string().max(500).nullable(),
            context: z.string().max(3000),
            citation: z.string().max(1000),
            sourceUrl: z.string().url(),
            checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .strict(),
      )
      .length(4),
  })
  .strict();

/** The v2 report stores this summary and citations; it never stores calculated local effects. */
export function compilePlantingReportV1(snapshot: PublicBaselineSnapshot) {
  const { features: _mapGeometry, ...summary } = buildPlantingFromBaseline(snapshot);
  const sources = summary.sources.map((source) => {
    let sourceUrl: string | null = null;
    try {
      const url = new URL(source.sourceUrl ?? "");
      if (url.protocol === "https:" && !url.username && !url.password) {
        url.search = "";
        url.hash = "";
        sourceUrl = url.toString();
      }
    } catch {
      /* No public reference available. */
    }
    return { ...source, sourceUrl };
  });
  return PlantingReportSchema.parse({ ...summary, sources, literature: PLANTING_LITERATURE });
}
