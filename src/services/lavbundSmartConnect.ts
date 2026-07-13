// Smart Connect-adapter (stub) for LavbundsMRV.
// Normaliserer eksterne sensor-payloads til VandstandsReading. Bruges når
// realtids-koblingen aktiveres. Alt output er markeret med "kilde" så UI kan
// vise "demodata" indtil live-flow er live.
import type { VandstandsReading } from "@/types/lavbund";

/** Rå HOBO-logger-payload (fx via webhook). */
export interface HoboPayload {
  serial: string;
  maalepunktId: string;
  samples: Array<{ t: string; waterDepthCm: number }>;
}

/** Rå InSAR/drone-DEM-payload. */
export interface DEMPayload {
  maalepunktId: string;
  captureIso: string;
  demHeightM: number;
  referenceHeightM: number;
  source: "drone_dem" | "insar";
}

export interface AdapterResultat {
  ok: boolean;
  readings: VandstandsReading[];
  fejl: string[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** cm under terræn → m dybde (positiv = grundvandsspejlet UNDER terræn). */
export function normalizeHoboPayload(p: HoboPayload): AdapterResultat {
  const readings: VandstandsReading[] = [];
  const fejl: string[] = [];
  if (!p.maalepunktId) fejl.push("HOBO-payload mangler maalepunktId");
  for (const [i, s] of p.samples.entries()) {
    if (!s.t || Number.isNaN(Date.parse(s.t))) {
      fejl.push(`Sample #${i}: ugyldigt tidsstempel`);
      continue;
    }
    if (!isFiniteNumber(s.waterDepthCm)) {
      fejl.push(`Sample #${i}: ugyldig waterDepthCm`);
      continue;
    }
    readings.push({
      maalepunktId: p.maalepunktId,
      tidspunkt: new Date(s.t).toISOString(),
      dybdeM: s.waterDepthCm / 100,
      kilde: "hobo_logger",
    });
  }
  return { ok: fejl.length === 0, readings, fejl };
}

/** DEM → grundvandsdybde ift. referenceflade. */
export function normalizeDEMPayload(p: DEMPayload): AdapterResultat {
  const fejl: string[] = [];
  if (!p.maalepunktId) fejl.push("DEM-payload mangler maalepunktId");
  if (!isFiniteNumber(p.demHeightM) || !isFiniteNumber(p.referenceHeightM))
    fejl.push("DEM-payload mangler numeriske højder");
  if (!p.captureIso || Number.isNaN(Date.parse(p.captureIso)))
    fejl.push("DEM-payload mangler gyldigt captureIso");
  if (fejl.length > 0) return { ok: false, readings: [], fejl };
  const dybdeM = Math.max(0, p.referenceHeightM - p.demHeightM);
  return {
    ok: true,
    fejl: [],
    readings: [
      {
        maalepunktId: p.maalepunktId,
        tidspunkt: new Date(p.captureIso).toISOString(),
        dybdeM,
        kilde: p.source,
      },
    ],
  };
}
