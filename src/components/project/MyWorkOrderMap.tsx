import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MyWorkOrder } from "@/lib/work-order-assignments";
import { readMyWorkOrderMap } from "@/services/my-work-order-map-service";
import { managerMapSourceLabel } from "./manager-work-order-map-data";
import type { ManagerMapViewport } from "./ManagerWorkOrderMap";

const MapCanvas = lazy(() => import("./ManagerWorkOrderMapCanvas"));
const button =
  "min-h-11 rounded-xl border bg-card px-3 py-2 text-left text-sm font-medium disabled:opacity-50";

export function MyWorkOrderMap({
  actorId,
  items,
  hasMore,
  onOpen,
  viewport,
  onViewport,
}: {
  actorId: string;
  items: MyWorkOrder[];
  hasMore: boolean;
  onOpen: (actionId: string) => void;
  viewport: ManagerMapViewport | null;
  onViewport: (viewport: ManagerMapViewport) => void;
}) {
  const locations = useQuery({
    queryKey: ["my-work-order-map", actorId, items],
    queryFn: ({ signal }) => readMyWorkOrderMap(actorId, items, signal),
    retry: false,
  });
  const data = locations.isError ? undefined : locations.data;
  return (
    <section aria-label="Kort over mine opgaver" className="min-w-0 space-y-3">
      <h2 className="text-lg font-semibold">Find opgaven på kortet</h2>
      <p className="text-sm text-muted-foreground">
        Vælg en markering eller en opgave nedenfor. Kortet følger listens søgning og filtre.
        Arbejdsstederne viser de gemte punkter eller midtpunkter; vandløb følger planens gemte
        version.
      </p>
      {hasMore && (
        <p role="status" className="rounded-xl border p-3 text-sm">
          Kortet viser de indlæste opgaver. Hent flere opgaver for at få resten af udvalget med.
        </p>
      )}
      {locations.isPending && <p role="status">Henter opgavernes arbejdssteder…</p>}
      {locations.isError && (
        <div role="alert" className="rounded-xl border p-3 text-sm">
          <p>Arbejdsstederne kunne ikke hentes. Opdater dine opgaver, eller prøv kortet igen.</p>
          <button
            type="button"
            className={button + " mt-2"}
            onClick={() => void locations.refetch()}
          >
            Prøv kortet igen
          </button>
        </div>
      )}
      {data && (
        <>
          <p role="status" className="text-sm">
            {data.mappedJobs} af {items.length} indlæste opgaver har kortposition ·{" "}
            {data.unmappedJobs.length} uden.
          </p>
          {data.features.length > 0 && (
            <Suspense fallback={<p role="status">Henter kort…</p>}>
              <MapCanvas
                features={data.features}
                selectedActionId={null}
                onSelect={(id) => onOpen(id)}
                viewport={viewport}
                onViewport={onViewport}
              />
            </Suspense>
          )}
          <ul
            aria-label="Arbejdssteder på mine opgaver"
            className="grid min-w-0 gap-2 sm:grid-cols-2"
          >
            {data.features.map((feature) => (
              <li key={feature.key} className="min-w-0 rounded-xl border p-3 text-sm">
                <p className="font-medium">{feature.title}</p>
                <p>
                  {feature.location.name} · {managerMapSourceLabel(feature.location)}
                </p>
                <button
                  type="button"
                  className={button + " mt-2"}
                  onClick={() => onOpen(feature.actionId)}
                >
                  Åbn opgave · {feature.title}
                </button>
              </li>
            ))}
          </ul>
          {data.unmappedJobs.length > 0 && (
            <section
              aria-label="Mine opgaver uden kortposition"
              className="space-y-2 rounded-xl border p-3"
            >
              <h3 className="font-semibold">Opgaver uden kortposition</h3>
              <p className="text-sm text-muted-foreground">
                Opgaverne kan stadig åbnes. Et sted uden gyldige koordinater placeres ikke på
                kortet.
              </p>
              <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
                {data.unmappedJobs.map((task) => (
                  <li key={task.action_id}>
                    <button
                      type="button"
                      className={button + " w-full"}
                      onClick={() => onOpen(task.action_id)}
                    >
                      Åbn opgave · {task.plan.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
