/**
 * Vandkvalitetsrisiko Engine
 * Beregner risiko for påvirkning af vandmiljøet fra et projektområde.
 * Baseret på EU Vandrammedirektiv (WFD) og dansk implementering.
 *
 * Risikofaktorer:
 *   1. Jordbundstype (infiltration + filtreringsevne)
 *   2. Terrænhældning (afstrømningshastighed)
 *   3. Afstand til nærmeste vandløb/sø
 *   4. Vegetationsdækning (NDVI som bufferfaktor)
 *   5. Projekttype (forurensningskilder)
 */

import { type SoilProfile, type TerrainProfile, fetchSoilProfile, fetchTerrainProfile } from "./geus-service";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { saveIndicator } from "@/services/indicators-service";
import { logAuditEvent } from "@/services/audit-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = "Meget lav" | "Lav" | "Moderat" | "Høj" | "Meget høj";

export interface WaterQualityRisk {
  overall: RiskLevel;
  score: number;           // 0-100 (høj = høj risiko)
  components: {
    soilRunoff: number;    // 0-100
    slopeAcceleration: number;
    watercourseProximity: number;
    vegetationBuffer: number;  // lav score = god buffer = lav risiko
    projectImpact: number;
  };
  nearestWatercourseM: number | null;
  mitigationRequired: boolean;
  recommendations: string[];
  methodology: "WFD_DK_2023";
  computedAt: string;
}

export interface WaterQualityResult {
  projectId: string;
  risk: WaterQualityRisk;
  savedToDb: boolean;
  error?: string;
}

// ─── Vandløbsafstand fra Miljøportal ─────────────────────────────────────────

async function fetchNearestWatercourseDistance(lat: number, lng: number): Promise<number | null> {
  try {
    const bbox = `${lng - 0.05},${lat - 0.05},${lng + 0.05},${lat + 0.05}`;
    const params = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: "mp:vandloeb",
      outputFormat: "application/json",
      bbox: `${bbox},EPSG:4326`,
      srsName: "EPSG:4326",
      count: "5",
    });

    const res = await fetch(`https://arealdata.miljoeportal.dk/gis/ows?${params}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      features?: Array<{
        geometry?: {
          type: string;
          coordinates: number[][];
        };
      }>;
    };

    const features = json.features ?? [];
    if (features.length === 0) return null;

    // Beregn afstand til nærmeste koordinat i vandløb
    let minDistM = Infinity;
    const R = 6371000; // jordens radius i meter

    features.forEach((f) => {
      const coords = f.geometry?.coordinates ?? [];
      coords.forEach(([wLng, wLat]) => {
        const dLat = ((wLat - lat) * Math.PI) / 180;
        const dLng = ((wLng - lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos((lat * Math.PI) / 180) * Math.cos((wLat * Math.PI) / 180) *
                  Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (dist < minDistM) minDistM = dist;
      });
    });

    return minDistM === Infinity ? null : Math.round(minDistM);
  } catch {
    return null;
  }
}

// ─── Risikoscoring ────────────────────────────────────────────────────────────

function scoreRunoffRisk(soil: SoilProfile): number {
  // Lav infiltration = høj afstrømningsrisiko
  const base: Record<string, number> = {
    high: 20,    // sand: hurtig infiltration, men ingen filtrering
    medium: 50,  // leret sand: moderat
    low: 80,     // ler/organisk: langsom infiltration, høj overflade-afstrømning
  };
  // Ler giver høj afstrømningsrisiko
  const soilExtra = soil.dominantClass === "clay" ? 10 :
                    soil.dominantClass === "organic" ? -10 : 0; // organisk filtrerer godt
  return Math.min(100, (base[soil.infiltrationRate] ?? 50) + soilExtra);
}

function scoreSlopeRisk(terrain: TerrainProfile): number {
  // Stejl hældning = hurtigere afstrømning = højere risiko
  const base: Record<string, number> = { flat: 5, gentle: 25, moderate: 60, steep: 90 };
  return base[terrain.aspect] ?? 25;
}

function scoreProximityRisk(distanceM: number | null): number {
  if (distanceM === null) return 40; // ukendt = moderat risiko
  if (distanceM < 50)  return 95;
  if (distanceM < 100) return 80;
  if (distanceM < 200) return 60;
  if (distanceM < 500) return 35;
  if (distanceM < 1000) return 15;
  return 5;
}

function scoreVegetationBuffer(ndvi: number | null): number {
  // Høj NDVI = god buffer = lav risiko-score
  if (ndvi === null) return 50;
  return Math.round(Math.max(5, (1 - ndvi) * 80));
}

function scoreProjectImpact(projectType: string | null): number {
  const pt = (projectType ?? "").toLowerCase();
  // Naturprojekter reducerer risiko; byggeri øger den
  if (pt.includes("natur") || pt.includes("biodiversitet") || pt.includes("rewilding")) return 10;
  if (pt.includes("eng") || pt.includes("vådområde") || pt.includes("skov")) return 15;
  if (pt.includes("parkering") || pt.includes("logistik") || pt.includes("bolig")) return 80;
  if (pt.includes("erhverv") || pt.includes("industri")) return 85;
  if (pt.includes("construction") || pt.includes("byggeri")) return 75;
  return 30;
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return "Meget høj";
  if (score >= 55) return "Høj";
  if (score >= 35) return "Moderat";
  if (score >= 15) return "Lav";
  return "Meget lav";
}

function generateMitigationRecs(
  components: WaterQualityRisk["components"],
  risk: RiskLevel,
  distanceM: number | null,
): string[] {
  const recs: string[] = [];

  if (components.soilRunoff > 60) {
    recs.push("Etablér infiltrationsbassiner eller regnbede for at reducere direkte afstrømning");
  }
  if (components.slopeAcceleration > 50) {
    recs.push("Terrænformning med erosionssikring på hældede arealer");
  }
  if (distanceM !== null && distanceM < 100) {
    recs.push("Buffer-bræmme på min. 10m til vandløb er lovpligtig (Vandløbsloven §69)");
  }
  if (components.vegetationBuffer > 60) {
    recs.push("Etablér vegetation langs vandløb som naturlig filtreringsbuffer");
  }
  if (risk === "Høj" || risk === "Meget høj") {
    recs.push("Udarbejd hydraulisk beregning og ansøg om tilladelse hos kommunen");
    recs.push("Overvej sedimentfælder og olieudskiller ved befæstede arealer");
  }

  return recs;
}

// ─── Fuld pipeline ────────────────────────────────────────────────────────────

export async function runWaterQualityAnalysis(
  projectId: string,
  lat: number,
  lng: number,
  projectType: string | null,
  ndvi?: number | null,
): Promise<WaterQualityResult> {
  const [soil, terrain, watercourseDistM] = await Promise.all([
    fetchSoilProfile(lat, lng),
    fetchTerrainProfile(lat, lng),
    fetchNearestWatercourseDistance(lat, lng),
  ]);

  const components: WaterQualityRisk["components"] = {
    soilRunoff:           scoreRunoffRisk(soil),
    slopeAcceleration:    scoreSlopeRisk(terrain),
    watercourseProximity: scoreProximityRisk(watercourseDistM),
    vegetationBuffer:     scoreVegetationBuffer(ndvi ?? null),
    projectImpact:        scoreProjectImpact(projectType),
  };

  // Vægtet score
  const score = Math.round(
    components.soilRunoff          * 0.20 +
    components.slopeAcceleration   * 0.20 +
    components.watercourseProximity * 0.30 +
    components.vegetationBuffer    * 0.15 +
    components.projectImpact       * 0.15,
  );

  const overall = scoreToLevel(score);
  const mitigationRequired = score >= 55;
  const recommendations = generateMitigationRecs(components, overall, watercourseDistM);

  const risk: WaterQualityRisk = {
    overall,
    score,
    components,
    nearestWatercourseM: watercourseDistM,
    mitigationRequired,
    recommendations,
    methodology: "WFD_DK_2023",
    computedAt: new Date().toISOString(),
  };

  const result: WaterQualityResult = { projectId, risk, savedToDb: false };

  if (isSupabaseConfigured && supabase) {
    try {
      await saveIndicator({
        project_id: projectId,
        key: "water_quality_risk",
        label: "Vandkvalitetsrisiko",
        category: "water",
        value: score,
        unit: "point",
        trend: "stable",
        status: score < 35 ? "good" : score < 55 ? "warning" : "critical",
      });

      if (watercourseDistM !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("calculated_metrics").upsert(
          {
            project_id: projectId,
            metric_key: "nearest_watercourse_distance_m",
            metric_label: "Nærmeste vandløb",
            value: watercourseDistM,
            unit: "m",
            method: "miljoeportal_wfs",
            properties: { risk_level: overall, risk_score: score },
            calculated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,metric_key" },
        );
      }

      result.savedToDb = true;

      void logAuditEvent({
        project_id: projectId,
        event_type: "data_update",
        title: `Vandkvalitetsrisiko: ${overall} (score ${score}/100)`,
        description: [
          watercourseDistM ? `Nærmeste vandløb: ${watercourseDistM}m` : null,
          `Jordbund: ${soil.soilLabel}`,
          `Hældning: ${terrain.aspect}`,
          mitigationRequired ? "⚠️ Afhjælpning påkrævet" : null,
        ].filter(Boolean).join(" · "),
        actor: "Vandkvalitetsmotor",
        source: "automated",
      });
    } catch (err) {
      result.error = err instanceof Error ? err.message : "DB-fejl";
    }
  }

  return result;
}
