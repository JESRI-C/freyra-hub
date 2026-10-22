/**
 * Analysis Orchestrator
 * Kører hele analysekæden for et projekt i én operation:
 *
 *   1. NDVI fra Sentinel-2          (Element84 STAC)
 *   2. §3-natur + arter             (Miljøportal + Naturbasen)
 *   3. Biodiversitetsindeks         (vægtet model)
 *   4. CO₂-binding                  (IPCC Tier 1 DK + GEUS jordbund)
 *   5. Vandkvalitetsrisiko          (WFD-model + vandløbsafstand)
 *
 * Alle resultater gemmes automatisk i indicators + calculated_metrics
 * med audit trail. Returnerer ét samlet resultat klar til UI og rapport.
 */

import { runProjectNdvi, type NdviEngineResult } from "@/services/satellite/ndvi-engine";
import { runBiodiversityAnalysis, type BiodiversityEngineResult } from "@/services/nature/biodiversity-engine";
import { runCarbonAnalysis, type CarbonEngineResult } from "@/services/nature/carbon-engine";
import { runWaterQualityAnalysis, type WaterQualityResult } from "@/services/nature/water-quality-engine";
import { logAuditEvent } from "@/services/audit-service";
import type { Project } from "@/lib/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalysisStep = "ndvi" | "biodiversity" | "carbon" | "water" | "done";

export interface FullAnalysisResult {
  projectId: string;
  ndvi: NdviEngineResult | null;
  biodiversity: BiodiversityEngineResult | null;
  carbon: CarbonEngineResult | null;
  water: WaterQualityResult | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stepsCompleted: number;
  stepsFailed: string[];
}

export interface AnalysisSummary {
  ndviValue: number | null;
  biodiversityScore: number | null;
  biodiversityClass: string | null;
  annualCO2: number | null;
  totalCO2_30yr: number | null;
  waterRisk: string | null;
  waterScore: number | null;
  p3OverlapHa: number | null;
  speciesCount: number | null;
  redListedCount: number | null;
  watercourseDistM: number | null;
}

/**
 * Kører den fulde analysekæde sekventielt (NDVI bruges som input til de næste).
 * onProgress kaldes ved hvert trin så UI kan vise fremdrift.
 */
export async function runFullAnalysis(
  project: Project,
  onProgress?: (step: AnalysisStep) => void,
): Promise<FullAnalysisResult> {
  const lat = project.geometry_centroid_lat;
  const lng = project.geometry_centroid_lng;
  if (lat == null || lng == null) {
    throw new Error("Projektet mangler koordinater — tegn en projektgrænse først.");
  }
  const areaHa = project.geometry_area_ha ?? 1;
  const start = Date.now();
  const stepsFailed: string[] = [];

  // 1. NDVI (input til de næste trin)
  onProgress?.("ndvi");
  let ndvi: NdviEngineResult | null = null;
  try {
    ndvi = await runProjectNdvi(project.id, lat, lng);
    if (ndvi.error && ndvi.ndvi === null) stepsFailed.push("ndvi");
  } catch {
    stepsFailed.push("ndvi");
  }
  const ndviValue = ndvi?.ndvi ?? null;

  // 2+3. Biodiversitet (henter selv §3 + arter)
  onProgress?.("biodiversity");
  let biodiversity: BiodiversityEngineResult | null = null;
  try {
    biodiversity = await runBiodiversityAnalysis(project.id, lat, lng, areaHa, ndviValue);
  } catch {
    stepsFailed.push("biodiversity");
  }

  // 4. CO₂
  onProgress?.("carbon");
  let carbon: CarbonEngineResult | null = null;
  try {
    carbon = await runCarbonAnalysis(
      project.id, lat, lng, areaHa, project.project_type, ndviValue, project.start_date,
    );
  } catch {
    stepsFailed.push("carbon");
  }

  // 5. Vandkvalitet
  onProgress?.("water");
  let water: WaterQualityResult | null = null;
  try {
    water = await runWaterQualityAnalysis(project.id, lat, lng, project.project_type, ndviValue);
  } catch {
    stepsFailed.push("water");
  }

  onProgress?.("done");
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - start;
  const stepsCompleted = 4 - stepsFailed.length;

  void logAuditEvent({
    project_id: project.id,
    event_type: "analysis_run",
    title: `Fuld miljøanalyse gennemført (${stepsCompleted}/4 trin)`,
    description: [
      ndviValue != null ? `NDVI ${ndviValue.toFixed(2)}` : null,
      biodiversity ? `Biodiversitet ${biodiversity.score.total}/100` : null,
      carbon ? `CO₂ ${carbon.estimate.annualSequestration} t/år` : null,
      water ? `Vandrisiko: ${water.risk.overall}` : null,
      `${(durationMs / 1000).toFixed(1)}s`,
    ].filter(Boolean).join(" · "),
    actor: "Analysemotor",
    source: "automated",
  });

  return {
    projectId: project.id,
    ndvi, biodiversity, carbon, water,
    startedAt: new Date(start).toISOString(),
    completedAt,
    durationMs,
    stepsCompleted,
    stepsFailed,
  };
}

/** Komprimerer fuldt resultat til fladt UI-venligt format. */
export function summarizeAnalysis(result: FullAnalysisResult): AnalysisSummary {
  return {
    ndviValue: result.ndvi?.ndvi ?? null,
    biodiversityScore: result.biodiversity?.score.total ?? null,
    biodiversityClass: result.biodiversity?.score.classification ?? null,
    annualCO2: result.carbon?.estimate.annualSequestration ?? null,
    totalCO2_30yr: result.carbon?.estimate.totalOver30Years ?? null,
    waterRisk: result.water?.risk.overall ?? null,
    waterScore: result.water?.risk.score ?? null,
    p3OverlapHa: result.biodiversity?.score.p3.overlapHa ?? null,
    speciesCount: result.biodiversity?.score.species.species.length ?? null,
    redListedCount: result.biodiversity?.score.species.redListedCount ?? null,
    watercourseDistM: result.water?.risk.nearestWatercourseM ?? null,
  };
}
