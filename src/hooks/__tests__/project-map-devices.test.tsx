// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  auth: {
    user: { id: "one" },
    currentOrg: { id: "org", projects: [{ id: "case" }] },
    loading: false,
    refreshing: false,
  },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/services/monitoring/map-devices-service", () => ({ getProjectMapDevices: mocks.get }));
import { useProjectMapDevices } from "../useProjectMapDevices";
const snapshot = {
  devices: [
    {
      id: "measured",
      status: "online",
      coordinates: { lat: 55, lng: 9 },
      measurement: { value: 0 },
    },
    { id: "missing", status: "offline", coordinates: null, measurement: null },
  ],
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let current: ReturnType<typeof useProjectMapDevices>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function Probe({ id }: { id?: string }) {
  current = useProjectMapDevices(id);
  return <span>{current.status}</span>;
}
async function render(id: string | undefined = "case") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe id={id} />
      </QueryClientProvider>,
    ),
  );
}
async function settle() {
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (!client.isFetching()) return;
  }
  throw Error("Queries did not settle");
}
beforeEach(() => {
  mocks.auth.user = { id: "one" };
  mocks.auth.currentOrg = { id: "org", projects: [{ id: "case" }] };
  mocks.auth.loading = false;
  mocks.auth.refreshing = false;
  mocks.get.mockReset().mockResolvedValue(snapshot);
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
it("maps only saved positions but counts devices without position and measurement", async () => {
  await render();
  await settle();
  expect(current.points).toHaveLength(1);
  expect(current.onlinePercent).toBe(50);
  expect(current.status).toMatch(/1 af 2/);
  expect(current.status).toMatch(/1 mangler position/);
  expect(current.status).toMatch(/1 mangler måling/);
  expect(mocks.get).toHaveBeenCalledWith("case", "one");
});
it("hides cached points during membership refresh and reloads under a new actor and organization", async () => {
  await render();
  await settle();
  mocks.auth.refreshing = true;
  await render();
  expect(current.points).toEqual([]);
  expect(current.onlinePercent).toBeNull();
  mocks.auth.refreshing = false;
  mocks.auth.user = { id: "two" };
  mocks.get.mockResolvedValue({ devices: [] });
  await render();
  await settle();
  expect(mocks.get).toHaveBeenLastCalledWith("case", "two");
  expect(current.points).toEqual([]);
  expect(current.status).toMatch(/Ingen enheder/);
  mocks.auth.currentOrg = { id: "other-org", projects: [{ id: "other-case" }] };
  const calls = mocks.get.mock.calls.length;
  await render();
  expect(mocks.get).toHaveBeenCalledTimes(calls);
  expect(current.points).toEqual([]);
  await render("other-case");
  await settle();
  expect(mocks.get).toHaveBeenLastCalledWith("other-case", "two");
});
it("does not restore cached points after project membership is revoked", async () => {
  await render();
  await settle();
  mocks.auth.refreshing = true;
  await render();
  mocks.auth.currentOrg.projects = [];
  mocks.auth.refreshing = false;
  await render();
  expect(current.points).toEqual([]);
  expect(current.onlinePercent).toBeNull();
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
it("does not show a late result from the previous actor", async () => {
  let resolve!: (value: typeof snapshot) => void;
  mocks.get.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render();
  mocks.auth.user = { id: "two" };
  mocks.get.mockResolvedValue({ devices: [] });
  await render();
  await act(async () => resolve(snapshot));
  await settle();
  expect(current.points).toEqual([]);
  expect(current.status).toMatch(/Ingen enheder/);
});
it("clears successful cached points after a denied refresh", async () => {
  await render();
  await settle();
  mocks.get.mockRejectedValue(new Error("denied"));
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["project-map-devices"] });
  });
  await settle();
  expect(current.points).toEqual([]);
  expect(current.onlinePercent).toBeNull();
  expect(current.status).toMatch(/kunne ikke hentes/);
});
