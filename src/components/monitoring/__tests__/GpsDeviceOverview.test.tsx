// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { MonitoringDevice } from "@/services/monitoring/devices-service";
import { GpsDeviceOverview } from "../GpsDeviceOverview";
import { GpsTripLog } from "../GpsTripLog";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), downloadCsv: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createActorBoundSupabaseClient: () => mocks,
}));
vi.mock("@/services/export-service", async (original) => ({
  ...(await original<typeof import("@/services/export-service")>()),
  downloadProjectCsv: mocks.downloadCsv,
}));

it("selects the same measured position in the mobile list and on the map", async () => {
  const time = new Date().toISOString();
  const ids = [1, 2, 3].map((number) => "00000000-0000-4000-8000-00000000000" + number);
  const devices = ["Bil 1", "Bil 2", "Mangler måling"].map((name, index) => ({
    id: ids[index],
    name,
    status: "active",
    last_seen_at: time,
    expected_interval_minutes: 5,
    battery_level: 100,
    latitude: 40,
    longitude: 9,
  })) as MonitoringDevice[];
  const earlier = new Date(Date.parse(time) - 60_000).toISOString();
  const earlierId = "00000000-0000-4000-8000-000000000004";
  const savedTrips: Record<string, unknown>[] = [];
  const read = {
    select: () => read,
    eq: () => read,
    order: () => read,
    limit: () => read,
    abortSignal: async () => ({ data: [...savedTrips], error: null }),
  };
  const historyRead = {
    ...read,
    select: () => historyRead,
    eq: () => historyRead,
    order: () => historyRead,
    limit: () => historyRead,
    abortSignal: async () => ({
      data: [
        {
          revision: 2,
          classification: "business",
          purpose: "Levering",
          captured_at: time,
          baseline: false,
        },
        {
          revision: 1,
          classification: "private",
          purpose: null,
          captured_at: earlier,
          baseline: true,
        },
      ],
      error: null,
    }),
  };
  mocks.from.mockImplementation((table: string) =>
    table === "gps_trip_amendment_history" ? historyRead : read,
  );
  mocks.rpc.mockImplementation(
    (name: string, args: { p_id: string; p_purpose?: string; p_classification?: string }) => {
      if (name === "can_review_gps_trips")
        return { abortSignal: async () => ({ data: false, error: null }) };
      if (name === "record_gps_trip") {
        savedTrips.push({
          id: args.p_id,
          driver_id: ids[0],
          gps_distance_m: 110,
          gps_sample_count: 2,
          gps_gap_count: 0,
          started_at: earlier,
          ended_at: time,
          classification: "private",
          purpose: null,
          revision: 1,
        });
        return Promise.resolve({ data: args.p_id, error: null });
      }
      if (name === "amend_gps_trip") {
        savedTrips[0] = {
          ...savedTrips[0],
          classification: args.p_classification,
          purpose: args.p_purpose,
          revision: 2,
        };
        return Promise.resolve({ data: 2, error: null });
      }
      return {
        abortSignal: async () => ({
          data:
            name === "list_gps_device_position_history"
              ? [
                  { id: ids[2], latitude: 55.2, longitude: 9.7, measured_at: time },
                  { id: earlierId, latitude: 55.1, longitude: 9.6, measured_at: earlier },
                ]
              : [
                  { device_id: ids[0], latitude: 55.2, longitude: 9.8, measured_at: time },
                  { device_id: ids[1], latitude: 55.3, longitude: 9.9, measured_at: time },
                ],
          error: null,
        }),
      };
    },
  );
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <GpsDeviceOverview devices={devices} projectId="project" actorId={ids[0]} />
        </QueryClientProvider>,
      ),
    );
    for (
      let count = 0;
      count < 30 && host.querySelectorAll(".leaflet-marker-icon").length !== 2;
      count++
    )
      await flush();
    expect(host.querySelectorAll(".leaflet-marker-icon")).toHaveLength(2);
    expect(host.textContent).toContain("Ingen målt position");
    expect(host.textContent).toContain("55.30000, 9.90000");
    expect(host.textContent).not.toContain("40.00000");
    const second = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("55.30000"),
    )!;
    await act(async () => second.click());
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".leaflet-tooltip")?.textContent).toBe("Bil 2");
    expect(mocks.rpc).toHaveBeenCalledWith("list_latest_gps_device_positions", {
      p_project_id: "project",
    });
    const openHistory = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Vis GPS-historik",
    )!;
    await act(async () => openHistory.click());
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_gps_device_position_history",
      expect.objectContaining({
        p_project_id: "project",
        p_device_id: ids[1],
        p_before_measured_at: null,
        p_before_id: null,
      }),
    );
    expect(host.querySelectorAll(".gps-history-point")).toHaveLength(2);
    expect(host.textContent).toContain("2 målte positioner på kortet");
    const log = host.querySelector('[aria-label="Kørebog"]')!;
    const [start, end, classification] = [...log.querySelectorAll("select")];
    const suggestion = log.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!;
    expect(suggestion).toBeTruthy();
    await act(async () => suggestion.click());
    expect([start.value, end.value]).toEqual([earlierId, ids[2]]);
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_gps_trip", expect.anything());
    await act(async () => {
      classification.value = "private";
      classification.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => log.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_gps_trip",
      expect.objectContaining({
        p_project_id: "project",
        p_device_id: ids[1],
        p_start_id: earlierId,
        p_end_id: ids[2],
        p_classification: "private",
        p_purpose: null,
      }),
    );
    expect(log.textContent).toContain("Turen er gemt.");
    expect(log.querySelector("li")?.textContent).toContain("Privat");
    const edit = [...log.querySelectorAll("button")].find(
      (button) => button.textContent === "Ret tur",
    )!;
    await act(async () => edit.click());
    const correction = log.querySelector<HTMLFormElement>('form[aria-label="Ret tur"]')!;
    await act(async () => {
      const kind = correction.querySelector("select")!;
      kind.value = "business";
      kind.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      const purpose = correction.querySelector("input")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        purpose,
        "Levering",
      );
      purpose.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      correction.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(),
    );
    await flush();
    expect(log.querySelector("li")?.textContent).toContain("Erhverv · Levering");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "amend_gps_trip",
      expect.objectContaining({
        p_revision: 1,
        p_classification: "business",
        p_purpose: "Levering",
      }),
    );
    const historyDetails = log.querySelector("details")!;
    await act(async () => {
      historyDetails.open = true;
      historyDetails.dispatchEvent(new Event("toggle"));
    });
    await flush();
    expect(historyDetails.textContent).toContain("Version 2 · Erhverv · Levering");
    expect(historyDetails.textContent).toContain("Version 1 · Privat");
    expect(historyDetails.textContent).toContain("Historik startet");
    expect(log.textContent).not.toContain("Turforslag fra de indlæste GPS-punkter");
    const hideHistory = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Skjul GPS-historik",
    )!;
    await act(async () => hideHistory.click());
    expect(host.querySelectorAll(".gps-history-point")).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});

it("approves a business trip and exports the approved ledger with formula-safe purpose text", async () => {
  const id = "00000000-0000-4000-8000-000000000005";
  const time = "2026-11-17T10:00:00Z";
  let approved: string | null = null;
  const trip = {
    id,
    driver_id: id,
    classification: "business",
    started_at: "2026-11-17T09:00:00Z",
    ended_at: time,
    purpose: "=Tilsyn()",
    gps_distance_m: 4000,
    gps_sample_count: 3,
    gps_gap_count: 1,
    revision: 3,
  };
  const read = {
    select: () => read,
    eq: () => read,
    order: () => read,
    limit: () => read,
    abortSignal: async () => ({ data: [{ ...trip, approved_at: approved }], error: null }),
  };
  mocks.from.mockReturnValue(read);
  mocks.rpc.mockImplementation((name: string) => {
    if (name === "can_review_gps_trips")
      return { abortSignal: async () => ({ data: true, error: null }) };
    if (name === "approve_gps_trip") {
      approved = time;
      return Promise.resolve({ data: time, error: null });
    }
    return Promise.resolve({
      data: [{ ...trip, driver_id: id, approved_at: approved, approved_by: id }],
      error: null,
    });
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient();
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  const click = (label: string) =>
    act(async () => {
      const button = [...host.querySelectorAll("button")].find(
        (item) => item.textContent === label,
      );
      expect(button).toBeTruthy();
      button!.click();
    });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <GpsTripLog points={[]} projectId="project" deviceId="tracker" actorId="manager" />
        </QueryClientProvider>,
      ),
    );
    await flush();
    expect(host.textContent).toContain("Beregnet GPS-distance · 4 km · Målehuller udeladt");
    await click("Godkend erhvervstur");
    await flush();
    expect(host.textContent).toContain("Erhvervsturen er godkendt.");
    expect(mocks.rpc).toHaveBeenCalledWith("approve_gps_trip", {
      p_project_id: "project",
      p_device_id: "tracker",
      p_trip_id: id,
      p_revision: 3,
    });
    await click("Hent CSV");
    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      expect.stringContaining("'=Tilsyn();4000;3;1"),
      expect.stringMatching(/\.csv$/),
      { projectId: "project", entityType: "monitoring_device", entityId: "tracker" },
    );
  } finally {
    await act(async () => root.unmount());
    cache.clear();
    host.remove();
  }
});
