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


// ─── Static structure copy (module map & workflow) ───────────────────────────


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
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const { data: summaries } = useSuspenseQuery({
    queryKey: ["nature-project-summaries", orgId],
    queryFn: () => getAllNatureProjectSummaries(orgId),
  });
  const { data: openActions } = useSuspenseQuery({
    queryKey: ["all-open-actions", orgId],
    queryFn: () => getAllOpenActions(),
  });
  const { data: allReports } = useSuspenseQuery({
    queryKey: ["all-reports", orgId],
    queryFn: () => getAllReports(),
  });

  const kpis = useMemo(() => {
    const activeProjects = summaries.filter((s) => s.project.status !== "Afsluttet").length;
    const totalHa = summaries.reduce(
      (a, s) => a + (Number(s.project.geometry_area_ha) || 0),
      0,
    );
    const readinessVals = summaries
      .flatMap((s) => s.indicators)
      .filter((i) => i.key === "report_readiness" && i.value !== null)
      .map((i) => i.value as number);
    const avgReadiness =
      readinessVals.length > 0
        ? Math.round(readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length)
        : null;
    const dataSourceTotal = summaries.reduce((a, s) => a + (s.activeDataSources ?? 0), 0);
    const publishedReports = allReports.filter(
      (r) => r.status === "Publiceret" || r.status === "Offentliggjort",
    ).length;
    return [
      { label: "Aktive naturprojekter", value: String(activeProjects), hint: `${summaries.length} i alt` },
      { label: "Hektar under forvaltning", value: totalHa > 0 ? totalHa.toFixed(1) : "—", hint: "Fra projektarealer" },
      { label: "Rapportparathed", value: avgReadiness !== null ? `${avgReadiness}%` : "—", hint: "Gennemsnit på tværs" },
      { label: "Åbne handlinger", value: String(openActions.length), hint: "På tværs af projekter" },
      { label: "Aktive datakilder", value: String(dataSourceTotal), hint: "Sensorer · satellit · felt" },
      { label: "Rapporter i alt", value: String(allReports.length), hint: `${publishedReports} publiceret` },
    ];
  }, [summaries, openActions, allReports]);

  const criticalActions = useMemo(() => {
    const nameById = new Map(summaries.map((s) => [s.project.id, s.project.name] as const));
    return openActions.slice(0, 5).map((a) => ({
      id: a.id,
      title: a.title,
      project: nameById.get(a.project_id ?? "") ?? "—",
      tone:
        a.priority === "Høj"
          ? ("danger" as const)
          : a.priority === "Medium"
            ? ("warning" as const)
            : ("default" as const),
    }));
  }, [openActions, summaries]);

  const portfolio = useMemo(
    () =>
      summaries.slice(0, 6).map((s) => {
        const readiness = s.indicators.find((i) => i.key === "report_readiness");
        const bio = s.indicators.find((i) => i.key === "biodiversity_index");
        const quality = s.indicators.find((i) => i.key === "data_quality");
        return {
          id: s.project.id,
          name: s.project.name,
          slug: s.project.slug ?? s.project.id,
          type: s.project.project_type ?? "Naturprojekt",
          ha: Number(s.project.geometry_area_ha) || null,
          status: s.project.status ?? "—",
          readiness: readiness?.value ?? null,
          bio: bio?.value ?? null,
          quality: quality?.value ?? null,
          openActions: s.openActions,
        };
      }),
    [summaries],
  );

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
          {kpis.map((k) => (
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
            {criticalActions.map((a) => (
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
          {portfolio.map((p) => (
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
