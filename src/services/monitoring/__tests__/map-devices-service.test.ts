import { beforeEach, expect, it, vi } from "vitest";
import type { MonitoringDevice } from "../devices-service";
import type { DeviceMeasurement } from "../measurements-service";
const mocks = vi.hoisted(() => ({ bound: vi.fn(), readings: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {},
  createActorBoundSupabaseClient: mocks.bound,
}));
vi.mock("../measurements-service", () => ({ listMeasurements: mocks.readings }));
import { getProjectMapDevices, toMapDevice } from "../map-devices-service";
const device = (id = "one", patch: Partial<MonitoringDevice> = {}) =>
  ({
    id,
    project_id: "case",
    name: "Enhed " + id,
    latitude: 55.25,
    longitude: 9.48,
    last_seen_at: new Date().toISOString(),
    status: "active",
    expected_interval_minutes: 60,
    battery_level: null,
    ...patch,
  }) as MonitoringDevice;
const reading = (patch: Partial<DeviceMeasurement> = {}) =>
  ({
    id: "reading",
    device_id: "one",
    value: 0,
    unit: null,
    measured_at: "2026-11-17T12:00:00Z",
    latitude: null,
    longitude: null,
    quality_status: "valid",
    ...patch,
  }) as DeviceMeasurement;
function database(rows: MonitoringDevice[], cap = 200, total = rows.length) {
  const offsets: number[] = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async (offset: number) => {
      offsets.push(offset);
      return { data: rows.slice(offset, offset + cap), count: total, error: null };
    }),
  };
  mocks.bound.mockReturnValue({ from: vi.fn(() => query) });
  return { query, offsets };
}
beforeEach(() => {
  mocks.bound.mockReset();
  mocks.readings.mockReset().mockResolvedValue([]);
});
it("reads every authorized page and binds every measurement to the initiating actor", async () => {
  const rows = Array.from({ length: 5 }, (_, index) => device(String(index)));
  const { query, offsets } = database(rows, 2);
  const result = await getProjectMapDevices("case", "actor");
  expect(result.devices.map((value) => value.id)).toEqual(rows.map((value) => value.id));
  expect(offsets).toEqual([0, 2, 4]);
  expect(query.eq).toHaveBeenCalledWith("project_id", "case");
  expect(mocks.bound).toHaveBeenCalledWith("actor");
  for (const row of rows)
    expect(mocks.readings).toHaveBeenCalledWith(row.id, { limit: 2, actorId: "actor" });
});
it("keeps a genuine zero measurement and distinguishes measured from registered positions", () => {
  const stored = toMapDevice(device(), reading());
  expect(stored.measurement?.value).toBe(0);
  expect(stored.measurement?.unit).toBeNull();
  expect(stored.coordinates?.source).toBe("registered");
  const measured = toMapDevice(device(), reading({ latitude: 0, longitude: 0 }));
  expect(measured.coordinates).toEqual({
    lat: 0,
    lng: 0,
    source: "measurement",
    recordedAt: "2026-11-17T12:00:00Z",
  });
});
it("does not invent a position, battery, measurement or online contact", () => {
  const result = toMapDevice(
    device("missing", { latitude: null, longitude: null, last_seen_at: "invalid" }),
    null,
  );
  expect(result.coordinates).toBeNull();
  expect(result.measurement).toBeNull();
  expect(result.batteryPercent).toBeNull();
  expect(result.status).toBe("offline");
  expect(toMapDevice(device("bad", { latitude: 91, longitude: 9 }), null).coordinates).toBeNull();
});
it("labels data synthetic only from an explicit stored flag and otherwise keeps provenance unverified", () => {
  expect(toMapDevice(device("DEMO-name-only"), null).dataClassification).toBe("unverified");
  expect(
    toMapDevice(device("fixture", { configuration: { synthetic: true } }), null).dataClassification,
  ).toBe("synthetic");
  expect(
    toMapDevice(device(), reading({ source_payload: { synthetic: true } })).dataClassification,
  ).toBe("synthetic");
});
it("does not report a failed measurement read as an empty or successful snapshot", async () => {
  database([device()]);
  mocks.readings.mockRejectedValue(new Error("denied"));
  await expect(getProjectMapDevices("case", "actor")).rejects.toThrow("denied");
});
it("rejects mismatched project and measurement identities", async () => {
  database([device("other", { project_id: "other" })]);
  await expect(getProjectMapDevices("case", "actor")).rejects.toThrow("anden sag");
  database([device()]);
  mocks.readings.mockResolvedValue([reading({ device_id: "other" })]);
  await expect(getProjectMapDevices("case", "actor")).rejects.toThrow("anden enhed");
});
it("rejects an incomplete page sequence rather than claiming a partial total", async () => {
  database([], 200, 3);
  await expect(getProjectMapDevices("case", "actor")).rejects.toThrow("ufuldstændigt");
});
it("derives trend only from comparable accepted measurements in time order", () => {
  const newer = reading({
    parameter_id: "parameter-a",
    unit: "m",
    value: 0,
    measured_at: new Date(Date.now() - 60_000).toISOString(),
  });
  const older = reading({
    id: "previous",
    parameter_id: "parameter-a",
    unit: "m",
    value: 1,
    measured_at: new Date(Date.now() - 120_000).toISOString(),
  });
  expect(toMapDevice(device(), newer, older).trend).toBe("down");
  expect(toMapDevice(device(), newer, { ...older, value: 0 }).trend).toBe("stable");
  for (const change of [
    { parameter_id: "other" },
    { unit: "cm" },
    { quality_status: "suspect" },
    { measured_at: newer.measured_at },
  ])
    expect(toMapDevice(device(), newer, { ...older, ...change }).trend).toBeNull();
  expect(toMapDevice(device(), { ...newer, parameter_id: null }, older).trend).toBeNull();
});
