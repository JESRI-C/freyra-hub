import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ArrowRight,
  Plus,
  FileText,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Sprout,
  ShieldCheck,
  Coins,
  Globe,
  Cable,
  Brain,
  BookCheck,
  ClipboardList,
  Users,
  TrendingUp,
  Database,
  Info,
} from "lucide-react";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { getAllNatureProjectSummaries } from "@/services/projects-service";
import { getAllOpenActions } from "@/services/actions-service";
import { getAllReports } from "@/services/reports-service";

export const Route = createFileRoute("/app/overview")({
  head: () => ({ meta: [{ title: "Dashboard — GoFreyra" }] }),
  component: DashboardPage,
});


// ─── Mock data (display-only, restructure scope) ──────────────────────────────

const PORTFOLIO_KPIS = [
  { label: "Aktive naturprojekter", value: "12", hint: "3 nye sidste 30 dage" },
  { label: "Hektar under forvaltning", value: "428", hint: "Skov, eng, vådområde" },
  { label: "Grøn trepart-parathed", value: "64%", hint: "8 ud af 12 projekter" },
  { label: "Rapportparathed", value: "71%", hint: "Gennemsnit på tværs" },
  { label: "Metodekonfidens", value: "Middel", hint: "Variabel pr. projekt" },
  { label: "Lodsejer-risiko", value: "2", hint: "Projekter kræver dialog" },
  { label: "Datadækning", value: "83%", hint: "Sensorer · satellit · felt" },
  { label: "Offentlige impact-sider", value: "5", hint: "Publiceret + 3 i udkast" },
] as const;

const CRITICAL_ACTIONS = [
  {
    title: "Baseline mangler for vådområdeprojekt",
    project: "Skallebæk Wetland",
    tone: "danger" as const,
    cta: "Åbn baseline",
  },
  {
    title: "Lodsejer-brief klar til gennemsyn",
    project: "Regenerative Farm Pilot",
    tone: "warning" as const,
    cta: "Gennemgå",
  },
  {
    title: "Lav metodekonfidens i biodiversitetsvurdering",
    project: "Byggeri & natur · Kolding",
    tone: "warning" as const,
    cta: "Tilføj evidens",
  },
  {
    title: "Public impact-side mangler billeder",
    project: "Stream Restoration eDNA",
    tone: "default" as const,
    cta: "Tilføj medier",
  },
  {
    title: "Rapport klar til kommunal afgørelsesnote",
    project: "Skallebæk Wetland",
    tone: "success" as const,
    cta: "Send til kommune",
  },
];

const PROJECT_PORTFOLIO = [
  {
    name: "Skallebæk Wetland & Biodiversity",
    slug: "skallebaek-biodiversity-pilot",
    type: "Vådområde · biodiversitet",
    ha: 7.3,
    status: "Aktiv",
    tripart: 78,
    report: 84,
    method: "Høj",
    risk: "Lav",
    nextAction: "Send afgørelsesnote til kommunen",
  },
  {
    name: "Regenerative Farm Documentation Pilot",
    slug: "regenerative-farm-pilot",
    type: "Landbrug · regenerativ",
    ha: 142,
    status: "I dialog",
    tripart: 55,
    report: 48,
    method: "Middel",
    risk: "Medium",
    nextAction: "Færdiggør lodsejer-brief",
  },
  {
    name: "Stream Restoration with eDNA Monitoring",
    slug: "stream-restoration-edna",
    type: "Vandløb · eDNA-monitorering",
    ha: 19.4,
    status: "Aktiv",
    tripart: 62,
    report: 71,
    method: "Høj",
    risk: "Lav",
    nextAction: "Upload eDNA-resultater Q2",
  },
];

const WORKFLOW_STEPS = [
  "Project intake",
  "Area intelligence",
  "Stakeholders",
  "Economy",
  "Scenario",
  "Monitoring",
  "Methods",
  "Reports",
  "Public impact",
];

const REPOSITIONED_MODULES = [
  {
    label: "Monitoring & Field Data",
    was: "Smart Connect",
    desc: "Feltobservationer, IoT-sensorer, eDNA, drone- og satellitdata.",
    to: "/app/connect",
    icon: Cable,
  },
  {
    label: "Project Intelligence",
    was: "DecisionsIQ",
    desc: "Risici, næste handlinger og manglende dokumentation pr. projekt.",
    to: "/app/decisions",
    icon: Brain,
  },
  {
    label: "Documentation & Audit Trail",
    was: "ESG Ledger",
    desc: "Filer, metoder, beslutninger og evidenshistorik — sporbart.",
    to: "/app/ledger",
    icon: BookCheck,
  },
  {
    label: "Funding & Impact Potential",
    was: "Impact Exchange",
    desc: "Fonde, tilskud, ESG-finansiering og fremtidige nature credits.",
    to: "/app/impact",
    icon: Coins,
  },
  {
    label: "Report Engine",
    was: "Reports",
    desc: "Lodsejer-briefs, kommunale noter, baseline-rapporter og public impact.",
    to: "/app/reports",
    icon: FileText,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function DashboardPage() {
  return (
    <main className="p-6 max-w-[1500px] w-full mx-auto space-y-6">
      {/* 1. Hero */}
      <section className="rounded-2xl border bg-gradient-to-br from-leaf/20 via-card to-card p-8 relative overflow-hidden">
        <div className="max-w-3xl space-y-3">
          <Pill tone="success">Nature Project Command Center</Pill>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Fra naturmål til dokumenteret handling
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            GoFreyra samler naturprojekter, arealdata, lodsejerdialog, biodiversitetsmetoder,
            rapportering og offentlig dokumentation i ét arbejdsflow.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              to="/app/projects"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-95"
            >
              <Plus className="h-4 w-4" /> Opret naturprojekt
            </Link>
            <Link
              to="/app/reports"
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <FileText className="h-4 w-4" /> Generér rapport
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Portfolio KPI cards */}
      <section>
        <div className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          Porteføljeoverblik
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PORTFOLIO_KPIS.map((k) => (
            <Card key={k.label} className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{k.value}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{k.hint}</div>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* 3. Critical actions */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Kritiske handlinger"
            subtitle="Hvad kræver din opmærksomhed nu"
          />
          <ul className="px-5 pb-5 divide-y">
            {CRITICAL_ACTIONS.map((a) => (
              <li key={a.title} className="py-3 flex items-start gap-3">
                {a.tone === "danger" && (
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                )}
                {a.tone === "warning" && (
                  <ClipboardList className="h-4 w-4 text-warning-foreground shrink-0 mt-0.5" />
                )}
                {a.tone === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                )}
                {a.tone === "default" && (
                  <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.project}</div>
                </div>
                <button className="text-xs rounded-lg border px-2.5 py-1.5 hover:bg-muted shrink-0">
                  {a.cta}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* 6. Method confidence message */}
        <Card className="p-5 bg-leaf/10 border-leaf/30">
          <div className="inline-flex items-center gap-1.5 mb-2">
            <Sprout className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Metodekonfidens
            </span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/85">
            <strong>Biodiversitet er ikke CO₂.</strong> GoFreyra reducerer ikke natur til én simpel
            score. Hver vurdering kan kobles til metode, kontekst, datakilder, usikkerhed og
            anbefalet anvendelse.
          </p>
          <Link
            to="/app/decisions"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-3 hover:underline"
          >
            Se metodevurderinger <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      {/* 4. Project portfolio */}
      <Card>
        <CardHeader
          title="Naturprojekter"
          subtitle="Aktuel status pr. projekt"
          action={
            <Link
              to="/app/projects"
              className="text-xs inline-flex items-center gap-1 text-primary hover:underline"
            >
              Se alle <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
        <div className="px-5 pb-5 grid md:grid-cols-3 gap-3">
          {PROJECT_PORTFOLIO.map((p) => (
            <Link
              key={p.slug}
              to="/app/projects/$slug"
              params={{ slug: p.slug }}
              className="rounded-xl border p-4 hover:shadow-soft transition bg-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-sm leading-tight">{p.name}</div>
                <Pill tone={p.status === "Aktiv" ? "success" : "warning"}>{p.status}</Pill>
              </div>
              <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {p.type} · {p.ha} ha
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
                <KpiMini label="Tripart-parathed" value={`${p.tripart}%`} />
                <KpiMini label="Rapportparathed" value={`${p.report}%`} />
                <KpiMini label="Metodekonfidens" value={p.method} />
                <KpiMini label="Lodsejer-risiko" value={p.risk} />
              </div>
              <div className="border-t mt-3 pt-3 text-xs">
                <div className="text-muted-foreground">Næste handling</div>
                <div className="font-medium mt-0.5">{p.nextAction}</div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* 5. Workflow */}
      <Card className="p-5">
        <div className="text-sm font-semibold">Sådan arbejder vi fremover</div>
        <div className="text-xs text-muted-foreground mt-1">
          Standardflow for hvert naturprojekt — fra idé til offentlig dokumentation
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {WORKFLOW_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium inline-flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-leaf/40 text-primary grid place-items-center text-[10px] font-semibold">
                  {i + 1}
                </span>
                {step}
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 7. Module repositioning */}
      <section>
        <div className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          Eksisterende moduler i ny struktur
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPOSITIONED_MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.label}
                to={m.to}
                className="rounded-xl border bg-card p-4 hover:shadow-soft transition group"
              >
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-lg bg-leaf/20 text-primary grid place-items-center">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Tidl. {m.was}
                  </span>
                </div>
                <div className="font-semibold text-sm mt-3">{m.label}</div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{m.desc}</div>
                <div className="text-xs text-primary mt-3 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  Åbn modul <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xs font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
