import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, StatCard, Sparkline, Bars, Pill, PageHeader } from "@/components/ui-bits";
import { Leaf, Droplets, Activity, Trees, ArrowRight, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { getCurrentOrg, getCurrentProject, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/overview")({
  head: () => ({ meta: [{ title: "Oversigt — GoFreyra" }] }),
  component: OverviewPage,
});

const trend = [12, 14, 13, 18, 17, 22, 24, 23, 28, 30, 29, 34, 36, 38, 41];

function OverviewPage() {
  const { orgId, projectId } = useAuth();
  const org = getCurrentOrg(orgId);
  const project = getCurrentProject(orgId, projectId);

  return (
    <>
      <AppTopbar title="Oversigt" subtitle={`${org?.name} · ${project?.name}`} />
      <main className="p-6 max-w-[1400px] w-full mx-auto">
        <PageHeader
          title={`God morgen 👋`}
          description="Her er status på dit projekt og verificerede impact i denne periode."
          actions={
            <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-soft hover:opacity-95">
              <Sparkles className="h-4 w-4" /> Generér rapport
            </button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Verificeret CO₂e (ton)" value="1.284" delta={12} icon={<Leaf className="h-5 w-5" />} />
          <StatCard label="Biodiversitetsindeks" value="0,72" delta={4} icon={<Trees className="h-5 w-5" />} accent="bg-success/15 text-success" />
          <StatCard label="Vandkvalitet" value="92/100" delta={-2} icon={<Droplets className="h-5 w-5" />} accent="bg-accent text-accent-foreground" />
          <StatCard label="Aktive sensorer" value="48" delta={6} icon={<Activity className="h-5 w-5" />} accent="bg-warning/20 text-warning-foreground" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <Card className="lg:col-span-2">
            <CardHeader title="Impact udvikling" subtitle="Verificeret kumulativ effekt over tid" action={<Pill tone="success"><CheckCircle2 className="h-3 w-3" /> Live</Pill>} />
            <div className="px-5 pb-5">
              <Sparkline values={trend} />
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  { k: "+18%", v: "vækst i kvartalet" },
                  { k: "3", v: "nye datakilder" },
                  { k: "98%", v: "verifikationsgrad" },
                ].map((x) => (
                  <div key={x.v} className="rounded-xl border bg-background p-3">
                    <div className="text-lg font-semibold text-primary">{x.k}</div>
                    <div className="text-xs text-muted-foreground">{x.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Top bidragydere" subtitle="Datasæt med højeste signal" />
            <div className="px-5 pb-5">
              <Bars data={[
                { label: "Sentinel-2", value: 92 },
                { label: "DMI Klima", value: 78 },
                { label: "eDNA Prøver", value: 65 },
                { label: "Drone LiDAR", value: 54 },
                { label: "IoT vand", value: 41 },
              ]} />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <Card className="lg:col-span-2">
            <CardHeader title="Seneste aktivitet" subtitle="Hændelser på tværs af platformen" />
            <ul className="divide-y">
              {[
                { icon: CheckCircle2, tone: "text-success", t: "Datasæt 'Tang Nord-Q2' blev verificeret", s: "Emma Larsen · 2 timer siden" },
                { icon: AlertTriangle, tone: "text-warning-foreground", t: "Sensor #LF-12 mangler heartbeat", s: "Smart Connect · 4 timer siden" },
                { icon: Sparkles, tone: "text-primary", t: "DecisionsIQ foreslog ny restaureringszone", s: "AI · i dag kl. 09:21" },
                { icon: CheckCircle2, tone: "text-success", t: "ESG kvartalsrapport eksporteret", s: "Jesper Riel · i går" },
              ].map((x, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3">
                  <x.icon className={`h-4 w-4 ${x.tone}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{x.t}</div>
                    <div className="text-xs text-muted-foreground">{x.s}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Kommende deadlines" />
            <ul className="px-5 pb-5 space-y-3">
              {[
                { d: "12. jun", t: "ESG Q2 indsendelse", tone: "warning" as const },
                { d: "20. jun", t: "Audit møde — Verra", tone: "info" as const },
                { d: "30. jun", t: "Feltdata upload frist", tone: "default" as const },
              ].map((x) => (
                <li key={x.t} className="flex items-center gap-3">
                  <div className="h-10 w-12 rounded-lg bg-muted grid place-items-center text-xs font-semibold">{x.d}</div>
                  <div className="flex-1 text-sm">{x.t}</div>
                  <Pill tone={x.tone}>Planlagt</Pill>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </main>
    </>
  );
}
