import { lazy, Suspense, useMemo, useState } from "react";
import type { MapEditorMapProps } from "@/components/maps/MapEditorMap";
import type { Site } from "@/lib/supabase/types";
import type { WorkOrderPlan } from "@/lib/work-order-plan";

const VisitMap = lazy(() =>
  import("@/components/maps/MapEditorMap").then((module) => ({ default: module.MapEditorMap })),
);
const button = "min-h-11 rounded-xl border px-3 text-sm";

function validPosition(lat: unknown, lng: unknown) {
  return typeof lat === "number" &&
    typeof lng === "number" &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : undefined;
}

function position(site?: Site) {
  if (!site) return undefined;
  const centroid = validPosition(site.centroid_lat, site.centroid_lng);
  if (centroid) return centroid;
  const geometry = site.geometry_geojson;
  if (geometry?.type === "Point" && Array.isArray(geometry.coordinates))
    return validPosition(geometry.coordinates[1], geometry.coordinates[0]);
  return undefined;
}

export function WorkOrderVisitMap({
  plan,
  sites,
  projectId,
}: {
  plan: WorkOrderPlan;
  sites: Site[];
  projectId: string;
}) {
  const [center, setCenter] = useState<MapEditorMapProps["centerOverride"]>();
  const [copyStatus, setCopyStatus] = useState("");
  async function copyCoordinates(name: string, coordinates: string) {
    try {
      await navigator.clipboard.writeText(coordinates);
      setCopyStatus("Koordinater kopieret for " + name + ".");
    } catch {
      setCopyStatus("Kopiér koordinaterne manuelt fra stoplisten.");
    }
  }
  const { stops, points, bounds, segments } = useMemo(() => {
    const byId = new Map(sites.map((site) => [site.id, site]));
    const ordered = [
      ...(plan.siteId
        ? [{ siteId: plan.siteId, name: byId.get(plan.siteId)?.name ?? "Hovedlokalitet" }]
        : []),
      ...(plan.visitStops ?? []),
    ];
    const stops = ordered.map((stop, index) => ({
      ...stop,
      number: index + 1,
      position: position(byId.get(stop.siteId)),
    }));
    const points = stops.flatMap((stop) =>
      stop.position
        ? [
            {
              id: stop.siteId,
              label: stop.name,
              visitNumber: stop.number,
              ...stop.position,
            },
          ]
        : [],
    );
    return {
      stops,
      points,
      bounds: points.map(({ lat, lng }): [number, number] => [lat, lng]),
      segments: points.slice(1).flatMap<[[number, number], [number, number]]>((point, index) => {
        const previous = points[index];
        return point.visitNumber === previous.visitNumber + 1
          ? [
              [
                [previous.lat, previous.lng],
                [point.lat, point.lng],
              ],
            ]
          : [];
      }),
    };
  }, [plan.siteId, plan.visitStops, sites]);
  const first = points[0];
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm text-muted-foreground">
        Kortnumrene følger rækkefølgen i arbejdsgrundlaget. Positionerne kommer fra projektets
        lokaliteter. Stiplede linjer forbinder nabostop med kendt position i lige linje.
      </p>
      {first ? (
        <Suspense fallback={<p role="status">Henter kort…</p>}>
          <VisitMap
            projectId={projectId}
            projectName={plan.title}
            lat={first.lat}
            lng={first.lng}
            locationPoints={points}
            locationBounds={bounds}
            visitSegments={segments}
            centerOverride={center}
            initialBaseLayer="osm"
            readOnly
            height={300}
          />
        </Suspense>
      ) : (
        <p role="status">Ingen af planens lokaliteter har en kortposition.</p>
      )}
      <p role="status" className="text-sm">
        {copyStatus}
      </p>
      <ol aria-label="Besøg i planlagt rækkefølge" className="list-decimal space-y-3 pl-6">
        {stops.map((stop) => {
          const point = stop.position;
          const coordinates = point ? `${point.lat}, ${point.lng}` : "";
          return (
            <li key={stop.siteId} className="break-words">
              {point ? (
                <div className="space-y-1">
                  <p className="font-medium">{stop.name}</p>
                  <p className="select-text text-sm tabular-nums">{coordinates}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={button}
                      onClick={() => setCenter({ ...point, zoom: 16 })}
                    >
                      Vis {stop.name} på kort
                    </button>
                    <button
                      type="button"
                      className={button}
                      aria-label={"Kopiér koordinater for " + stop.name}
                      onClick={() => void copyCoordinates(stop.name, coordinates)}
                    >
                      Kopiér koordinater
                    </button>
                  </div>
                </div>
              ) : (
                <p>{stop.name} · Ingen kortposition</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
