import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { DecisionNotePreview } from "@/components/decisions/DecisionNotePreview";
import { SAVED_NOTES, PROJECTS } from "@/lib/decisions-data";
import { Sparkles, Download, Send, Copy, FileText } from "lucide-react";

export const Route = createFileRoute("/app/decisions/notes")({
  head: () => ({ meta: [{ title: "Beslutningsnotater — DecisionsIQ" }] }),
  component: Page,
});

const AUDIENCES = ["Intern ledelse", "Kommune", "Investor", "Kunde", "ESG-team"];
const FOCUS = ["Risiko", "ESG", "Naturimpact", "CO₂", "Datakvalitet", "Samlet status"];
const TONES = ["Kort", "Strategisk", "Teknisk", "Ledelsesvenlig"];
const PERIODS = ["Maj 2026", "Q2 2026", "April 2026", "Q1 2026"];

function Page() {
  const [project, setProject] = useState<string>(PROJECTS[0]);
  const [period, setPeriod] = useState<string>("Q2 2026");
  const [audience, setAudience] = useState<string>(AUDIENCES[0]);
  const [focus, setFocus] = useState<string>("Samlet status");
  const [tone, setTone] = useState<string>("Ledelsesvenlig");

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader title="Beslutningsnotater" description="Generér professionelle beslutningsnotater baseret på AI-analyse." />

      <div className="grid lg:grid-cols-[380px_1fr] gap-5">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <div className="text-sm font-medium">Generér nyt notat</div>
            </div>
            <div className="space-y-3">
              <FormField label="Projekt"><Select value={project} onChange={setProject} options={PROJECTS as readonly string[]} /></FormField>
              <FormField label="Periode"><Select value={period} onChange={setPeriod} options={PERIODS} /></FormField>
              <FormField label="Målgruppe"><Select value={audience} onChange={setAudience} options={AUDIENCES} /></FormField>
              <FormField label="Fokus"><Select value={focus} onChange={setFocus} options={FOCUS} /></FormField>
              <FormField label="Tone">
                <div className="flex rounded-lg border bg-card p-0.5">
                  {TONES.map((t) => (
                    <button key={t} onClick={() => setTone(t)}
                      className={`flex-1 text-xs py-1.5 rounded-md transition ${tone === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </FormField>
            </div>
            <button className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-soft">
              <Sparkles className="h-4 w-4" /> Generér notat
            </button>
          </Card>

          <Card className="p-4">
            <div className="text-xs text-muted-foreground">
              Notater bruger projektets verificerede data og kan tilføjes til ESG Ledger som permanent post.
            </div>
          </Card>
        </div>

        <Card>
          <div className="px-5 py-3 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-medium">Forhåndsvisning</div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-1.5 text-xs rounded-lg border bg-card px-2.5 py-1.5"><Download className="h-3.5 w-3.5" /> Eksportér PDF</button>
              <button className="inline-flex items-center gap-1.5 text-xs rounded-lg border bg-card px-2.5 py-1.5"><Send className="h-3.5 w-3.5" /> Send til rapporter</button>
              <button className="inline-flex items-center gap-1.5 text-xs rounded-lg border bg-card px-2.5 py-1.5"><Copy className="h-3.5 w-3.5" /> Kopiér tekst</button>
            </div>
          </div>
          <div className="p-6">
            <DecisionNotePreview project={project} audience={audience} focus={focus} tone={tone} period={period} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Gemte notater" subtitle="Bibliotek over tidligere genererede beslutningsnotater" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr><th className="px-5 py-2">Titel</th><th className="py-2">Projekt</th><th className="py-2">Målgruppe</th><th className="py-2">Oprettet</th><th className="py-2">Status</th><th className="py-2"></th></tr>
          </thead>
          <tbody className="divide-y">
            {SAVED_NOTES.map((n) => (
              <tr key={n.id}>
                <td className="px-5 py-3 font-medium flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> {n.title}</td>
                <td className="text-muted-foreground">{n.project}</td>
                <td>{n.audience}</td>
                <td className="text-muted-foreground">{n.date}</td>
                <td><Pill tone={n.status === "Eksporteret" ? "success" : n.status === "Sendt" ? "info" : "warning"}>{n.status}</Pill></td>
                <td className="pr-5 text-right"><button className="text-sm text-primary hover:underline">Åbn</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
