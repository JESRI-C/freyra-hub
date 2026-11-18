// @vitest-environment jsdom
import { expect, it } from "vitest";
import { mapDevicePopup } from "./map-device-popup";
import type { MapDevice } from "@/services/monitoring/map-devices-service";
it("renders customer labels as text and explicitly explains missing values and registered position", () => {
  const device: MapDevice = {
    id: "one",
    projectId: "case",
    label: '<img src=x onerror="alert(1)">',
    deviceType: "water_level",
    dataClassification: "synthetic",
    signalStrength: null,
    trend: null,
    coordinates: { lat: 55, lng: 9, source: "registered", recordedAt: null },
    measurement: null,
    batteryPercent: null,
    lastSeen: null,
    status: "offline",
  };
  const popup = mapDevicePopup(device);
  expect(popup.querySelector("img")).toBeNull();
  expect(popup.textContent).toContain(device.label);
  expect(popup.textContent).toContain("Ingen måling registreret");
  expect(popup.textContent).toContain("ikke en aktuel GPS-måling");
  expect(popup.textContent).toContain("Batteriniveau mangler");
  expect(popup.textContent).not.toContain("null%");
});
