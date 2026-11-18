import { lazy, Suspense, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { Card } from "@/components/ui-bits";
import { DeviceStatusBadge } from "@/components/connect/Primitives";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { deriveDeviceStatus, type MonitoringDevice } from "@/services/monitoring/devices-service";
import { GpsTripLog } from "./GpsTripLog";

const MapCanvas = lazy(() => import("./GpsDeviceMapCanvas"));
const positions = z.array(
  z.object({
    device_id: z.string().uuid(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    measured_at: z.string().datetime({ offset: true }),
  }),
);
const dateTime = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });

export type GpsMapPoint = z.infer<typeof positions>[number] & { name: string };
const historyPage = z.array(
  positions.element.omit({ device_id: true }).extend({ id: z.string().uuid() }),
);
export type GpsHistoryPoint = z.infer<typeof historyPage>[number];
const noHistory: GpsHistoryPoint[] = [];

export function GpsDeviceOverview({
  devices,
  projectId,
  actorId,
}: {
  devices: MonitoringDevice[];
  projectId: string;
  actorId: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [historyWindow, setHistoryWindow] = useState<{
    deviceId: string;
    hours: number;
    through: number;
  }>();
  const result = useQuery({
    queryKey: ["latest-gps-device-positions", actorId, projectId],
    refetchInterval: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const response = await client
        .rpc("list_latest_gps_device_positions", { p_project_id: projectId })
        .abortSignal(signal);
      if (response.error) throw response.error;
      return positions.parse(response.data);
    },
  });
  const points = useMemo<GpsMapPoint[]>(() => {
    if (!result.isSuccess) return [];
    const names = new Map(devices.map(({ id, name }) => [id, name]));
    return result.data.flatMap((position) => {
      const name = names.get(position.device_id);
      return name === undefined ? [] : [{ ...position, name }];
    });
  }, [devices, result.data, result.isSuccess]);
  const byDevice = new Map(points.map((point) => [point.device_id, point]));
  const activeHistory =
    historyWindow?.deviceId === selected && selected && byDevice.has(selected)
      ? historyWindow
      : undefined;
  const history = useInfiniteQuery({
    queryKey: ["gps-device-history", actorId, projectId, activeHistory],
    enabled: !!activeHistory,
    retry: false,
    initialPageParam: null as GpsHistoryPoint | null,
    queryFn: async ({ pageParam, signal }) => {
      if (!activeHistory) return [];
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const response = await client
        .rpc("list_gps_device_position_history", {
          p_project_id: projectId,
          p_device_id: activeHistory.deviceId,
          p_from: new Date(activeHistory.through - activeHistory.hours * 3600_000).toISOString(),
          p_through: new Date(activeHistory.through).toISOString(),
          p_before_measured_at: pageParam?.measured_at ?? null,
          p_before_id: pageParam?.id ?? null,
        })
        .abortSignal(signal);
      if (response.error) throw response.error;
      return historyPage.parse(response.data);
    },
    getNextPageParam: (lastPage) => (lastPage.length > 100 ? lastPage[99] : undefined),
  });
  const historicalPoints = useMemo(
    () =>
      activeHistory && history.isSuccess
        ? history.data.pages.flatMap((page) => page.slice(0, 100))
        : noHistory,
    [activeHistory, history.data, history.isSuccess],
  );

  return (
    <Card className="min-w-0 space-y-3 p-3 sm:p-4">
      <section aria-label="GPS-enheder" className="space-y-3">
        <h2 className="font-semibold">GPS-enheder</h2>
        {result.isPending && <p role="status">Henter positioner…</p>}
        {result.isError && (
          <p role="alert">
            Positionerne kunne ikke hentes.{" "}
            <button
              type="button"
              className="min-h-11 underline"
              onClick={() => void result.refetch()}
            >
              Prøv igen
            </button>
          </p>
        )}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {points.length > 0 && (
            <Suspense fallback={<p role="status">Henter kort…</p>}>
              <MapCanvas
                points={points}
                selected={selected}
                onSelect={setSelected}
                history={historicalPoints}
              />
            </Suspense>
          )}
          <ul className="space-y-2">
            {devices.map((device) => {
              const point = byDevice.get(device.id);
              return (
                <li key={device.id} className="space-y-1 rounded-lg border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{device.name}</span>
                    <DeviceStatusBadge status={deriveDeviceStatus(device)} />
                  </div>
                  {point ? (
                    <button
                      type="button"
                      aria-pressed={selected === device.id}
                      className="min-h-11 rounded border px-2 text-left text-sm aria-pressed:bg-muted"
                      onClick={() => setSelected(device.id)}
                    >
                      Vis på kort · {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                    </button>
                  ) : result.isSuccess ? (
                    <p className="text-sm">Ingen målt position</p>
                  ) : null}
                  {point && (
                    <p className="text-xs text-muted-foreground">
                      Målt{" "}
                      <time dateTime={point.measured_at}>
                        {dateTime.format(new Date(point.measured_at))}
                      </time>
                    </p>
                  )}
                  {point && selected === device.id && (
                    <div className="space-y-2">
                      {!activeHistory ? (
                        <button
                          type="button"
                          className="min-h-11 rounded border px-2 text-sm"
                          onClick={() =>
                            setHistoryWindow({
                              deviceId: device.id,
                              hours: 24,
                              through: Date.now(),
                            })
                          }
                        >
                          Vis GPS-historik
                        </button>
                      ) : (
                        <>
                          <label className="block text-sm">
                            Periode
                            <select
                              className="ml-2 min-h-11 rounded border bg-background px-2"
                              value={activeHistory.hours}
                              onChange={(event) =>
                                setHistoryWindow({
                                  ...activeHistory,
                                  hours: Number(event.target.value),
                                })
                              }
                            >
                              <option value={24}>Seneste 24 timer</option>
                              <option value={168}>Seneste 7 dage</option>
                            </select>
                          </label>
                          {history.isPending && <p role="status">Henter historik…</p>}
                          {history.isError && (
                            <p role="alert">
                              Historikken kunne ikke hentes.{" "}
                              <button
                                type="button"
                                className="min-h-11 underline"
                                onClick={() => void history.refetch()}
                              >
                                Prøv igen
                              </button>
                            </p>
                          )}
                          {history.isSuccess && (
                            <p className="text-sm">
                              {historicalPoints.length
                                ? historicalPoints.length + " målte positioner på kortet"
                                : "Ingen målte positioner i perioden"}
                            </p>
                          )}
                          {history.hasNextPage && (
                            <button
                              type="button"
                              className="mr-2 min-h-11 rounded border px-2 text-sm"
                              disabled={history.isFetching}
                              onClick={() => void history.fetchNextPage()}
                            >
                              Vis ældre punkter
                            </button>
                          )}
                          <button
                            type="button"
                            className="min-h-11 rounded border px-2 text-sm"
                            onClick={() => setHistoryWindow(undefined)}
                          >
                            Skjul GPS-historik
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {point && selected === device.id && (
                    <GpsTripLog
                      key={device.id}
                      actorId={actorId}
                      projectId={projectId}
                      deviceId={device.id}
                      points={historicalPoints}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </Card>
  );
}
