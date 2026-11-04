import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkOrderObservationDraft } from "@/lib/work-order-observation-drafts.functions";
import type { ProjectScope } from "@/services/project-workspace-service";

/** The plan editor and its source panel share one authorized origin read. */
export function useWorkOrderObservationOrigin({
  scope,
  actionId,
  actorId,
  enabled,
}: {
  scope: ProjectScope;
  actionId: string;
  actorId: string;
  enabled: boolean;
}) {
  const load = useServerFn(getWorkOrderObservationDraft);
  return useQuery({
    queryKey: [
      "work-order-observation-origin",
      actorId,
      scope.organizationId,
      scope.projectId,
      actionId,
    ],
    queryFn: () => load({ data: { ...scope, actionId, expectedActorId: actorId } }),
    enabled,
    retry: false,
  });
}
