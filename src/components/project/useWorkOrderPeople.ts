import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjectWorkOrderPeople } from "@/lib/work-order-assignments.functions";
import type { ProjectScope } from "@/services/project-workspace-service";

export function useWorkOrderPeople(scope: ProjectScope, actorId?: string, enabled = true) {
  const load = useServerFn(listProjectWorkOrderPeople);
  const query = useInfiniteQuery({
    queryKey: ["work-order-people", actorId, scope],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      load({ data: { ...scope, expectedActorId: actorId!, afterUserId: pageParam, pageSize: 50 } }),
    getNextPageParam: (page) => page.nextAfterUserId ?? undefined,
    enabled: !!actorId && enabled,
    retry: false,
  });
  return {
    ...query,
    data: query.isError ? undefined : query.data?.pages.flatMap((page) => page.items),
  };
}
