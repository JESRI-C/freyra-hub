import { lazy, Suspense, useMemo, type ReactNode } from "react";
import type { ManagerWorkOrder } from "@/lib/manager-work-orders";
import { managerMapData, managerMapSourceLabel } from "./manager-work-order-map-data";

const Canvas = lazy(() => import("./ManagerWorkOrderMapCanvas"));
export type ManagerMapSelection = { actionId: string; projectId: string };
export type ManagerMapViewport = { lat: number; lng: number; zoom: number };

export function ManagerWorkOrderMap({
  items,
  selection,
  onSelect,
  renderOrder,
  viewport,
  onViewport,
}: {
  items: ManagerWorkOrder[];
  selection: ManagerMapSelection | null;
  onSelect: (selection: ManagerMapSelection) => void;
  renderOrder: (task: ManagerWorkOrder) => ReactNode;
  viewport: ManagerMapViewport | null;
  onViewport: (viewport: ManagerMapViewport) => void;
}) {
  const { features, mappedJobs, unmappedJobs } = useMemo(() => managerMapData(items), [items]);
  const selected = items.find(
    (task) => task.action_id === selection?.actionId && task.project_id === selection.projectId,
  );
  const partial = items.filter(
    (task) => task.map_locations.length > 0 && task.map_unavailable_locations > 0,
  );
  return (
    <section aria-label="Kortvisning af arbejdsordrer" className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        Indlæst: {mappedJobs} arbejdsordrer på kort · {unmappedJobs.length} uden kortposition ·{" "}
        {features.length} kortobjekter.
      </p>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="min-w-0">
          {features.length ? (
            <Suspense fallback={<p role="status">Henter kort…</p>}>
              <Canvas
                features={features}
                selectedActionId={selected?.action_id ?? null}
                onSelect={(actionId, projectId) => onSelect({ actionId, projectId })}
                viewport={viewport}
                onViewport={onViewport}
              />
            </Suspense>
          ) : (
            <p role="status" className="rounded-xl border border-dashed p-6 text-sm">
              Ingen af de indlæste arbejdsordrer har en brugbar kortposition. Opgaverne kan stadig
              åbnes herunder.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Punkter viser lokaliteternes aktuelle gemte positioner. Linjer viser hele den gemte
            vandløbsversion. Planens stationering afgrænser ikke linjen i denne visning.
          </p>
        </div>
        <div className="min-w-0 space-y-3">
          <label className="block text-sm font-medium">
            Vælg arbejdsordre ved kortet
            <select
              className="mt-1 min-h-11 w-full min-w-0 rounded-xl border bg-background p-3 text-base"
              value={selected?.action_id ?? ""}
              onChange={(event) => {
                const task = items.find((item) => item.action_id === event.target.value);
                if (task) onSelect({ actionId: task.action_id, projectId: task.project_id });
              }}
            >
              <option value="">Vælg en indlæst arbejdsordre</option>
              {items.map((task) => (
                <option key={task.action_id} value={task.action_id}>
                  {task.title} · {task.project_name}
                </option>
              ))}
            </select>
          </label>
          {selection && !selected && (
            <p role="status" className="text-sm text-muted-foreground">
              Den tidligere valgte arbejdsordre er ikke i de indlæste resultater. Vælg en indlæst
              opgave, eller hent flere.
            </p>
          )}
          {selected ? (
            <div aria-label="Valgt arbejdsordre" className="space-y-3">
              {renderOrder(selected)}
              {selected.map_locations.map((location) => (
                <p key={location.id} className="text-xs text-muted-foreground">
                  {location.name} · {managerMapSourceLabel(location)}
                </p>
              ))}
              {selected.map_unavailable_locations > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selected.map_unavailable_locations} tilknyttede lokaliteter mangler en brugbar
                  kortposition.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Vælg en markering eller en arbejdsordre for at åbne dens arbejdsgrundlag og
              aflevering.
            </p>
          )}
        </div>
      </div>
      {unmappedJobs.length > 0 && (
        <section
          aria-label="Arbejdsordrer uden kortposition"
          className="rounded-xl border bg-card p-4"
        >
          <h2 className="font-semibold">Uden kortposition · {unmappedJobs.length} indlæst</h2>
          <ul className="mt-2 divide-y">
            {unmappedJobs.map((task) => (
              <li key={task.action_id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded py-3 text-left text-sm hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => onSelect({ actionId: task.action_id, projectId: task.project_id })}
                >
                  <span className="font-medium">
                    {task.title} · {task.project_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {task.map_unavailable_reason === "no_location"
                      ? "Intet sted valgt"
                      : "Koordinater mangler eller er ugyldige"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {partial.length > 0 && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">
            {partial.length} delvist stedfæstede arbejdsordrer ·{" "}
            {partial.reduce((sum, task) => sum + task.map_unavailable_locations, 0)} manglende
            positioner
          </summary>
          <ul className="divide-y">
            {partial.map((task) => (
              <li key={task.action_id}>
                <button
                  type="button"
                  className="min-h-11 w-full py-3 text-left text-sm font-medium hover:underline"
                  onClick={() => onSelect({ actionId: task.action_id, projectId: task.project_id })}
                >
                  {task.title} · {task.map_unavailable_locations} tilknyttede lokaliteter uden
                  position
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
