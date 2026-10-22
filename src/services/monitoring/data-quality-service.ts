// Data quality service — compute completeness, timeliness, consistency, validation,
// spatial and temporal scores. Returns a plaintext explanation.
import type { MonitoringDevice } from "./devices-service";
import type { DeviceMeasurement } from "./measurements-service";

export interface QualityBreakdown {
  completeness: number; // 0-100
  timeliness: number;
  consistency: number;
  validation: number;
  spatial: number;
  temporal: number;
  overall: number;
  explanation: string;
}

export interface QualityInput {
  device: Pick<MonitoringDevice, "expected_interval_minutes" | "last_seen_at" | "latitude" | "longitude">;
  measurements: Pick<DeviceMeasurement, "measured_at" | "value" | "quality_status" | "latitude" | "longitude">[];
  windowHours: number;
}

export function computeQuality({ device, measurements, windowHours }: QualityInput): QualityBreakdown {
  const interval = device.expected_interval_minutes ?? 60;
  const expected = Math.max(1, Math.floor((windowHours * 60) / interval));
  const completeness = clamp((measurements.length / expected) * 100);

  const latestAge = device.last_seen_at
    ? (Date.now() - new Date(device.last_seen_at).getTime()) / 60_000
    : Number.POSITIVE_INFINITY;
  const timeliness = clamp(100 - (latestAge / interval) * 25);

  const values = measurements.map((m) => m.value).filter((v) => Number.isFinite(v));
  const consistency = values.length > 2 ? clamp(100 - (stdev(values) / (Math.abs(mean(values)) || 1)) * 40) : 60;

  const validated = measurements.filter((m) => m.quality_status !== "invalid").length;
  const validation = measurements.length ? clamp((validated / measurements.length) * 100) : 50;

  const withGeo = measurements.filter((m) => m.latitude != null && m.longitude != null).length;
  const spatial = measurements.length ? clamp((withGeo / measurements.length) * 100) : device.latitude != null ? 80 : 40;

  const temporal = clamp(100 - (temporalGapMinutes(measurements) / interval) * 30);

  const overall = Math.round((completeness + timeliness + consistency + validation + spatial + temporal) / 6);

  return {
    completeness: round(completeness),
    timeliness: round(timeliness),
    consistency: round(consistency),
    validation: round(validation),
    spatial: round(spatial),
    temporal: round(temporal),
    overall,
    explanation: explain({ completeness, timeliness, consistency, validation, spatial, temporal, overall, expected, actual: measurements.length }),
  };
}

function explain(x: { completeness: number; timeliness: number; consistency: number; validation: number; spatial: number; temporal: number; overall: number; expected: number; actual: number }): string {
  const parts: string[] = [];
  parts.push(`${x.actual} af ${x.expected} forventede aflæsninger (${Math.round(x.completeness)}% komplethed).`);
  if (x.timeliness < 70) parts.push("Data er forsinket ift. forventet interval.");
  if (x.consistency < 70) parts.push("Værdier varierer usædvanligt meget.");
  if (x.validation < 90) parts.push("Nogle aflæsninger er markeret ugyldige.");
  if (x.spatial < 60) parts.push("Flere aflæsninger mangler GPS.");
  if (x.temporal < 70) parts.push("Der er huller i tidsserien.");
  if (parts.length === 1 && x.overall >= 85) parts.push("Datakvalitet er god.");
  return parts.join(" ");
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}
function round(v: number): number {
  return Math.round(v * 10) / 10;
}
function mean(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function stdev(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
}
function temporalGapMinutes(measurements: Pick<DeviceMeasurement, "measured_at">[]): number {
  if (measurements.length < 2) return 0;
  const sorted = [...measurements].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].measured_at).getTime() - new Date(sorted[i - 1].measured_at).getTime()) / 60_000;
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap;
}
