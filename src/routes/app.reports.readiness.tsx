import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, CheckCircle2, Send } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import {
  ReadinessScore,
  ReadinessBar,
  Section,
  Chip,
  MissingDataItem,
} from "@/components/reports/Primitives";
import { READINESS_DIMENSIONS, MISSING_DATA } from "@/lib/reports-data";

export const Route = createFileRoute("/app/reports/readiness")({ component: Page });

const LABELS = [
  { l: "Intern brug", ok: true },
  { l: "Klar til kunde", ok: true },
  { l: "Klar til investor", ok: false },
  { l: "Klar til revisor", ok: false },
  { l: "Ikke ekstern klar", ok: false },
];
const CHECKLIST = [
  ["Datakilder verificeret", true],
  ["Usikkerheder beskrevet", true],
  ["Audit trail inkluderet", true],
  ["Metode forklaret", true],
  ["Bilag vedlagt", false],
  ["Intern review gennemført", true],
  ["Godkendelse registreret", false],
];

function Page() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader
        title="Rapportklarhed"
        description="Er rapporten klar til at blive delt, eksporteret eller brugt eksternt?"
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-6 lg:col-span-1">
          <div className="text-sm font-semibold mb-3">Samlet score</div>
          <ReadinessScore value={82} size="lg" />
          <div className="mt-3 text-sm">
            Klar til intern brug — kræver <strong>3 rettelser</strong> før ekstern deling.
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {LABELS.map((l) => (
              <Chip key={l.l} tone={l.ok ? "success" : "muted"}>
                {l.ok ? "✓ " : "○ "}
                {l.l}
              </Chip>
            ))}
          </div>
        </Card>

        <Section title="Ekstern delings-tjekliste" subtitle="Kræves før ekstern brug">
          <ul className="space-y-1.5">
            {CHECKLIST.map(([l, ok]: [string, boolean]) => (
              <li
                key={l}
                className="flex items-center gap-2 text-sm p-2 rounded-lg border bg-muted/30"
              >
                <CheckCircle2
                  className={`h-4 w-4 ${ok ? "text-success" : "text-muted-foreground"}`}
                />
                <span className={ok ? "" : "text-muted-foreground"}>{l}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Risiko-label" subtitle="Hvor kan rapporten bruges?">
          <ul className="space-y-2 text-sm">
            <li className="p-2.5 rounded-lg bg-success/10 border border-success/20">
              ✓ Intern brug — godkendt
            </li>
            <li className="p-2.5 rounded-lg bg-success/10 border border-success/20">
              ✓ Klar til kunde
            </li>
            <li className="p-2.5 rounded-lg bg-warning/10 border border-warning/20">
              ○ Klar til investor — kræver verifikation
            </li>
            <li className="p-2.5 rounded-lg bg-warning/10 border border-warning/20">
              ○ Klar til revisor — kræver Scope 3-data
            </li>
          </ul>
        </Section>
      </div>

      <Section
        title="Klarhedsdimensioner"
        subtitle="Score, status, forklaring og anbefalet handling"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {READINESS_DIMENSIONS.map((d) => (
            <Card key={d.name} className="p-4">
              <div className="flex items-start justify-between">
                <div className="text-sm font-semibold">{d.name}</div>
                <Chip tone={d.score >= 85 ? "success" : "warning"}>{d.status}</Chip>
              </div>
              <div className="mt-2">
                <ReadinessBar value={d.score} />
              </div>
              <div className="text-xs text-muted-foreground mt-2">{d.why}</div>
              <div className="text-xs mt-2">
                <strong>Fix:</strong> {d.fix}
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Manglende data — blockers" subtitle="Skal håndteres for fuld ekstern klarhed">
        <div className="space-y-2">
          {MISSING_DATA.map((m) => (
            <MissingDataItem key={m.issue} {...m} onAction={() => {}} />
          ))}
        </div>
      </Section>

      <Section title="Anbefalede fixes" subtitle="AI-prioriteret handlingsliste">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-2">Issue</th>
                <th className="px-4 py-2">Hvorfor</th>
                <th className="px-4 py-2">Fix</th>
                <th className="px-4 py-2">Modul</th>
                <th className="px-4 py-2">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {MISSING_DATA.map((m) => (
                <tr key={m.issue}>
                  <td className="px-4 py-3 font-medium">{m.issue}</td>
                  <td className="px-4 py-3 text-xs">{m.why}</td>
                  <td className="px-4 py-3 text-xs">{m.fix}</td>
                  <td className="px-4 py-3">
                    <Chip tone="muted">{m.target}</Chip>
                  </td>
                  <td className="px-4 py-3 text-xs space-x-1">
                    <button className="rounded border bg-card px-2 py-1 inline-flex items-center gap-1">
                      <Send className="h-3 w-3" /> Send til {m.target}
                    </button>
                    <button className="rounded border bg-card px-2 py-1">
                      Medtag som usikkerhed
                    </button>
                    <button className="rounded border bg-card px-2 py-1">Fjern</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}
