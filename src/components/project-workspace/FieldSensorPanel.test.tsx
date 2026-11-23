// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { MapDevice } from "@/services/monitoring/map-devices-service";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  auth: {
    user: { id: "reader" },
    currentOrg: { id: "org", projects: [{ id: "case" }] },
    loading: false,
    refreshing: false,
  },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/services/monitoring/map-devices-service", () => ({ getProjectMapDevices: mocks.get }));
import { useProjectMapDevices } from "@/hooks/useProjectMapDevices";
import { FieldSensorPanel } from "./FieldSensorPanel";
const device: MapDevice = {
  id: "one",
  projectId: "case",
  label: "DEMO · Vandstand",
  deviceType: "water_level",
  dataClassification: "synthetic",
  signalStrength: null,
  trend: null,
  status: "online",
  batteryPercent: null,
  lastSeen: null,
  coordinates: { lat: 55.25, lng: 9.48, source: "measurement", recordedAt: "2026-11-17T12:00:00Z" },
  measurement: {
    id: "reading",
    value: 0,
    unit: "m",
    measuredAt: "2026-11-17T12:00:00Z",
    qualityStatus: "valid",
  },
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function Panel() {
  const data = useProjectMapDevices("case");
  return (
    <FieldSensorPanel
      sensors={data.devices}
      status={data.status}
      refreshing={data.refreshing}
      onRefresh={data.refresh}
    />
  );
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Panel />
      </QueryClientProvider>,
    ),
  );
}
async function settled() {
  for (let index = 0; index < 40; index++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (!client.isFetching()) return;
  }
  throw Error("Query did not settle");
}
beforeEach(() => {
  mocks.auth.currentOrg.projects = [{ id: "case" }];
  mocks.auth.refreshing = false;
  mocks.get.mockReset().mockResolvedValue({
    devices: [
      device,
      {
        ...device,
        id: "two",
        label: "DEMO · Mangler position",
        measurement: null,
        coordinates: null,
        status: "not_activated",
      },
    ],
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
it("shows stored zero, absent fields and a device without position, then refreshes from the service", async () => {
  await render();
  await settled();
  expect(host.querySelectorAll("article[data-device-id]")).toHaveLength(2);
  expect(host.textContent).toContain("0 m");
  expect(host.textContent).toContain("Position mangler");
  expect(host.textContent).toContain("Batteriniveau mangler");
  expect(host.textContent).toContain("Trend ikke beregnet");
  expect(host.textContent).not.toContain("SIMULERET");
  mocks.get.mockResolvedValue({
    devices: [{ ...device, measurement: { ...device.measurement!, value: 5 } }],
  });
  const button = [...host.querySelectorAll("button")].find((node) =>
    node.textContent?.includes("Opdatér"),
  )!;
  await act(async () => button.click());
  await settled();
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("5 m");
  expect(host.querySelector("article[data-device-id]")?.textContent).not.toContain("0 m");
  expect(host.querySelectorAll("article[data-device-id]")).toHaveLength(1);
});
it("removes previous readings and refresh action when membership is revoked", async () => {
  await render();
  await settled();
  mocks.auth.currentOrg.projects = [];
  await render();
  expect(host.querySelectorAll("article[data-device-id]")).toHaveLength(0);
  expect(host.textContent).not.toContain("0 m");
  expect(host.textContent).toContain("Vælg en sag med aktuel adgang");
  expect(host.querySelector("button")).toBeNull();
});
