import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { Cable, Wifi, Database, Satellite, Plus, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/app/connect")({
  head: () => ({ meta: [{ title: "Smart Connect — GoFreyra" }] }),
  component: Page,
});

const integrations = [
  { name: "Sentinel-2", type: "Satellit", icon: Satellite, status: "Aktiv", tone: "success" as const, freq: "Hver 5. dag" },
  { name: "DMI Klima API", type: "Vejrdata", icon: Wifi, status: "Aktiv", tone: "success" as const, freq: "Time" },
  { name: "Aanderaa IoT", type: "Sensor", icon: Cable, status: "Advarsel", tone: "warning" as const, freq: "Realtid" },
  { name: "Postgres - DataLake", type: "Database", icon: Database, status: "Aktiv", tone: "success" as const, freq: "Stream" },
  { name: "Drone LiDAR", type: "Felt", icon: Satellite, status: "Inaktiv", tone: "default" as const, freq: "Manuelt" },
];

function Page() {
  return (
    <>
      <AppTopbar title="Smart Connect" subtitle="Forbind sensorer, API'er og databaser i ét flow" />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
        <PageHeader
          title="Integrationer"
          description="Træk data ind fra felt, satellit og partnere — verificeret automatisk."
          actions={<button className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm shadow-soft"><Plus className="h-4 w-4" /> Tilføj integration</button>}
        />

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {integrations.map((x) => (
            <Card key={x.name} className="p-5">
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-xl bg-leaf/20 text-primary grid place-items-center"><x.icon className="h-5 w-5" /></div>
                <Pill tone={x.tone}>
                  {x.tone === "success" ? <CheckCircle2 className="h-3 w-3" /> : x.tone === "warning" ? <AlertTriangle className="h-3 w-3" /> : null}
                  {x.status}
                </Pill>
              </div>
              <div className="mt-3 font-medium">{x.name}</div>
              <div className="text-xs text-muted-foreground">{x.type} · {x.freq}</div>
              <div className="flex gap-2 mt-4">
                <button className="flex-1 text-sm rounded-lg border bg-card py-2 hover:bg-muted">Konfigurér</button>
                <button className="flex-1 text-sm rounded-lg bg-secondary py-2">Logs</button>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader title="Pipeline status" subtitle="Live status på data ingest" />
          <ul className="divide-y">
            {[
              ["Sentinel-2 → Verificering", "Kører", "success"],
              ["DMI → DataLake", "Kører", "success"],
              ["Aanderaa IoT → Anomaly", "Forsinket", "warning"],
              ["Drone LiDAR → Geo-DB", "Pauset", "default"],
            ].map((r, i) => (
              <li key={i} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 text-sm">{r[0]}</div>
                <Pill tone={r[2] as any}>{r[1]}</Pill>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </>
  );
}
