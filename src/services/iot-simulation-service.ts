// GoFreyra IoT Simulation Service
// Generates deterministic, simulated field sensor data for project maps and dashboards.

export type SensorType =
  | "soil_moisture"
  | "soil_temperature"
  | "air_temperature"
  | "humidity"
  | "water_level"
  | "biodiversity_audio_index"
  | "co2_estimate"
  | "battery_level"
  | "signal_strength";

export type SensorStatus = "online" | "warning" | "offline";

export interface IoTSensor {
  id: string;
  projectId: string;
  label: string;
  coordinates: { lat: number; lng: number };
  type: SensorType;
  latestValue: number;
  unit: string;
  status: SensorStatus;
  lastSeen: string; // ISO
  trend: "up" | "down" | "stable";
  batteryPercent: number;
  signalStrength: number; // 0–100
  simulated: true;
}

// ─── Labels & units ──────────────────────────────────────────────────────────

export const SENSOR_TYPE_LABELS: Record<SensorType, string> = {
  soil_moisture: "Jordfugt",
  soil_temperature: "Jordtemperatur",
  air_temperature: "Lufttemperatur",
  humidity: "Luftfugtighed",
  water_level: "Vandstand",
  biodiversity_audio_index: "Biodiversitetsindeks (lyd)",
  co2_estimate: "CO₂-estimat",
  battery_level: "Batteriniveau",
  signal_strength: "Signalstyrke",
};

export const SENSOR_TYPE_UNITS: Record<SensorType, string> = {
  soil_moisture: "%",
  soil_temperature: "°C",
  air_temperature: "°C",
  humidity: "%",
  water_level: "m",
  biodiversity_audio_index: "BAI",
  co2_estimate: "ppm",
  battery_level: "%",
  signal_strength: "%",
};

// ─── Realistic value ranges ──────────────────────────────────────────────────

interface ValueRange {
  min: number;
  max: number;
  decimals: number;
}

const VALUE_RANGES: Record<SensorType, ValueRange> = {
  soil_moisture:           { min: 20,  max: 80,  decimals: 1 },
  soil_temperature:        { min: 8,   max: 22,  decimals: 1 },
  air_temperature:         { min: 10,  max: 25,  decimals: 1 },
  humidity:                { min: 40,  max: 90,  decimals: 1 },
  water_level:             { min: 0.1, max: 1.5, decimals: 2 },
  biodiversity_audio_index:{ min: 0.3, max: 0.9, decimals: 2 },
  co2_estimate:            { min: 380, max: 450, decimals: 0 },
  battery_level:           { min: 20,  max: 100, decimals: 0 },
  signal_strength:         { min: 30,  max: 100, decimals: 0 },
};

// Cycle of sensor types used when generating a set of project sensors
const CYCLING_TYPES: SensorType[] = [
  "soil_moisture",
  "soil_temperature",
  "air_temperature",
  "humidity",
  "water_level",
  "biodiversity_audio_index",
];

const SENSOR_LABELS: string[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

// ─── Deterministic seeded pseudo-random helpers ───────────────────────────────

/** Simple integer seed from a string (sum of char codes). */
function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h) || 1;
}

/** LCG pseudo-random number generator — returns a new seed and a [0, 1) value. */
function lcgNext(seed: number): { seed: number; value: number } {
  // Park-Miller LCG parameters
  const next = (seed * 1_664_525 + 1_013_904_223) & 0xffffffff;
  return { seed: next, value: Math.abs(next) / 0x100000000 };
}

/** Generate a deterministic float in [min, max] using successive LCG steps. */
function seededFloat(
  seed: number,
  min: number,
  max: number,
  decimals: number,
): { seed: number; value: number } {
  const { seed: next, value } = lcgNext(seed);
  const raw = min + value * (max - min);
  const rounded = parseFloat(raw.toFixed(decimals));
  return { seed: next, value: rounded };
}

/** Choose one of three trend values deterministically. */
function seededTrend(seed: number): { seed: number; value: "up" | "down" | "stable" } {
  const { seed: next, value } = lcgNext(seed);
  const idx = Math.floor(value * 3);
  const trends = ["up", "down", "stable"] as const;
  return { seed: next, value: trends[idx] ?? "stable" };
}

// ─── Core generation ─────────────────────────────────────────────────────────

/**
 * Generate a deterministic set of simulated sensors for a project.
 * The same projectId + centroid always produces the same sensor layout.
 */
export function generateProjectSensors(
  projectId: string,
  centroid: { lat: number; lng: number },
  count = 6,
): IoTSensor[] {
  let seed = seedFromString(projectId);
  const sensors: IoTSensor[] = [];

  // ~500m radius in degrees: 500m / 111_320m per degree ≈ 0.00449°
  const radiusDeg = 0.0045;

  for (let i = 0; i < count; i++) {
    const type = CYCLING_TYPES[i % CYCLING_TYPES.length] as SensorType;
    const range = VALUE_RANGES[type];
    const letter = SENSOR_LABELS[i % SENSOR_LABELS.length] ?? String(i + 1);
    const label = `Sensor ${letter} — ${SENSOR_TYPE_LABELS[type]}`;

    // Spread sensors around the centroid using deterministic angles/distances
    const { seed: s1, value: angleFrac } = lcgNext(seed);
    seed = s1;
    const { seed: s2, value: distFrac } = lcgNext(seed);
    seed = s2;

    const angle = angleFrac * 2 * Math.PI;
    const dist = 0.2 * radiusDeg + distFrac * 0.8 * radiusDeg;
    const lat = centroid.lat + dist * Math.sin(angle);
    const lng = centroid.lng + dist * Math.cos(angle);

    // Sensor value
    const { seed: s3, value: latestValue } = seededFloat(seed, range.min, range.max, range.decimals);
    seed = s3;

    // Battery (15–100)
    const { seed: s4, value: batteryPercent } = seededFloat(seed, 15, 100, 0);
    seed = s4;

    // Signal (40–100)
    const { seed: s5, value: signalStrength } = seededFloat(seed, 40, 100, 0);
    seed = s5;

    // Trend
    const { seed: s6, value: trend } = seededTrend(seed);
    seed = s6;

    // Status derived from battery
    const status: SensorStatus =
      batteryPercent < 20 ? "offline" : batteryPercent < 40 ? "warning" : "online";

    // lastSeen: deterministically offset from "now" by 0–120 min
    const { seed: s7, value: ageFrac } = lcgNext(seed);
    seed = s7;
    const ageMs = Math.floor(ageFrac * 120 * 60 * 1000);
    const lastSeen = new Date(Date.now() - ageMs).toISOString();

    sensors.push({
      id: `sim-${projectId}-${i}`,
      projectId,
      label,
      coordinates: {
        lat: parseFloat(lat.toFixed(6)),
        lng: parseFloat(lng.toFixed(6)),
      },
      type,
      latestValue,
      unit: SENSOR_TYPE_UNITS[type],
      status,
      lastSeen,
      trend,
      batteryPercent: Math.round(batteryPercent),
      signalStrength: Math.round(signalStrength),
      simulated: true,
    });
  }

  return sensors;
}

/**
 * Return a slightly varied reading for a sensor to simulate live data.
 * Adds ±5% noise to the latest value.
 */
export function getLiveReading(sensor: IoTSensor): number {
  const range = VALUE_RANGES[sensor.type];
  const noise = (Math.random() - 0.5) * 0.1 * sensor.latestValue;
  const raw = sensor.latestValue + noise;
  // Clamp to valid range
  const clamped = Math.min(range.max, Math.max(range.min, raw));
  return parseFloat(clamped.toFixed(range.decimals));
}

/**
 * Get all sensors for a project with slightly varied live readings.
 * Sensors themselves are deterministic; readings have small random noise.
 */
export function getProjectSensors(
  projectId: string,
  centroid: { lat: number; lng: number },
): IoTSensor[] {
  const base = generateProjectSensors(projectId, centroid);
  return base.map((s) => ({ ...s, latestValue: getLiveReading(s) }));
}
