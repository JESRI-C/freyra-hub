import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { requireCustomerDatabase } from "@/lib/data-mode";
import { deriveDeviceStatus, type DeviceStatus, type MonitoringDevice } from "./devices-service";
import { listMeasurements, type DeviceMeasurement } from "./measurements-service";

export interface MapDevice {
  id: string;
  projectId: string;
  label: string;
  deviceType: string;
  dataClassification: "synthetic" | "unverified";
  signalStrength: number | null;
  trend: "up" | "down" | "stable" | null;
  status: DeviceStatus;
  batteryPercent: number | null;
  lastSeen: string | null;
  coordinates: {
    lat: number;
    lng: number;
    source: "measurement" | "registered";
    recordedAt: string | null;
  } | null;
  measurement: {
    id: string;
    value: number;
    unit: string | null;
    measuredAt: string;
    qualityStatus: string;
  } | null;
}
export interface ProjectMapDevices {
  devices: MapDevice[];
}
function isSynthetic(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "synthetic" in value &&
    value.synthetic === true
  );
}
function position(lat: number | null, lng: number | null) {
  return lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}
export function toMapDevice(
  device: MonitoringDevice,
  latest: DeviceMeasurement | null,
  previous: DeviceMeasurement | null = null,
): MapDevice {
  const measured = latest ? position(latest.latitude, latest.longitude) : null;
  const registered = position(device.latitude, device.longitude);
  const validSeen =
    device.last_seen_at &&
    Number.isFinite(Date.parse(device.last_seen_at)) &&
    Date.parse(device.last_seen_at) <= Date.now();
  return {
    id: device.id,
    projectId: device.project_id,
    label: device.name,
    deviceType: device.device_type,
    dataClassification:
      isSynthetic(device.configuration) || isSynthetic(latest?.source_payload)
        ? "synthetic"
        : "unverified",
    signalStrength: device.signal_strength,
    trend:
      latest &&
      previous &&
      latest.parameter_id &&
      latest.parameter_id === previous.parameter_id &&
      latest.unit &&
      latest.unit === previous.unit &&
      latest.quality_status === "valid" &&
      previous.quality_status === "valid" &&
      Number.isFinite(latest.value) &&
      Number.isFinite(previous.value) &&
      Date.parse(latest.measured_at) > Date.parse(previous.measured_at) &&
      Date.parse(latest.measured_at) <= Date.now()
        ? latest.value > previous.value
          ? "up"
          : latest.value < previous.value
            ? "down"
            : "stable"
        : null,
    status:
      !validSeen && device.status !== "not_activated" ? "offline" : deriveDeviceStatus(device),
    batteryPercent: device.battery_level,
    lastSeen: device.last_seen_at,
    coordinates: measured
      ? { ...measured, source: "measurement", recordedAt: latest!.measured_at }
      : registered
        ? { ...registered, source: "registered", recordedAt: null }
        : null,
    measurement:
      latest && Number.isFinite(latest.value)
        ? {
            id: latest.id,
            value: latest.value,
            unit: latest.unit,
            measuredAt: latest.measured_at,
            qualityStatus: latest.quality_status,
          }
        : null,
  };
}

/** All reads use the initiating actor's token and ordinary RLS. No simulation. */
export async function getProjectMapDevices(
  projectId: string,
  actorId: string,
): Promise<ProjectMapDevices> {
  requireCustomerDatabase();
  if (!projectId || !actorId) throw Error("Sag og bruger skal være valgt.");
  const db = createActorBoundSupabaseClient(actorId);
  const devices: MonitoringDevice[] = [];
  let total: number | null = null;
  for (let offset = 0; ; ) {
    const result = await db
      .from("monitoring_devices")
      .select("*", { count: "exact" })
      .eq("project_id", projectId)
      .order("id")
      .range(offset, offset + 199);
    if (result.error) throw result.error;
    const rows = (result.data as MonitoringDevice[] | null) ?? [];
    total = result.count;
    if (rows.some((row) => row.project_id !== projectId))
      throw Error("Enhedsdata tilhører en anden sag.");
    if (!rows.length) {
      if (total !== null && offset < total) throw Error("Enhedsudtrækket er ufuldstændigt.");
      break;
    }
    devices.push(...rows);
    offset += rows.length;
    if (total !== null ? offset >= total : rows.length < 200) break;
  }
  // Bound parallel requests without silently dropping devices on large cases.
  if (new Set(devices.map((device) => device.id)).size !== devices.length)
    throw Error("Enhedsudtrækket indeholder gentagne sider.");
  const mapped: MapDevice[] = new Array(devices.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, devices.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= devices.length) return;
        const device = devices[index];
        const readings = await listMeasurements(device.id, { limit: 2, actorId });
        const latest = readings[0] ?? null;
        if (readings.some((reading) => reading.device_id !== device.id))
          throw Error("Målingen tilhører en anden enhed.");
        mapped[index] = toMapDevice(device, latest, readings[1] ?? null);
      }
    }),
  );
  return { devices: mapped };
}
