import { describe, it, expect } from "vitest";
import { actionPriorityTone, actionPriorityColor, suggestSensorActions } from "../actions-service";
import type { IoTSensor } from "@/services/iot-simulation-service";

function sensor(overrides: Partial<IoTSensor>): IoTSensor {
  return {
    id: "s",
    projectId: "p1",
    label: "Sensor",
    coordinates: { lat: 0, lng: 0 },
    type: "soil_moisture",
    latestValue: 42,
    unit: "%",
    status: "online",
    lastSeen: "2026-01-01T00:00:00Z",
    trend: "stable",
    batteryPercent: 80,
    signalStrength: 90,
    simulated: true,
    ...overrides,
  };
}

describe("actionPriorityTone/Color", () => {
  it("maps Danish priorities", () => {
    expect(actionPriorityTone("Høj")).toBe("danger");
    expect(actionPriorityTone("Medium")).toBe("warning");
    expect(actionPriorityTone("Lav")).toBe("neutral");
    expect(actionPriorityColor("Høj")).toContain("destructive");
    expect(actionPriorityColor("Medium")).toContain("amber");
    expect(actionPriorityColor("Lav")).toContain("muted");
  });
});

describe("suggestSensorActions", () => {
  it("does not invent a low battery for a missing value or a not-activated device", () => {
    expect(
      suggestSensorActions([
        { label: "Ikke aktiveret", status: "not_activated", batteryPercent: null },
        { label: "Ingen batterimåling", status: "online", batteryPercent: null },
        { label: "Ugyldigt batteriniveau", status: "online", batteryPercent: -1 },
      ]),
    ).toEqual([]);
    expect(
      suggestSensorActions([
        { label: "Kontakt kræver kontrol", status: "attention", batteryPercent: null },
      ]),
    ).toHaveLength(1);
  });
  it("is empty when all sensors healthy", () => {
    expect(suggestSensorActions([sensor({ id: "a" }), sensor({ id: "b" })])).toEqual([]);
  });
  it("suggests high-priority for offline sensors", () => {
    const res = suggestSensorActions([sensor({ id: "a", status: "offline" })]);
    expect(res).toHaveLength(1);
    expect(res[0].priority).toBe("Høj");
  });
  it("flags low battery separately from offline", () => {
    const res = suggestSensorActions([
      sensor({ id: "a", status: "online", batteryPercent: 10 }),
      sensor({ id: "b", status: "warning", batteryPercent: 60 }),
    ]);
    // low battery + warning inspection
    expect(res).toHaveLength(2);
    expect(res.map((r) => r.priority).sort()).toEqual(["Medium", "Medium"]);
  });
});
