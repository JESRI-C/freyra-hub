/**
 * NDVI Engine
 * Reads a Sentinel-2 sample. The current pipeline is a centroid window with
 * no local cloud mask or project coverage, so it cannot write project metrics.
 */

import { runNdviPipeline } from "./sentinel-service";

export interface NdviEngineResult {
  projectId: string;
  ndvi: number | null;
  confidence: string;
  method: string;
  sceneDate: string | null;
  cloudCover: number | null;
  sceneId: string | null;
  savedToDb: boolean;
  reportEligible: boolean;
  warnings: string[];
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
  const base = {
    projectId,
    savedToDb: false,
    reportEligible: false,
    warnings: [
      "Punktprøve ved projektets midtpunkt; projektets dækning og lokale skyer/skygger er ikke kontrolleret.",
    ],
  };

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
  if (
    ndvi.method !== "sentinel2_computed" ||
    !Number.isFinite(ndvi.ndvi) ||
    ndvi.ndvi < -1 ||
    ndvi.ndvi > 1
  ) {
    return {
      ...base,
      ndvi: null,
      confidence: "none",
      method: ndvi.method,
      sceneDate: ndvi.sceneDate,
      cloudCover: ndvi.cloudCover,
      sceneId: ndvi.sceneId,
      error:
        "Ingen dokumenteret NDVI-båndberegning. Thumbnail- og sæsonestimater bruges ikke som målinger.",
    };
  }
  const engineResult: NdviEngineResult = {
    ...base,
    ndvi: ndvi.ndvi,
    confidence: ndvi.confidence,
    method: ndvi.method,
    sceneDate: ndvi.sceneDate,
    cloudCover: ndvi.cloudCover,
    sceneId: ndvi.sceneId,
  };

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
  if (ndvi >= 0.6)
    return {
      label: "Tæt vegetation",
      description:
        "Høj indeksværdi i punktprøven. Arten, biomassen og naturtilstanden er ikke målt.",
      color: "text-foreground",
    };
  if (ndvi >= 0.4)
    return {
      label: "Moderat vegetation",
      description:
        "Moderat indeksværdi i punktprøven; blandede pixels og billedkvalitet påvirker fortolkningen.",
      color: "text-foreground",
    };
  if (ndvi >= 0.2)
    return {
      label: "Spredt vegetation",
      description: "Lavere indeksværdi i punktprøven; den fysiske plantedækning er ikke opmålt.",
      color: "text-foreground",
    };
  if (ndvi >= 0.1)
    return {
      label: "Meget lidt vegetation",
      description: "Lav indeksværdi i punktprøven; overfladetype kræver kontrol af billedet.",
      color: "text-foreground",
    };
  return {
    label: "Lav eller negativ NDVI",
    description:
      "Kan bl.a. forekomme ved vand, bar jord eller billedforstyrrelser; dokumenterer ikke fravær af vegetation.",
    color: "text-foreground",
  };
}

/**
 * Sæsonkorrigeret NDVI: sammenligner med forventet sæsonværdi for Danmark.
 * Returnerer afvigelse i procentpoint.
 */
export function seasonalNdviDelta(ndvi: number, observationDate: string): number {
  const month = new Date(observationDate).getMonth();
  // Dansk vegetationskurve (månedlige gennemsnit)
  const SEASONAL_BASELINE = [0.22, 0.24, 0.32, 0.45, 0.58, 0.65, 0.67, 0.63, 0.55, 0.42, 0.3, 0.23];
  const expected = SEASONAL_BASELINE[month] ?? 0.45;
  return Math.round((ndvi - expected) * 100) / 100;
}
