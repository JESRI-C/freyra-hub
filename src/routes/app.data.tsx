import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader, Pill, StatCard } from "@/components/ui-bits";
import { Database, Layers, GitBranch, Clock } from "lucide-react";

export const Route = createFileRoute("/app/data")({
  head: () => ({ meta: [{ title: "Datakilder — GoFreyra" }] }),
  component: Page,
});

function Page() {
  return (
    <>
      <AppTopbar title="Datakilder" subtitle="Katalog over alle datasæt i dit projekt" />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
        <PageHeader
          title="Datakatalog"
          description="Søg, inspicér og verificér datasæt på tværs af kilder."
        />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Datasæt" value="142" delta={9} icon={<Database className="h-5 w-5" />} />
          <StatCard
            label="Lag"
            value="36"
            delta={3}
            icon={<Layers className="h-5 w-5" />}
            accent="bg-accent text-accent-foreground"
          />
          <StatCard
            label="Versioner"
            value="1.284"
            delta={18}
            icon={<GitBranch className="h-5 w-5" />}
            accent="bg-success/15 text-success"
          />
          <StatCard
            label="Senest synket"
            value="3 min"
            icon={<Clock className="h-5 w-5" />}
            accent="bg-warning/20 text-warning-foreground"
          />
        </div>

        <Card>
          <CardHeader title="Datasæt" />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr>
                <th className="px-5 py-2">Navn</th>
                <th className="py-2">Kilde</th>
                <th className="py-2">Format</th>
                <th className="py-2">Størrelse</th>
                <th className="py-2">Verifikation</th>
                <th className="py-2">Opdateret</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                [
                  "Tang_NDVI_2026",
                  "Sentinel-2",
                  "GeoTIFF",
                  "1,2 GB",
                  "success",
                  "Verificeret",
                  "i dag",
                ],
                [
                  "Vandtemperatur_LF",
                  "Aanderaa IoT",
                  "Parquet",
                  "84 MB",
                  "success",
                  "Verificeret",
                  "5 min",
                ],
                ["eDNA_Q2", "Felt", "CSV", "12 MB", "warning", "Afventer", "i går"],
                ["LiDAR_Skallebæk", "Drone", "LAS", "4,8 GB", "success", "Verificeret", "3 d"],
                ["Klimadata_DMI", "DMI API", "JSON", "320 MB", "success", "Verificeret", "1 t"],
              ].map((r, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 font-medium">{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>
                    <span className="font-mono text-xs">{r[2]}</span>
                  </td>
                  <td className="tabular-nums">{r[3]}</td>
                  <td>
                    <Pill tone={r[4] as "success" | "warning" | "danger" | "info" | "default"}>{r[5]}</Pill>
                  </td>
                  <td className="text-muted-foreground">{r[6]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
