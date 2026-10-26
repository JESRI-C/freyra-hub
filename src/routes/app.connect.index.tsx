import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui-bits";
import { useConnectContext } from "@/lib/connect-context";
import { listDevices } from "@/services/monitoring/devices-service";
import { listDataSources } from "@/services/monitoring/data-sources-service";
import { listIssues } from "@/services/monitoring/quality-rules-service";

export const Route = createFileRoute("/app/connect/")({ component: Page });
function Page() {
  const { projectId, project } = useConnectContext();
  const data = useQuery({
    queryKey: ["monitoring-overview", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error("Vælg projekt");
      const [devices, sources, issues] = await Promise.all([
        listDevices(projectId),
        listDataSources(projectId),
        listIssues({ projectId, status: "open" }),
      ]);
      return { devices, sources, issues };
    },
  });
  return (
    <main className="p-6 space-y-5">
      <h1 className="text-2xl font-semibold">{project?.name ?? "Vælg et projekt"}</h1>
      <p className="text-muted-foreground">
        Projektets registrerede enheder, datakilder og kvalitetsproblemer.
      </p>
      {!projectId ? (
        <Link to="/select" className="underline">
          Vælg organisation og projekt
        </Link>
      ) : data.isPending ? (
        <p>Henter datagrundlag…</p>
      ) : data.isError ? (
        <p role="alert">Datagrundlaget kunne ikke hentes: {data.error.message}</p>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="p-5">
            <h2>Registrerede enheder</h2>
            <p className="text-2xl">{data.data.devices.length}</p>
          </Card>
          <Card className="p-5">
            <h2>Registrerede datakilder</h2>
            <p className="text-2xl">{data.data.sources.length}</p>
          </Card>
          <Card className="p-5">
            <h2>Åbne kvalitetsproblemer</h2>
            <p className="text-2xl">{data.data.issues.length}</p>
          </Card>
        </div>
      )}
      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Fra droneoriginaler til rapport</h2>
        <p>
          Upload før- og efterflyvninger på projektet. Afgræns vandløbet på kortet og kontrollér
          fotopositioner før analyse.
        </p>
        <p className="text-sm text-muted-foreground">
          Antal filer eller enheder er ikke et mål for datakvalitet. Rapportklarhed vurderes ud fra
          den enkelte rapports dokumenterede kilder.
        </p>
        <div className="flex gap-4">
          <Link to="/app/connect/map" className="underline text-primary">
            Kort og vandløb
          </Link>
          <Link to="/app/reports" className="underline text-primary">
            Rapporter
          </Link>
        </div>
      </Card>
    </main>
  );
}
