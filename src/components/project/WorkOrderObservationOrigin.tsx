import { useAuth } from "@/lib/auth";
import type { ProjectScope } from "@/services/project-workspace-service";
import {
  ObservationSourceBoundary,
  WorkOrderObservationSourceDetails,
} from "./WorkOrderObservationSourceDetails";
import { observationTime } from "./work-order-observation-presentation";
import { useWorkOrderObservationOrigin } from "./useWorkOrderObservationOrigin";

export function WorkOrderObservationOrigin({
  scope,
  actionId,
  enabled,
}: {
  scope: ProjectScope;
  actionId: string;
  enabled: boolean;
}) {
  const { user, loading, authError } = useAuth();
  if (!enabled || !user || loading || authError) return null;
  return (
    <Origin
      key={`${user.id}:${scope.organizationId}:${scope.projectId}:${actionId}`}
      scope={scope}
      actionId={actionId}
      actorId={user.id}
    />
  );
}

function Origin({
  scope,
  actionId,
  actorId,
}: {
  scope: ProjectScope;
  actionId: string;
  actorId: string;
}) {
  const query = useWorkOrderObservationOrigin({ scope, actionId, actorId, enabled: true });
  if (query.isError)
    return (
      <div role="alert" className="rounded-xl border p-3 text-sm">
        <p>Opgavens kildegrundlag kunne ikke kontrolleres.</p>
        <button
          type="button"
          className="mt-2 min-h-11 rounded-lg border px-3"
          onClick={() => void query.refetch()}
        >
          Hent kildegrundlag igen
        </button>
      </div>
    );
  if (query.isPending)
    return (
      <p role="status" className="text-sm">
        Kontrollerer opgavens kildegrundlag…
      </p>
    );
  const origin = query.data;
  if (!origin) return null;
  return (
    <section
      aria-label="Arbejdsordrens fastholdte observationsgrundlag"
      className="space-y-3 rounded-xl border p-4"
    >
      <h3 className="font-semibold">Oprettet fra feltobservationer</h3>
      <p className="text-sm text-muted-foreground">
        Fastholdt ved oprettelsen {observationTime(origin.created_at)}. Kilderne nedenfor viser
        grundlaget dengang. Opgavens aktuelle status følger arbejdsordren.
      </p>
      <ObservationSourceBoundary />
      <div className="space-y-3">
        {origin.sources.map((source) => (
          <WorkOrderObservationSourceDetails key={source.observation_id} source={source} />
        ))}
      </div>
    </section>
  );
}
