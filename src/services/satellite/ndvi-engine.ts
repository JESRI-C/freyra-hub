/**
 * NDVI Engine
 * Orkestrerer Sentinel-2 data-hentning og gemmer resultater i Supabase.
 * Opdaterer calculated_metrics og indicators automatisk.
 */

import { runNdviPipeline } from "./sentinel-service";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { logAuditEvent } from "@/services/audit-service";
import { saveIndicator } from "@/services/indicators-service";

export interface NdviEngineResult {
  projectId: string;
  ndvi: number | null;
  confidence: string;
  method: string;
  sceneDate: string | null;
  cloudCover: number | null;
  sceneId: string | null;
  savedToDb: boolean;
  error?: string;
}

/**
 * Kører komplet NDVI-beregning for et projekt og gemmer i DB.
 * Kalder Sentinel-2 via Element84 STAC (gratis, ingen nøgle).
 */
export async function runProjectNdvi(
  projectId: string,
  lat: number,
  lng: number,
): Promise<NdviEngineResult> {
  const base = { projectId, savedToDb: false };

  const result = await runNdviPipeline(lat, lng);

  if (result.error || !result.ndvi) {
    return {
      ...base,
      ndvi: null,
      confidence: "none",
      method: "failed",
      sceneDate: null,
      cloudCover: null,
      sceneId: null,
      error: result.error ?? "NDVI beregning fejlede",
    };
  }

  const { ndvi } = result;
  const engineResult: NdviEngineResult = {
    ...base,
    ndvi: ndvi.ndvi,
    confidence: ndvi.confidence,
    method: ndvi.method,
    sceneDate: ndvi.sceneDate,
    cloudCover: ndvi.cloudCover,
    sceneId: ndvi.sceneId,
  };

  // Gem i calculated_metrics
  if (isSupabaseConfigured && supabase) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("calculated_metrics").upsert(
        {
          project_id: projectId,
          metric_key: "ndvi_mean",
          metric_label: "NDVI (Sentinel-2)",
          value: Math.round(ndvi.ndvi * 1000) / 1000,
          unit: null,
          method: ndvi.method,
          properties: {
            scene_id: ndvi.sceneId,
            scene_date: ndvi.sceneDate,
            cloud_cover: ndvi.cloudCover,
            confidence: ndvi.confidence,
          },
          calculated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,metric_key" },
      );

      // Opdatér indikator
      const ndviStatus = ndvi.ndvi >= 0.5 ? "good" : ndvi.ndvi >= 0.3 ? "warning" : "critical";
      const ndviTrend = ndvi.ndvi >= 0.5 ? "up" as const : ndvi.ndvi >= 0.3 ? "stable" as const : "down" as const;

      await saveIndicator({
        project_id: projectId,
        key: "vegetation_index",
        label: "Vegetationsindeks (NDVI)",
        category: "satellite",
        value: Math.round(ndvi.ndvi * 100) / 100,
        unit: "NDVI",
        trend: ndviTrend,
        status: ndviStatus,
      });

      engineResult.savedToDb = true;

      void logAuditEvent({
        project_id: projectId,
        event_type: "data_update",
        title: `NDVI opdateret: ${ndvi.ndvi.toFixed(3)}`,
        description: `Scene: ${ndvi.sceneId ?? "–"} · Skydækning: ${ndvi.cloudCover?.toFixed(1)}% · Metode: ${ndvi.method}`,
        actor: "Sentinel-2 Engine",
        source: "automated",
      });
    } catch (dbErr) {
      engineResult.error = `DB-fejl: ${dbErr instanceof Error ? dbErr.message : "ukendt"}`;
    }
  }

  return engineResult;
}

/**
 * Fortolker NDVI-værdier til menneskelig forståelig tekst.
 */
export function interpretNdvi(ndvi: number): {
  label: string;
  description: string;
  color: string;
} {
  if (ndvi >= 0.6) return { label: "Tæt vegetation", description: "Sund, tæt vegetation. Skov eller høj biomasse.", color: "text-emerald-700" };
  if (ndvi >= 0.4) return { label: "Moderat vegetation", description: "God vegetation. Enge, krat eller ung skov.", color: "text-emerald-600" };
  if (ndvi >= 0.2) return { label: "Spredt vegetation", description: "Lav plantedækning. Overdrev, hede eller bar jord.", color: "text-amber-600" };
  if (ndvi >= 0.1) return { label: "Meget lidt vegetation", description: "Næsten bar overflade. Tør jord eller sten.", color: "text-orange-600" };
  return { label: "Ingen vegetation", description: "Vand, is, by eller bar jord.", color: "text-red-600" };
}

/**
 * Sæsonkorrigeret NDVI: sammenligner med forventet sæsonværdi for Danmark.
 * Returnerer afvigelse i procentpoint.
 */
export function seasonalNdviDelta(ndvi: number, observationDate: string): number {
  const month = new Date(observationDate).getMonth();
  // Dansk vegetationskurve (månedlige gennemsnit)
  const SEASONAL_BASELINE = [0.22, 0.24, 0.32, 0.45, 0.58, 0.65, 0.67, 0.63, 0.55, 0.42, 0.30, 0.23];
  const expected = SEASONAL_BASELINE[month] ?? 0.45;
  return Math.round((ndvi - expected) * 100) / 100;
}
