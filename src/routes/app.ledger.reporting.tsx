import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  FileBarChart,
  Download,
  FileSpreadsheet,
  FileText,
  Send,
  Copy,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { ReadinessScore } from "@/components/ledger/Primitives";
import { SAVED_REPORTS } from "@/lib/ledger-data";

export const Route = createFileRoute("/app/ledger/reporting")({
  head: () => ({ meta: [{ title: "Rapportering — ESG Ledger" }] }),
  component: ReportingPage,
});

const TYPES = ["ESG-overblik", "CSRD/ESRS readiness", "CO₂-bilag", "Naturimpact-bilag", "Revisionspakke", "Ledelsesnotat", "Kunde-/investorrapport"];
const AUDIENCES = ["Intern ledelse", "Revisor", "Kunde", "Investor", "Kommune", "ESG-team"];
const FOCUS = ["Klima", "Natur", "Biodiversitet", "CO₂", "Compliance", "Samlet status"];
const DETAIL = ["Kort", "Standard", "Teknisk"];

function ReportingPage() {
  const [type, setType] = useState("ESG-overblik");
  const [project, setProject] = useState("Portefølje");
  const [period, setPeriod] = useState("Q1 2026");
  const [audience, setAudience] = useState("ESG-team");
  const [focus, setFocus] = useState("Samlet status");
  const [detail, setDetail] = useState("Standard");

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        {/* Generator */}
        <Card>
          <CardHeader title="Rapportgenerator" subtitle="Vælg ramme — preview opdateres" />
          <div className="px-5 pb-5 space-y-4">
            <Group label="Rapporttype">
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <Chip key={t} active={t === type} onClick={() => setType(t)}>{t}</Chip>
                ))}
              </div>
            </Group>

            <Group label="Organisation / projekt">
              <select value={project} onChange={(e) => setProject(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm">
                <option>Portefølje</option>
                <option>Freyra Demo</option>
                <option>Nordic Coastal Restoration</option>
                <option>Skallebæk Biodiversity Pilot</option>
                <option>Urban Water Quality Program</option>
                <option>Regenerative Agriculture Kenya</option>
                <option>Danish Wetland Restoration</option>
                <option>Urban Biodiversity Corridor Copenhagen</option>
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

            <Group label="Detaljeniveau">
              <div className="grid grid-cols-3 gap-1.5">
                {DETAIL.map((d) => (
                  <Chip key={d} active={d === detail} onClick={() => setDetail(d)}>{d}</Chip>
                ))}
              </div>
            </Group>

            <button className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2 mt-2">
              <FileBarChart className="h-4 w-4" /> Generér rapport
            </button>
          </div>
        </Card>

        {/* Preview + readiness */}
        <div className="space-y-5">
          {/* Readiness check */}
          <Card>
            <CardHeader title="Rapport-readiness check" subtitle="Status før rapporten genereres" />
            <div className="px-5 pb-5 grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {[
                ["Datadækning", 91, true],
                ["Manglende data", 7, false],
                ["Verifikationsstatus", 74, true],
                ["Audit trail komplet", 92, true],
                ["Dokumenter klar", 88, true],
                ["Advarsler", 2, false],
              ].map(([l, v, ok]) => (
                <div key={l as string} className="flex items-center gap-3">
                  {ok ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0" />
                  )}
                  <div className="flex-1 text-sm">{l}</div>
                  <div className="text-sm font-medium tabular-nums">{(v as number) >= 0 ? `${v}${typeof v === "number" && (v as number) > 7 ? "%" : ""}` : v}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Preview */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Forhåndsvisning"
              subtitle={`${type} · ${project} · ${period}`}
              action={<Pill tone="info">Udkast</Pill>}
            />
            <div className="p-6 bg-background border-t">
              <div className="text-xs text-muted-foreground">FREYRA · {audience} · detaljeniveau: {detail}</div>
              <h2 className="text-xl font-semibold mt-1">{type} — {project}</h2>
              <div className="text-xs text-muted-foreground">Periode: {period} · Fokus: {focus}</div>

              <Section title="Executive summary">
                I {period} viser {project} en samlet ESG-score på 82/100 med stærk fremgang på CO₂ (-8%) og energi (-7%).
                Biodiversitetsindekset er steget til 78/100, og porteføljens dokumenterede naturimpact udgør 245.000 ton
                CO₂e potentiale fordelt på 6 verificerede projekter.
              </Section>
              <Section title="Centrale ESG-metrikker">
                <ul className="grid grid-cols-2 gap-2 text-xs">
                  <li>· Total CO₂e: 41.200 t (-8%)</li>
                  <li>· Energi: 14.820 MWh (-7%)</li>
                  <li>· Vand: 38.400 m³ (+2%)</li>
                  <li>· Affald: 412 t (-11%)</li>
                  <li>· Biodiversitetsindeks: 78/100</li>
                  <li>· Datakvalitet: 91%</li>
                </ul>
              </Section>
              <Section title="CO₂-overblik">
                Scope 1 leverer 6,8 kt, Scope 2 leverer 8,4 kt og Scope 3 leverer 25,9 kt. Samlede dokumenterede
                reduktioner via Impact Exchange udgør 41,2 kt. Datakonfidensen for CO₂-regnskabet er 84%.
              </Section>
              <Section title="Natur og biodiversitetsimpact">
                Porteføljen omfatter 12.850 ha beskyttet eller restaureret areal med vægtet biodiversitetsindeks 81/100.
                Skallebæk-pilotens vandløb og vådområde bidrager med højest fremgang i indikatorarter.
              </Section>
              <Section title="Datakvalitet & verifikation">
                18 ud af 24 datakilder er verificerede. 4 kilder kræver handling (sensor LF-12 offline, transport-API,
                affald CSV og DEFRA-faktor). Tredjepartsreview af Skallebæk er igangværende hos Bureau Veritas.
              </Section>
              <Section title="Risici og gaps">
                Scope 3 transportdata for Q2 mangler. Vandzone 3 sensor offline. Biodiversitetsmåling kræver
                feltverifikation før rapport. Emissionsfaktor for varme skal opdateres.
              </Section>
              <Section title="Anbefalede næste skridt">
                <ul className="text-xs space-y-1 list-disc pl-4">
                  <li>Genstart Sensor LF-12 og afslut zone-3 vanddata.</li>
                  <li>Opdater DEFRA-faktor for fjernvarme.</li>
                  <li>Afslut tredjepartsreview af Skallebæk inden Q3.</li>
                </ul>
              </Section>
              <Section title="Bilag">
                <div className="text-xs text-muted-foreground">A. Metodikoversigt · B. CO₂-bilag · C. Audit trail extract · D. Verifikationsnoter</div>
              </Section>
            </div>
          </Card>
        </div>
      </div>

      {/* Saved reports */}
      <Card className="overflow-hidden">
        <CardHeader title="Gemte rapporter" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Rapport</th>
              <th className="py-2">Type</th>
              <th className="py-2">Projekt</th>
              <th className="py-2">Periode</th>
              <th className="py-2">Oprettet</th>
              <th className="py-2">Status</th>
              <th className="py-2">Sendt til</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {SAVED_REPORTS.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium inline-flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> {r.name}</td>
                <td className="text-xs">{r.type}</td>
                <td className="text-xs">{r.project}</td>
                <td className="text-xs">{r.period}</td>
                <td className="text-xs text-muted-foreground">{r.created}</td>
                <td>
                  <Pill tone={r.status === "Eksporteret" ? "success" : r.status === "Klar" ? "info" : "warning"}>
                    {r.status}
                  </Pill>
                </td>
                <td className="text-xs">{r.sentTo}</td>
                <td className="pr-5 text-right">
                  <button className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    <Download className="h-3 w-3" /> Eksportér
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Export options */}
      <Card className="p-5">
        <div className="font-semibold mb-3">Eksportmuligheder</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          <ExportBtn icon={<Download className="h-4 w-4" />} label="Eksportér PDF" primary />
          <ExportBtn icon={<FileSpreadsheet className="h-4 w-4" />} label="Eksportér Excel" />
          <ExportBtn icon={<FileText className="h-4 w-4" />} label="Eksportér CSV" />
          <ExportBtn icon={<ShieldCheck className="h-4 w-4" />} label="Generér revisorpakke" />
          <ExportBtn icon={<Send className="h-4 w-4" />} label="Send til Dokumenter" />
          <ExportBtn icon={<Copy className="h-4 w-4" />} label="Kopiér tekst" />
        </div>
      </Card>
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
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded-full border ${active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
    >
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
    <button
      className={`text-sm rounded-lg px-3 py-2.5 inline-flex items-center justify-center gap-1.5 border ${
        primary ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
      }`}
    >
      {icon} {label}
    </button>
  );
}
