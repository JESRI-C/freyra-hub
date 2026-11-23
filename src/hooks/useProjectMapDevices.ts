import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { getProjectMapDevices } from "@/services/monitoring/map-devices-service";

export function useProjectMapDevices(projectId: string | undefined) {
  const { user, currentOrg, loading, refreshing } = useAuth();
  const actorId = user?.id;
  const canReadSelectedProject =
    currentOrg?.projects.some((project) => project.id === projectId) ?? false;
  const enabled =
    !!actorId &&
    !!currentOrg?.id &&
    !!projectId &&
    canReadSelectedProject &&
    !loading &&
    !refreshing;
  const query = useQuery({
    queryKey: ["project-map-devices", actorId, currentOrg?.id, projectId],
    queryFn: () => getProjectMapDevices(projectId!, actorId!),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
  const devices = enabled && !query.isError ? (query.data?.devices ?? null) : null;
  const points = useMemo(
    () => devices?.filter((device) => device.coordinates !== null) ?? [],
    [devices],
  );
  const onlinePercent = devices?.length
    ? Math.round(
        (devices.filter((device) => device.status === "online").length / devices.length) * 100,
      )
    : null;
  const status = !enabled
    ? "Vælg en sag med aktuel adgang for at se enheder."
    : query.isError
      ? "Enheder eller målinger kunne ikke hentes. Prøv igen senere."
      : !devices
        ? "Henter registrerede enheder og målinger…"
        : !devices.length
          ? "Ingen enheder registreret på sagen."
          : `${points.length} af ${devices.length} enheder har en gemt position. ${devices.length - points.length} mangler position. ${devices.filter((device) => !device.measurement).length} mangler måling.`;
  return {
    devices,
    points,
    onlinePercent,
    status,
    refreshing: query.isFetching,
    refresh: enabled ? () => query.refetch() : undefined,
  };
}
