import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobDirectionsUrl } from "@/lib/job-directions";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import type { WorkOrderPlan } from "@/lib/work-order-plan";

const point = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
});

const siteRows = z
  .array(z.object({ id: z.string().uuid(), name: z.string(), geometry_geojson: z.unknown() }))
  .max(21);

export function FieldWorkOrderDirections({
  actorId,
  projectId,
  planVersionId,
  plan,
}: {
  actorId: string;
  projectId: string;
  planVersionId: string;
  plan: WorkOrderPlan;
}) {
  const stops = [
    ...(plan.siteId ? [{ siteId: plan.siteId, name: "Hovedlokalitet" }] : []),
    ...(plan.visitStops ?? []),
  ];
  const siteIds = stops.map(({ siteId }) => siteId);
  const sites = useQuery({
    queryKey: ["field-work-directions", actorId, projectId, planVersionId, siteIds],
    enabled: siteIds.length > 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const { data, error } = await client
        .from("sites")
        .select("id,name,geometry_geojson")
        .eq("project_id", projectId)
        .neq("status", "archived")
        .is("archived_at", null)
        .in("id", siteIds)
        .abortSignal(signal);
      if (error) throw new Error("Kunne ikke hente arbejdssteder.");
      const routes = new Map<string, { name: string; url: string }>();
      for (const location of siteRows.parse(data)) {
        const parsed = point.safeParse(location.geometry_geojson);
        if (!parsed.success) continue;
        const [longitude, latitude] = parsed.data.coordinates;
        const url = jobDirectionsUrl(latitude, longitude);
        if (url) routes.set(location.id, { name: location.name, url });
      }
      return routes;
    },
  });
  if (!siteIds.length) return null;
  return (
    <section
      aria-label="Vejvisning til arbejdssteder"
      className="space-y-2 rounded-xl border bg-card p-3 text-sm"
    >
      <h3 className="font-semibold">Vejvisning til arbejdssteder</h3>
      {sites.isPending && <p role="status">Henter arbejdssteder…</p>}
      {sites.isError && (
        <p role="alert">
          Arbejdsstederne kunne ikke hentes.{" "}
          <button type="button" onClick={() => void sites.refetch()} className="min-h-11 underline">
            Prøv igen
          </button>
        </p>
      )}
      {sites.data && (
        <ol className="list-decimal space-y-1 pl-5">
          {stops.map((stop) => {
            const route = sites.data.get(stop.siteId);
            return (
              <li key={stop.siteId}>
                {route ? (
                  <a
                    href={route.url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                  >
                    Vejvisning til {route.name} i Google Maps
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    {stop.name} · Vejvisning er ikke tilgængelig
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
