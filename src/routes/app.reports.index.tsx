import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FilePlus, FileCheck, AlertTriangle, LayoutTemplate, ShieldCheck, Clock,
  Sparkles, Building, Leaf, BarChart3, Send, FileText, Briefcase,
} from "lucide-react";
import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui-bits";
import { ReadinessBar, ReportStatusBadge, ReadinessScore, Section } from "@/components/reports/Primitives";
import { RECENT_REPORTS } from "@/lib/reports-data";

export const Route = createFileRoute("/app/reports/")({
  component: Page,
});

function Page() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <Card className="p-6 bg-gradient-to-br from-leaf/30 via-card to-card">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="max-w-2xl">
            <div className="text-xs uppercase tracking-wider text-primary mb-2 font-semibold">Rapporter</div>
            <h1 className="text-2xl font-semibold tracking-tight">Byg, kvalitetstjek og eksportér professionelle ESG- og impact-rapporter</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Saml data, indsigter, dokumentation og anbefalinger i rapporter, der kan bruges af ledelse, kunder, investorer og revisorer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/reports/new" className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm shadow-soft"><FilePlus className="h-4 w-4" /> Opret ny rapport</Link>
            <Link to="/app/reports/library" className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm"><FileText className="h-4 w-4" /> Rapportbibliotek</Link>
            <Link to="/app/reports/templates" className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm"><LayoutTemplate className="h-4 w-4" /> Skabeloner</Link>
          </div>
        </div>
      </Card>

      <PageHeader title="Rapportcenter" description="Realtidsoverblik over rapportering, klarhed og aktivitet." />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Rapporter" value="24" icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Klar til eksport" value="8" icon={<FileCheck className="h-5 w-5" />} accent="bg-success/15 text-success" />
        <StatCard label="Kræver datagennemgang" value="5" icon={<AlertTriangle className="h-5 w-5" />} accent="bg-warning/20 text-warning-foreground" />
        <StatCard label="Brugte skabeloner" value="12" icon={<LayoutTemplate className="h-5 w-5" />} />
        <StatCard label="Ø datakvalitet" value="91%" icon={<ShieldCheck className="h-5 w-5" />} accent="bg-success/15 text-success" />
        <StatCard label="Seneste rapport" value="2 t" icon={<Clock className="h-5 w-5" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Section title="Rapportklarhed" subtitle="Pr. rapporttype">
          <div className="space-y-3">
            <ReadinessBar label="ESG-overblik" value={92} />
            <ReadinessBar label="CO₂-bilag" value={78} />
            <ReadinessBar label="Naturimpact" value={86} />
            <ReadinessBar label="Biodiversitet" value={74} />
            <ReadinessBar label="CSRD/ESRS readiness" value={68} />
            <ReadinessBar label="Revisorpakke" value={84} />
          </div>
        </Section>

        <Section title="Hurtige handlinger" subtitle="Genveje til typiske rapporter">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Opret ledelsesrapport", Briefcase],
              ["Generér CO₂-bilag", BarChart3],
              ["Byg investorrapport", Building],
              ["Eksportér revisorpakke", FileCheck],
              ["Lav projektfakta", Leaf],
              ["Send rapport til review", Send],
            ].map(([label, Icon]: any) => (
              <Link key={label} to="/app/reports/new" className="rounded-lg border bg-card p-3 text-left text-sm hover:bg-muted transition flex items-start gap-2">
                <div className="h-8 w-8 rounded-lg bg-leaf/20 text-primary grid place-items-center"><Icon className="h-4 w-4" /></div>
                <span className="flex-1">{label}</span>
              </Link>
            ))}
          </div>
        </Section>

        <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center"><Sparkles className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-semibold">AI rapporteringsindsigt</div>
              <p className="text-sm mt-2 text-foreground/90">
                <strong>Skallebæk-rapporten</strong> er tæt på eksportklar, men biodiversitetsafsnittet mangler feltverifikation, og datakvaliteten bør løftes fra 78% til mindst 85% før ekstern deling.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/app/reports/readiness" className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5">Åbn rapportklarhed</Link>
                <Link to="/app/reports/builder" className="text-xs rounded-lg border bg-card px-3 py-1.5">Åbn bygger</Link>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Seneste rapporter" subtitle="Klik for at åbne i bygger eller preview" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Rapportnavn</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Projekt/portefølje</th>
                <th className="px-4 py-3">Målgruppe</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Klarhed</th>
                <th className="px-4 py-3">Senest</th>
                <th className="px-4 py-3">Ejer</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {RECENT_REPORTS.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="text-[11px] text-muted-foreground">{r.id} · {r.version}</div></td>
                  <td className="px-4 py-3 text-xs">{r.type}</td>
                  <td className="px-4 py-3 text-xs">{r.scope}</td>
                  <td className="px-4 py-3 text-xs">{r.audience}</td>
                  <td className="px-4 py-3"><ReportStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3"><ReadinessScore value={r.readiness} size="sm" /></td>
                  <td className="px-4 py-3 text-xs">{r.updated}</td>
                  <td className="px-4 py-3 text-xs">{r.owner}</td>
                  <td className="px-4 py-3 text-xs"><Link to="/app/reports/preview" className="text-primary">Åbn</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
