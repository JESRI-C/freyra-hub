import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FolderOpen, Leaf, MapPin, Plus } from "lucide-react";
import { Card, PageHeader, Pill, StatCard } from "@/components/ui-bits";
import { getProjects } from "@/services/lavbundService";
import {
  beregnKrediteretCO2,
  tiltagValidering,
} from "@/services/lavbundBeregning";
import type { LavbundsProjekt, ProjektStatus } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/")({
  head: () => ({ meta: [{ title: "LavbundsMRV — Projekter" }] }),
  component: LavbundIndexPage,
});

const STATUS_LABEL: Record<ProjektStatus, string> = {
  planlagt: "Planlagt",
  etablering: "Etablering",
  maaling: "Under måling",
  verificeret: "Verificeret",
  overdraget: "Overdraget",
};

const STATUS_TONE: Record<
  ProjektStatus,
  "default" | "success" | "warning" | "info"
> = {
  planlagt: "default",
  etablering: "info",
  maaling: "warning",
  verificeret: "success",
  overdraget: "default",
};

function fmtHa(v: number): string {
  return `${v.toLocaleString("da-DK", { maximumFractionDigits: 1 })} ha`;
}
function fmtTon(v: number): string {
  return `${v.toLocaleString("da-DK", { maximumFractionDigits: 1 })} t CO₂e/år`;
}

function ModulStatusStrip() {
  const items = [
    { navn: "Klima · CO₂", note: "aktiv · v12", tone: "success" as const },
    { navn: "Fosfor · brinkerosion", note: "aktiv · DCE 263", tone: "success" as const },
    { navn: "Fosfor · tilbageholdelse", note: "under import", tone: "default" as const },
    { navn: "Kvælstof · N", note: "under import", tone: "default" as const },
  ];
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Modulstatus
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <div
            key={i.navn}
            className="rounded-xl border bg-card px-3 py-2 text-xs flex items-center gap-2"
          >
            <span className="font-medium">{i.navn}</span>
            <Pill tone={i.tone}>{i.note}</Pill>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LavbundIndexPage() {
  const q = useQuery({
    queryKey: ["lavbund", "projects"],
    queryFn: getProjects,
  });

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="Lavbundsprojekter"
        description="Målt verifikation af CO₂- og fosforeffekt. Statens faktorer (v12 + DCE 263) anvendes uændret."
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            disabled
            title="Opret projekt kommer i næste fase"
          >
            <Plus className="h-4 w-4" />
            Nyt lavbundsprojekt
          </button>
        }
      />

      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState />}
      {q.data && q.data.length > 0 && <Loaded projects={q.data} />}
    </main>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5 animate-pulse h-24" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-8 text-center">
      <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
      <div className="mt-3 font-semibold">Kunne ikke hente lavbundsprojekter</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Prøv igen eller kontakt din administrator.
      </p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-xl border px-4 py-2 text-sm hover:bg-muted/40"
      >
        Prøv igen
      </button>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="p-10 text-center">
      <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground" />
      <div className="mt-3 font-semibold">Ingen lavbundsprojekter endnu</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Opret det første projekt for at komme i gang med MRV.
      </p>
      <button
        disabled
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium opacity-80"
      >
        <Plus className="h-4 w-4" /> Opret det første projekt
      </button>
    </Card>
  );
}

function Loaded({ projects }: { projects: LavbundsProjekt[] }) {
  const totalArea = projects.reduce((s, p) => s + p.samletArealHa, 0);
  const totalKrediteret = projects.reduce(
    (s, p) => s + beregnKrediteretCO2(p).krediteretTotal,
    0,
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Projekter"
          value={String(projects.length)}
          icon={<FolderOpen className="h-5 w-5" />}
        />
        <StatCard
          label="Samlet areal"
          value={fmtHa(totalArea)}
          icon={<MapPin className="h-5 w-5" />}
        />
        <StatCard
          label="Krediteret CO₂ (v12)"
          value={fmtTon(totalKrediteret)}
          icon={<Leaf className="h-5 w-5" />}
        />
      </div>

      <ModulStatusStrip />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Projekt</th>
                <th className="text-left px-4 py-3 font-medium">Kommune</th>
                <th className="text-right px-4 py-3 font-medium">Areal</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">
                  Krediteret t CO₂e/år
                </th>
                <th className="text-left px-4 py-3 font-medium">Bemærkning</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const co2 = beregnKrediteretCO2(p);
                const tilt = tiltagValidering(p);
                const aabne = p.afvigelser.filter((a) => a.aaben).length;
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        to="/app/lavbund"
                        className="font-medium hover:underline"
                      >
                        {p.navn}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.kommune}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtHa(p.samletArealHa)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Pill>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {co2.arealTjek === "fejl" ? (
                        <span className="text-destructive">Arealtjek fejler</span>
                      ) : (
                        fmtTon(co2.krediteretTotal)
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {aabne > 0 && (
                          <Pill tone="warning">
                            <AlertTriangle className="h-3 w-3" /> {aabne} åben(e)
                          </Pill>
                        )}
                        {!tilt.ok && <Pill tone="danger">Ingen tiltag</Pill>}
                        {aabne === 0 && tilt.ok && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground italic px-1">
        Anvendelsesområde: prioritering under tilskudsordninger og kommunens
        klimaregnskab. Metoden egner sig ikke til effektberegning ved salg af
        CO₂-kvoter og afviger fra den nationale opgørelse (jf. v12-vejledningen).
      </div>
    </>
  );
}
