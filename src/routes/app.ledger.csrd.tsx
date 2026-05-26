import { createFileRoute } from "@tanstack/react-router";
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  ArrowRight,
  Sparkles,
  Map as MapIcon,
  Layers3,
  ClipboardCheck,
  FileText,
  Send,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";
import { ESGMetricCard, ReadinessScore } from "@/components/ledger/Primitives";
import { ESRS_CATEGORIES, GAPS } from "@/lib/ledger-data";

export const Route = createFileRoute("/app/ledger/csrd")({
  head: () => ({ meta: [{ title: "CSRD/ESRS — ESG Ledger" }] }),
  component: CSRDPage,
});

function CSRDPage() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <AiInsightBanner
        module="CSRD/ESRS readiness"
        tone="action"
        cacheKey={`csrd:${ESRS_CATEGORIES.length}:${GAPS.length}`}
        context={`Samlet readiness: 68%. Dækkede datapunkter: 142/210. Kritiske mangler: 12. ESRS-kategorier: ${ESRS_CATEGORIES.map((c) => `${c.id}=${c.readiness}%`).join(", ")}. Top-gaps: ${GAPS.slice(0, 4).map((g) => g.topic).join("; ")}.`}
      />

      <Card className="p-4 border-warning/30 bg-warning/10 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0 mt-0.5" />
        <div className="text-xs text-warning-foreground">
          Prototype-visning. CSRD/ESRS readiness er en intern rapportforberedelse — ikke en juridisk
          compliance-erklæring.
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <ESGMetricCard
          label="Samlet readiness"
          value="68"
          unit="%"
          trend={6}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <ESGMetricCard
          label="Dækkede datapunkter"
          value="142"
          unit="/210"
          trend={4}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <ESGMetricCard
          label="Kritiske mangler"
          value="12"
          trend={-3}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="warning"
        />
        <ESGMetricCard
          label="Klar til intern review"
          value="6"
          unit="områder"
          trend={2}
          icon={<ClipboardCheck className="h-4 w-4" />}
          tone="info"
        />
      </div>

      {/* ESRS cards */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ESRS_CATEGORIES.map((c) => (
          <Card key={c.id} className="p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{c.code}</div>
                <div className="font-semibold">{c.name}</div>
              </div>
              <Pill
                tone={
                  c.priority === "Høj" ? "danger" : c.priority === "Medium" ? "warning" : "default"
                }
              >
                {c.priority} prioritet
              </Pill>
            </div>
            <ReadinessScore label="Coverage" value={c.coverage} />
            <ReadinessScore label="Dokumentationsniveau" value={c.documentation} />
            <div className="grid grid-cols-3 gap-2 text-xs mt-1">
              <Stat label="Mangler" value={`${c.missing}`} />
              <Stat label="Ansvarlig" value={c.owner.split(" ")[0]} />
              <Stat label="Deadline" value={c.deadline} />
            </div>
          </Card>
        ))}
      </div>

      {/* Gap analysis */}
      <Card className="overflow-hidden">
        <CardHeader title="Gap-analyse" subtitle="Manglende og delvise datapunkter" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">ESRS-område</th>
              <th className="py-2">Datapunkt</th>
              <th className="py-2">Status</th>
              <th className="py-2">Mangler bevis</th>
              <th className="py-2">Datakilde</th>
              <th className="py-2">Prioritet</th>
              <th className="py-2">Ansvarlig</th>
              <th className="py-2">Deadline</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {GAPS.map((g, i) => (
              <tr key={i}>
                <td className="px-5 py-3 font-medium">{g.area}</td>
                <td>{g.dataPoint}</td>
                <td>
                  <Pill
                    tone={
                      g.status === "Mangler"
                        ? "danger"
                        : g.status === "Delvist"
                          ? "warning"
                          : "info"
                    }
                  >
                    {g.status}
                  </Pill>
                </td>
                <td className="text-xs text-muted-foreground">{g.evidence}</td>
                <td className="text-xs">{g.source}</td>
                <td>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      g.priority === "Høj"
                        ? "bg-destructive/15 text-destructive"
                        : g.priority === "Medium"
                          ? "bg-warning/20 text-warning-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {g.priority}
                  </span>
                </td>
                <td className="text-xs">{g.owner}</td>
                <td className="text-xs text-muted-foreground">{g.deadline}</td>
                <td className="pr-5 text-right">
                  <button className="text-xs text-primary hover:underline">Tildel handling</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Roadmap */}
        <Card className="lg:col-span-2">
          <CardHeader title="Readiness-roadmap" subtitle="Trin frem mod ekstern rapport" />
          <div className="px-5 pb-5">
            <ol className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {[
                { label: "Data mapping", icon: MapIcon, done: true },
                { label: "Source validation", icon: ClipboardCheck, done: true },
                { label: "Internal review", icon: Layers3, done: false, current: true },
                { label: "Dokumentationspakke", icon: FileText, done: false },
                { label: "Ekstern review", icon: ClipboardList, done: false },
                { label: "Rapporteksport", icon: Send, done: false },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <li key={s.label} className="rounded-xl border p-3 flex items-start gap-2.5">
                    <div
                      className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${
                        s.done
                          ? "bg-success/15 text-success"
                          : s.current
                            ? "bg-leaf/20 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Trin {i + 1}
                      </div>
                      <div className="text-sm font-medium leading-tight">{s.label}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Næste milepæl:{" "}
              <span className="text-foreground">Internal review · 2026-06-15</span>
            </div>
          </div>
        </Card>

        {/* AI note */}
        <Card>
          <CardHeader title="AI readiness-note" />
          <div className="px-5 pb-5 space-y-3">
            <div className="rounded-xl border p-4 bg-leaf/10 flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="text-sm leading-relaxed">
                Prioritér de 3 høj-risiko gaps i ESRS E1 og E4 først, valider DEFRA-faktorer for
                varme, og tilføj feltdata til Skallebæk-projektet. Det vil hæve readiness fra 68%
                til ~78% inden Q3.
              </div>
            </div>
            <ul className="text-xs space-y-1.5">
              <Action label="Prioritér høj-risiko gaps" />
              <Action label="Validér emissionsfaktorer (DEFRA 2025)" />
              <Action label="Tilføj manglende feltdata (Skallebæk)" />
              <Action label="Generér dokumentationspakke" />
            </ul>
          </div>
        </Card>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
function Action({ label }: { label: string }) {
  return (
    <li className="rounded-lg border p-2 flex items-center gap-2 hover:bg-muted/50 cursor-pointer">
      <ArrowRight className="h-3 w-3 text-primary" />
      <span>{label}</span>
    </li>
  );
}
