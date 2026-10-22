/**
 * CO₂-bindingsmotor
 * Beregner CO₂-sekvestrering for naturprojekter baseret på:
 *   - Vegetationstype (fra NDVI + projekttype)
 *   - Jordbundstype (fra GEUS)
 *   - Areal (ha)
 *   - Projektets fase og alder
 *
 * Metodologi:
 *   - IPCC Tier 1 standardfaktorer for Danmark (Klimazone: Temperate moist)
 *   - DCE Videnskabelig rapport nr. 437 (Nationalt skovprogramma)
 *   - EU Land Use, Land-Use Change and Forestry (LULUCF) Regulation
 *   - Naturstyrelsens vejledning om CO₂-binding i naturarealer (2023)
 */

import { fetchSoilProfile, type SoilProfile, type SoilClass } from "./geus-service";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { saveIndicator } from "@/services/indicators-service";
import { logAuditEvent } from "@/services/audit-service";

// ─── CO₂-sekvestreringsfaktorer (t CO₂/ha/år) ────────────────────────────────
// Kilde: IPCC 2006 GL Supplement 2019, tabel 2.10 + DCE 2023

const SEQUESTRATION_RATES: Record<string, {
  aboveground: number;  // overjordisk biomasse
  belowground: number;  // rodzone
  soil: number;         // jordbund (SOC)
  label: string;
}> = {
  // Naturgenopretning
  oak_woodland:      { aboveground: 4.2, belowground: 1.2, soil: 0.8, label: "Egeskov" },
  mixed_forest:      { aboveground: 5.8, belowground: 1.5, soil: 0.9, label: "Blandet skov" },
  wetland_restored:  { aboveground: 1.2, belowground: 0.4, soil: 8.5, label: "Genvådnet mose/eng" },
  grassland:         { aboveground: 0.8, belowground: 0.6, soil: 1.2, label: "Permanent græsland" },
  heathland:         { aboveground: 0.6, belowground: 0.3, soil: 0.9, label: "Hede" },
  riparian:          { aboveground: 3.5, belowground: 1.1, soil: 2.1, label: "Ådalsnatur" },
  coastal_meadow:    { aboveground: 0.9, belowground: 0.5, soil: 1.8, label: "Strandeng" },
  // Biodiversitetsprojekter
  biodiversity_mix:  { aboveground: 2.8, belowground: 0.9, soil: 1.4, label: "Biodiversitetsareal" },
  // Rewilding
  rewilding:         { aboveground: 3.2, belowground: 1.0, soil: 2.8, label: "Rewilding" },
};

// Jord-boosterfaktor: organisk jord øger kulstoflagring markant
const SOIL_MULTIPLIERS: Record<SoilClass, number> = {
  organic:    2.4,
  humus:      1.6,
  clay:       1.1,
  sandy_clay: 1.0,
  sand:       0.7,
  chalk:      0.6,
  unknown:    1.0,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CarbonEstimate {
  annualSequestration: number;   // t CO₂/år (år 1-10 gennemsnit)
  peakSequestration: number;     // t CO₂/år (år 20-30 ved modenhed)
  totalOver30Years: number;      // samlet t CO₂ over 30 år
  soilCarbonPool: number;        // eksisterende jordbunds-C pool (t CO₂/ha)
  vegetationType: string;
  soilClass: SoilClass;
  methodology: string;
  confidence: "high" | "medium" | "low";
  breakdown: {
    aboveground: number;
    belowground: number;
    soilOrganic: number;
  };
  computedAt: string;
}

export interface CarbonEngineResult {
  projectId: string;
  estimate: CarbonEstimate;
  savedToDb: boolean;
  error?: string;
}

// ─── Vegetationstype fra projektdata ─────────────────────────────────────────

function inferVegetationType(
  projectType: string | null,
  ndvi: number | null,
): keyof typeof SEQUESTRATION_RATES {
  const pt = (projectType ?? "").toLowerCase();

  if (pt.includes("skov") || pt.includes("forest")) return "mixed_forest";
  if (pt.includes("mose") || pt.includes("vådområde") || pt.includes("wetland")) return "wetland_restored";
  if (pt.includes("eng") || pt.includes("strandeng")) return "coastal_meadow";
  if (pt.includes("hede")) return "heathland";
  if (pt.includes("rewilding")) return "rewilding";
  if (pt.includes("ådal") || pt.includes("vandløb") || pt.includes("riparian")) return "riparian";
  if (pt.includes("biodiversitet")) return "biodiversity_mix";
  if (pt.includes("naturgenopretning") || pt.includes("restoration")) return "biodiversity_mix";

  // NDVI-baseret gæt
  if (ndvi != null) {
    if (ndvi >= 0.6) return "mixed_forest";
    if (ndvi >= 0.4) return "grassland";
    if (ndvi >= 0.2) return "heathland";
  }

  return "biodiversity_mix";
}

// ─── Beregning ────────────────────────────────────────────────────────────────

export function computeCarbonEstimate(
  areaHa: number,
  projectType: string | null,
  ndvi: number | null,
  soil: SoilProfile,
  projectAgeYears = 0,
): CarbonEstimate {
  const vegType = inferVegetationType(projectType, ndvi);
  const rates = SEQUESTRATION_RATES[vegType];
  const soilMult = SOIL_MULTIPLIERS[soil.dominantClass];

  // Vækstfase: opbygning over 30 år (logistisk kurve)
  const maturityFactor = Math.min(1, (projectAgeYears + 2) / 25);

  const rawAnnual = (rates.aboveground + rates.belowground + rates.soil) * soilMult;
  const annualSequestration = Math.round(rawAnnual * areaHa * (0.4 + maturityFactor * 0.6) * 10) / 10;
  const peakSequestration = Math.round(rawAnnual * areaHa * 10) / 10;

  // Kumulative over 30 år (trapez-integration)
  const totalOver30Years = Math.round(
    areaHa * soilMult * (
      rates.aboveground * 30 * 0.75 +  // ~75% af peak-rate gennemsnit
      rates.belowground * 30 * 0.70 +
      rates.soil * 30 * 0.85            // jordbund sekvestrerer mere stabilt
    ) * 10
  ) / 10;

  const confidence = soil.mode === "live" && ndvi != null ? "high" :
                     soil.mode === "live" || ndvi != null ? "medium" : "low";

  return {
    annualSequestration,
    peakSequestration,
    totalOver30Years,
    soilCarbonPool: Math.round(soil.carbonDensity * areaHa),
    vegetationType: rates.label,
    soilClass: soil.dominantClass,
    methodology: "IPCC Tier 1 (DK) + DCE 2023 + LULUCF",
    confidence,
    breakdown: {
      aboveground: Math.round(rates.aboveground * areaHa * soilMult * 10) / 10,
      belowground: Math.round(rates.belowground * areaHa * soilMult * 10) / 10,
      soilOrganic: Math.round(rates.soil * areaHa * soilMult * 10) / 10,
    },
    computedAt: new Date().toISOString(),
  };
}

// ─── Fuld pipeline ────────────────────────────────────────────────────────────

export async function runCarbonAnalysis(
  projectId: string,
  lat: number,
  lng: number,
  areaHa: number,
  projectType: string | null,
  ndvi?: number | null,
  startDate?: string | null,
): Promise<CarbonEngineResult> {
  const soil = await fetchSoilProfile(lat, lng);

  const projectAgeYears = startDate
    ? Math.max(0, (Date.now() - new Date(startDate).getTime()) / (365.25 * 86400_000))
    : 0;

  const estimate = computeCarbonEstimate(areaHa, projectType, ndvi ?? null, soil, projectAgeYears);

  const result: CarbonEngineResult = { projectId, estimate, savedToDb: false };

  if (isSupabaseConfigured && supabase) {
    try {
      await saveIndicator({
        project_id: projectId,
        key: "co2_sequestration",
        label: "CO₂-binding",
        category: "climate",
        value: estimate.annualSequestration,
        unit: "t/år",
        trend: "up",
        status: estimate.annualSequestration >= 5 ? "good" : "warning",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("calculated_metrics").upsert(
        {
          project_id: projectId,
          metric_key: "co2_sequestration_annual",
          metric_label: "CO₂-binding (årlig)",
          value: estimate.annualSequestration,
          unit: "t CO₂/år",
          method: "ipcc_tier1_dk",
          properties: {
            peak: estimate.peakSequestration,
            total_30yr: estimate.totalOver30Years,
            soil_carbon_pool: estimate.soilCarbonPool,
            vegetation_type: estimate.vegetationType,
            soil_class: estimate.soilClass,
            confidence: estimate.confidence,
            breakdown: estimate.breakdown,
          },
          calculated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,metric_key" },
      );

      result.savedToDb = true;

      void logAuditEvent({
        project_id: projectId,
        event_type: "data_update",
        title: `CO₂-binding beregnet: ${estimate.annualSequestration} t/år`,
        description: `Vegetationstype: ${estimate.vegetationType} · Jordbund: ${soil.soilLabel} · 30-år total: ${estimate.totalOver30Years} t CO₂`,
        actor: "Kulstofmotor",
        source: "automated",
      });
    } catch (err) {
      result.error = err instanceof Error ? err.message : "DB-fejl";
    }
  }

  return result;
}
