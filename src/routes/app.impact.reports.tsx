import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  FileBarChart,
  Download,
  FileSpreadsheet,
  Send,
  Copy,
  Link2,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { DataQualityScore } from "@/components/impact/Primitives";
import { REPORTS, PROJECTS } from "@/lib/impact-data";

export const Route = createFileRoute("/app/impact/reports")({
  head: () => ({ meta: [{ title: "Impact-rapporter — Impact Exchange" }] }),
  component: ReportsPage,
});

const TYPES = ["Projektfakta", "Porteføljerapport", "ESG-bilag", "Verifikationsrapport", "Ledelsesnotat"];
const AUDIENCES = ["Intern ledelse", "Kunde", "Investor", "Kommune", "ESG-team"];
const FOCUS = ["CO₂", "Biodiversitet", "Naturimpact", "Verifikation", "Samlet impact"];

function ReportsPage() {
  const [type, setType] = useState("ESG-bilag");
  const [scope, setScope] = useState("Portefølje");
  const [period, setPeriod] = useState("Q1 2026");
  const [audience, setAudience] = useState("ESG-team");
  const [focus, setFocus] = useState("Samlet impact");

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        {/* Generator */}
        <Card>
          <CardHeader title="Rapportgenerator" subtitle="Sæt rammen — preview opdateres til højre" />
          <div className="px-5 pb-5 space-y-4">
            <Group label="Rapporttype">
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <Chip key={t} active={t === type} onClick={() => setType(t)}>{t}</Chip>
                ))}
              </div>
            </Group>

            <Group label="Projekt / portefølje">
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm">
                <option>Portefølje</option>
                {PROJECTS.map((p) => <option key={p.id}>{p.title}</option>)}
              </select>
            </Group>

            <Group label="Periode">
              <div className="grid grid-cols-4 gap-1.5">
                {["Q1 2026", "Q4 2025", "H2 2025", "År 2025"].map((p) => (
                  <Chip key={p} active={p === period} onClick={() => setPeriod(p)}>{p}</Chip>
                ))}
              </div>
            </Group>

            <Group label="Målgruppe">
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCES.map((a) => (
                  <Chip key={a} active={a === audience} onClick={() => setAudience(a)}>{a}</Chip>
                ))}
              </div>
            </Group>

            <Group label="Fokus">
              <div className="flex flex-wrap gap-1.5">
                {FOCUS.map((f) => (
                  <Chip key={f} active={f === focus} onClick={() => setFocus(f)}>{f}</Chip>
                ))}
              </div>
            </Group>

            <button className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2 mt-2">
              <FileBarChart className="h-4 w-4" /> Generér rapport
            </button>
          </div>
        </Card>

        {/* Preview */}
        <Card className="overflow-hidden">
          <CardHeader
            title="Forhåndsvisning"
            subtitle={`${type} · ${scope} · ${period}`}
            action={<Pill tone="info">Udkast</Pill>}
          />
          <div className="p-6 bg-background border-t">
            <div className="text-xs text-muted-foreground">FREYRA · {audience}</div>
            <h2 className="text-xl font-semibold mt-1">{type} — {scope}</h2>
            <div className="text-xs text-muted-foreground">Periode: {period} · Fokus: {focus}</div>

            <Section title="Resumé">
              Porteføljen leverer i {period} dokumenteret impact på tværs af 6 verificerede natur- og klimaprojekter
              med samlet potentiale på 245.000 ton CO₂e og 12.850 ha beskyttet/restaureret areal. Biodiversitetsindekset
              ligger på 81/100, og rapportklarheden er 74%.
            </Section>
            <Section title="Centrale impact-metrikker">
              <ul className="grid grid-cols-2 gap-2 text-xs">
                <li>· CO₂e potentiale: 245.000 t</li>
                <li>· CO₂e reduceret (akk.): 41.200 t</li>
                <li>· Areal beskyttet: 9.412 ha</li>
                <li>· Areal restaureret: 3.438 ha</li>
                <li>· Biodiversitetsindeks: 81/100</li>
                <li>· Datakvalitet: 89%</li>
              </ul>
            </Section>
            <Section title="Verifikationsstatus">
              4 projekter er fuldt verificerede af DNV, Verra og Plan Vivo. 2 projekter er under tredjepartsverifikation
              hos Bureau Veritas, planlagt afsluttet i Q3.
            </Section>
            <Section title="Datakilder">
              Sensorer · Sentinel-2 · Drone · Feltregistrering · Akkrediterede laboratorier · Tredjepartsverifikation.
              Alle målinger registreret i ESG Ledger med tidsstempel og kildeangivelse.
            </Section>
            <Section title="Risici og usikkerheder">
              Geografisk koncentration i Nordeuropa (4/6). Måleusikkerhed på CO₂-flux ±18% for to projekter.
              Verifikationsafhængighed af 2 partnere — anbefales udvidet.
            </Section>
            <Section title="Anbefalede næste skridt">
              <ul className="text-xs space-y-1 list-disc pl-4">
                <li>Fremryk verifikation af Danish Wetland Restoration.</li>
                <li>Suppler porteføljen med 1 marint projekt i Sydøstasien.</li>
                <li>Udvid feltkadence i Q3 for Skallebæk-projektet.</li>
              </ul>
            </Section>
            <Section title="Bilag">
              <div className="text-xs text-muted-foreground">A. Metodikoversigt · B. Projektfaktaark · C. Ledger-uddrag · D. Verifikationsnoter</div>
            </Section>
          </div>
        </Card>
      </div>

      {/* Saved reports */}
      <Card className="overflow-hidden">
        <CardHeader title="Gemte rapporter" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Rapport</th>
              <th className="py-2">Type</th>
              <th className="py-2">Scope</th>
              <th className="py-2">Oprettet</th>
              <th className="py-2">Status</th>
              <th className="py-2">Sendt til Ledger</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {REPORTS.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium inline-flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> {r.name}</td>
                <td className="text-xs">{r.type}</td>
                <td className="text-xs">{r.scope}</td>
                <td className="text-xs text-muted-foreground">{r.created}</td>
                <td><Pill tone={r.status === "Eksporteret" ? "success" : r.status === "Klar" ? "info" : "warning"}>{r.status}</Pill></td>
                <td>{r.sentToLedger ? <Pill tone="success">Sendt</Pill> : <Pill>Ikke sendt</Pill>}</td>
                <td className="pr-5 text-right">
                  <button className="text-xs text-primary hover:underline inline-flex items-center gap-1"><Download className="h-3 w-3" /> Eksportér</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Actions + readiness */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-5">
        <Card className="p-5">
          <div className="font-semibold mb-3">Eksportmuligheder</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <ExportBtn icon={<Download className="h-4 w-4" />} label="Eksportér PDF" primary />
            <ExportBtn icon={<FileSpreadsheet className="h-4 w-4" />} label="Eksportér Excel" />
            <ExportBtn icon={<Send className="h-4 w-4" />} label="Send til ESG Ledger" />
            <ExportBtn icon={<Copy className="h-4 w-4" />} label="Kopiér tekst" />
            <ExportBtn icon={<Link2 className="h-4 w-4" />} label="Delbart link" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Rapporteringsklarhed" subtitle="Score for valgt scope" />
          <div className="px-5 pb-5 space-y-3">
            {[
              ["Datadækning", 90],
              ["Verifikation", 82],
              ["Metode", 88],
              ["Audit trail", 91],
              ["ESG-relevans", 84],
            ].map(([l, v]) => (
              <DataQualityScore key={l as string} label={l as string} value={v as number} />
            ))}
            <div className="pt-2 mt-2 border-t flex items-center gap-2 text-xs text-success">
              <ShieldCheck className="h-4 w-4" /> Klar til ekstern brug
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      {children}
    </div>
  );
}
function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`text-xs px-2.5 py-1.5 rounded-full border ${active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
      {children}
    </button>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 pt-3 border-t">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{title}</div>
      <div className="text-sm leading-relaxed text-foreground/85">{children}</div>
    </div>
  );
}
function ExportBtn({ icon, label, primary }: { icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button className={`text-sm rounded-lg px-3 py-2.5 inline-flex items-center justify-center gap-1.5 border ${primary ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
      {icon} {label}
    </button>
  );
}
