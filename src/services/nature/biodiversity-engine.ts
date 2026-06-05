/**
 * Biodiversitetsindeks Engine
 * Beregner en samlet biodiversitetsscore 0-100 baseret på:
 *   - NDVI (vegetation sundhed)          vægt 25%
 *   - §3-naturdækning                    vægt 25%
 *   - Artsdiversitet (antal grupper)     vægt 20%
 *   - Fredede og rødlistede arter        vægt 20%
 *   - Habitatvariation (naturtyper)      vægt 10%
 *
 * Metodologi inspireret af DCE Biodiversitetsindeks og
 * Naturstyrelsens moniteringsramme for §3-natur.
 */

import { fetchNatureData, type Paragraph3Result, type BiodiversityDataResult } from "./paragraph3-service";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { saveIndicator } from "@/services/indicators-service";
import { logAuditEvent } from "@/services/audit-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BiodiversityScore {
  total: number;            // 0-100
  components: {
    vegetation: number;     // NDVI-baseret 0-100
    habitatCoverage: number; // §3-dækning 0-100
    speciesDiversity: number; // Antal grupper 0-100
    protectedSpecies: number; // Fredede/rødlistede 0-100
    habitatVariety: number;  // Antal naturtyper 0-100
  };
  classification: "Meget høj" | "Høj" | "Moderat" | "Lav" | "Meget lav";
  trend: "up" | "stable" | "down";
  confidence: "high" | "medium" | "low";
  p3: Paragraph3Result;
  species: BiodiversityDataResult;
  computedAt: string;
}

export interface BiodiversityEngineResult {
  projectId: string;
  score: BiodiversityScore;
  savedToDb: boolean;
  error?: string;
}

// ─── Scoringsmodel ────────────────────────────────────────────────────────────

const WEIGHTS = {
  vegetation:        0.25,
  habitatCoverage:   0.25,
  speciesDiversity:  0.20,
  protectedSpecies:  0.20,
  habitatVariety:    0.10,
};

/**
 * Beregner biodiversitetsscore fra rå data.
 */
export function computeBiodiversityScore(
  ndvi: number | null,
  p3: Paragraph3Result,
  species: BiodiversityDataResult,
  projectAreaHa: number,
): BiodiversityScore {
  // Komponent 1: Vegetation (NDVI 0→1 = score 0→100)
  const vegetationScore = ndvi != null
    ? Math.round(Math.max(0, Math.min(1, ndvi)) * 100)
    : 50; // middelværdi hvis ikke tilgængeligt

  // Komponent 2: §3-habitatdækning (% af projektareal der er §3)
  const habitatCoverageScore = Math.round(Math.min(100, p3.overlapPercent * 1.5));
  // *1.5 fordi selv 67% §3-dækning er exceptionelt

  // Komponent 3: Artsdiversitet (antal biologiske grupper 0-8+)
  const groupCount = Object.keys(species.groupDiversity).length;
  const speciesDiversityScore = Math.round(Math.min(100, (groupCount / 8) * 100));

  // Komponent 4: Fredede og rødlistede arter
  const totalSpecies = species.species.length;
  if (totalSpecies === 0) {
    var protectedScore = 30; // ingen data = lav score
  } else {
    const protectedRatio = (species.protectedCount + species.redListedCount * 2) / totalSpecies;
    var protectedScore = Math.round(Math.min(100, protectedRatio * 200));
  }

  // Komponent 5: Habitatvariation (antal §3-typer)
  const typeCount = p3.natureTypes.length;
  const habitatVarietyScore = Math.round(Math.min(100, (typeCount / 6) * 100));

  // Vægtet total
  const total = Math.round(
    vegetationScore    * WEIGHTS.vegetation +
    habitatCoverageScore * WEIGHTS.habitatCoverage +
    speciesDiversityScore * WEIGHTS.speciesDiversity +
    protectedScore     * WEIGHTS.protectedSpecies +
    habitatVarietyScore * WEIGHTS.habitatVariety
  );

  const classification = classifyScore(total);

  // Confidence baseret på datakvalitet
  const hasRealData = p3.mode === "live" && species.mode === "live";
  const confidence = hasRealData && ndvi != null ? "high" :
                     hasRealData || ndvi != null ? "medium" : "low";

  return {
    total,
    components: {
      vegetation: vegetationScore,
      habitatCoverage: habitatCoverageScore,
      speciesDiversity: speciesDiversityScore,
      protectedSpecies: protectedScore,
      habitatVariety: habitatVarietyScore,
    },
    classification,
    trend: "stable", // beregnes ved næste kørsel via historik
    confidence,
    p3,
    species,
    computedAt: new Date().toISOString(),
  };
}

function classifyScore(score: number): BiodiversityScore["classification"] {
  if (score >= 75) return "Meget høj";
  if (score >= 55) return "Høj";
  if (score >= 35) return "Moderat";
  if (score >= 20) return "Lav";
  return "Meget lav";
}

// ─── Fuld pipeline ────────────────────────────────────────────────────────────

/**
 * Kører komplet biodiversitetsanalyse for et projekt.
 * Henter §3 + artsobservationer + kombinerer med NDVI.
 * Gemmer automatisk i indicators og calculated_metrics.
 */
export async function runBiodiversityAnalysis(
  projectId: string,
  lat: number,
  lng: number,
  areaHa: number,
  ndvi?: number | null,
): Promise<BiodiversityEngineResult> {
  const { p3, species } = await fetchNatureData(lat, lng, areaHa);
  const score = computeBiodiversityScore(ndvi ?? null, p3, species, areaHa);

  const result: BiodiversityEngineResult = {
    projectId,
    score,
    savedToDb: false,
  };

  // Gem i database
  if (isSupabaseConfigured && supabase) {
    try {
      // Gem biodiversitetsindeks
      await saveIndicator({
        project_id: projectId,
        key: "biodiversity_index",
        label: "Biodiversitetsindeks",
        category: "biodiversity",
        value: score.total,
        unit: "point",
        trend: score.trend,
        status: score.total >= 55 ? "good" : score.total >= 35 ? "warning" : "critical",
      });

      // Gem §3-overlap som metric
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("calculated_metrics").upsert(
        [
          {
            project_id: projectId,
            metric_key: "protected_nature_overlap_ha",
            metric_label: "Beskyttet natur overlap",
            value: p3.overlapHa,
            unit: "ha",
            method: p3.mode === "live" ? "miljoeportal_wfs" : "simulated",
            properties: {
              nature_types: p3.natureTypes,
              overlap_percent: p3.overlapPercent,
              area_count: p3.areas.length,
            },
            calculated_at: new Date().toISOString(),
          },
          {
            project_id: projectId,
            metric_key: "species_richness",
            metric_label: "Artsdiversitet",
            value: species.species.length,
            unit: "arter",
            method: species.mode === "live" ? "naturbasen_api" : "simulated",
            properties: {
              protected_count: species.protectedCount,
              red_listed_count: species.redListedCount,
              group_diversity: species.groupDiversity,
            },
            calculated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "project_id,metric_key" },
      );

      // Gem artsindikatorer
      await saveIndicator({
        project_id: projectId,
        key: "species_richness",
        label: "Registrerede arter",
        category: "biodiversity",
        value: species.species.length,
        unit: "arter",
        trend: "stable",
        status: species.species.length >= 10 ? "good" : "warning",
      });

      await saveIndicator({
        project_id: projectId,
        key: "protected_nature_ha",
        label: "Beskyttet natur (§3)",
        category: "nature",
        value: p3.overlapHa,
        unit: "ha",
        trend: "stable",
        status: p3.overlapPercent >= 30 ? "good" : "warning",
      });

      result.savedToDb = true;

      void logAuditEvent({
        project_id: projectId,
        event_type: "data_update",
        title: `Biodiversitetsindeks beregnet: ${score.total}/100 (${score.classification})`,
        description: [
          `§3-natur: ${p3.overlapHa} ha (${p3.overlapPercent}%)`,
          `Arter: ${species.species.length} (${species.protectedCount} fredede, ${species.redListedCount} rødlistede)`,
          `NDVI: ${ndvi?.toFixed(2) ?? "ikke tilgængeligt"}`,
        ].join(" · "),
        actor: "Biodiversitetsmotor",
        source: "automated",
      });
    } catch (dbErr) {
      result.error = dbErr instanceof Error ? dbErr.message : "DB-fejl";
    }
  }

  return result;
}

// ─── Anbefalinger ─────────────────────────────────────────────────────────────

export interface BiodiversityRecommendation {
  priority: "Høj" | "Medium" | "Lav";
  title: string;
  rationale: string;
  component: keyof BiodiversityScore["components"];
}

/**
 * Genererer handlingsanbefalinger baseret på score-komponenter.
 */
export function generateRecommendations(score: BiodiversityScore): BiodiversityRecommendation[] {
  const recs: BiodiversityRecommendation[] = [];
  const c = score.components;

  if (c.vegetation < 40) {
    recs.push({
      priority: "Høj",
      title: "Forbedr vegetationsdækning",
      rationale: `NDVI-score ${c.vegetation}/100 indikerer lav biomasse. Overvej plantning af hjemmehørende urter og buske.`,
      component: "vegetation",
    });
  }

  if (c.habitatCoverage < 30) {
    recs.push({
      priority: "Høj",
      title: "Etablér §3-naturarealer",
      rationale: `Kun ${score.p3.overlapPercent}% af arealet er §3-beskyttet natur. Overvej etablering af eng eller mose.`,
      component: "habitatCoverage",
    });
  }

  if (c.speciesDiversity < 40) {
    recs.push({
      priority: "Medium",
      title: "Øg artsdiversiteten",
      rationale: `Kun ${Object.keys(score.species.groupDiversity).length} biologiske grupper registreret. Strukturel variation (vandhuller, læhegn) tiltrækker flere grupper.`,
      component: "speciesDiversity",
    });
  }

  if (c.habitatVariety < 50) {
    recs.push({
      priority: "Medium",
      title: "Skab habitatvariation",
      rationale: `${score.p3.natureTypes.length} naturtyper registreret. Mosaiklandskab med flere naturtyper øger biodiversitetspotentialet.`,
      component: "habitatVariety",
    });
  }

  if (c.protectedSpecies < 30) {
    recs.push({
      priority: "Lav",
      title: "Styrk levesteder for fredede arter",
      rationale: `Lav forekomst af fredede og rødlistede arter. Fjernelse af invasive arter og øget ro i kerneområder kan hjælpe.`,
      component: "protectedSpecies",
    });
  }

  return recs;
}
