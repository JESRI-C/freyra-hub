import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, ApprovalStepper, Chip, ReadinessScore } from "@/components/reports/Primitives";
import { Send, FileText, FileSpreadsheet, Link2, ShieldCheck, Archive, Briefcase, FileType2, CheckCircle2, AlertTriangle, MessageSquare, Download, Share2, ArrowRight, Plus } from "lucide-react";

export const Route = createFileRoute("/app/reports/approval")({
  head: () => ({ meta: [{ title: "Godkendelse & eksport — GoFreyra" }] }),
  component: ApprovalPage,
});

const STEPS = ["Kladde", "Datatjek", "Intern review", "Godkendelse", "Eksport", "Arkivering"];

const REVIEWERS = [
  { name: "Jesper Riel", role: "Admin", status: "Godkendt", when: "I går · 14:22", initials: "JR" },
  { name: "Emma Larsen", role: "Sustainability Lead", status: "Godkendt", when: "I går · 11:08", initials: "EL" },
  { name: "Mikkel Holm", role: "Data Manager", status: "Afventer", when: "Tildelt 2 dage siden", initials: "MH" },
  { name: "Eksternt review (DNV)", role: "Verifier", status: "Ikke startet", when: "Valgfri", initials: "DN" },
];

const COMMENTS = [
  { who: "Jesper Riel", when: "I går", text: "Forkort executive summary til 2 afsnit. Ellers ser det stærkt ud.", resolved: true },
  { who: "Mikkel Holm", when: "2 dage siden", text: "Kan vi tilføje datakvalitets-score per kilde i bilaget?", resolved: true },
  { who: "Emma Larsen", when: "3 dage siden", text: "Verificér at biodiversitetsindeks bruger Q2-baseline, ikke Q1.", resolved: false },
];

const APPROVAL_CHECKS = [
  { label: "Data tjekket og verificeret", done: true },
  { label: "Metode dokumenteret", done: true },
  { label: "Sproglig review gennemført", done: true },
  { label: "Risiko- og usikkerhedsafsnit godkendt", done: true },
  { label: "Bilag inkluderet", done: true },
  { label: "Ekstern brug godkendt af ledelsen", done: false },
  { label: "Endelig eksport godkendt", done: false },
];

const EXPORT_OPTIONS = [
  { key: "pdf", icon: FileText, name: "PDF", best: "Ekstern deling, kunder, investorer", includes: "Forside, alle valgte sektioner, bilag, audit trail-reference", status: "Klar", tone: "success" as const },
  { key: "word", icon: FileType2, name: "Word", best: "Redigerbar version til samarbejde", includes: "Tekst, tabeller, billeder — bevarer struktur", status: "Klar", tone: "success" as const },
  { key: "excel", icon: FileSpreadsheet, name: "Excel", best: "Datatabeller og rådata", includes: "ESG-metrics, CO₂-regnskab, datakilder, emissionsfaktorer", status: "Klar", tone: "success" as const },
  { key: "csv", icon: FileSpreadsheet, name: "CSV", best: "Maskinlæsbare data til import", includes: "Flade datatabeller fra ESG Ledger", status: "Klar", tone: "success" as const },
  { key: "link", icon: Link2, name: "Delbart link", best: "Hurtig deling med adgangskontrol", includes: "Skrivebeskyttet preview, valgfri udløbsdato", status: "Klar", tone: "success" as const },
  { key: "audit", icon: ShieldCheck, name: "Revisorpakke", best: "Ekstern revision og verifikation", includes: "Rapport + audit trail + emissionsfaktorer + dokumenter", status: "Kræver godkendelse", tone: "warning" as const },
  { key: "ledger", icon: Archive, name: "ESG Ledger archive", best: "Permanent, immutable arkivering", includes: "Versioneret rapport + hash i ledger", status: "Klar", tone: "success" as const },
  { key: "board", icon: Briefcase, name: "Board pack", best: "Bestyrelsesmøder", includes: "Forkortet ledelsesresumé + kerne-KPIs + risici", status: "Klar", tone: "success" as const },
];

function ApprovalPage() {
  const [current, setCurrent] = useState(3);
  const [exported, setExported] = useState<string | null>(null);
  const [checks, setChecks] = useState(APPROVAL_CHECKS);

  const allOk = checks.every((c) => c.done);

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary"><Send className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-semibold">Godkendelse & eksport</h1>
            <p className="text-xs text-muted-foreground">Skallebæk Naturimpact Q2 2026 · v1.4 · Kunde</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="muted">RPT-2041</Chip>
          <ReadinessScore value={82} size="sm" />
        </div>
      </div>

      <Section title="Godkendelsesflow" subtitle="Klik på et trin for at se detaljer" action={<Chip tone="primary">Trin {current + 1} af {STEPS.length}</Chip>}>
        <ApprovalStepper current={current} steps={STEPS} />
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setCurrent(i)}
              className={`px-2.5 py-1 rounded-md border ${i === current ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Tildelte reviewere" value="4" icon={<MessageSquare className="h-5 w-5" />} />
        <StatCard label="Godkendelser" value="2 / 3" icon={<CheckCircle2 className="h-5 w-5" />} accent="bg-success/15 text-success" />
        <StatCard label="Åbne kommentarer" value="1" icon={<AlertTriangle className="h-5 w-5" />} accent="bg-warning/15 text-warning-foreground" />
        <StatCard label="Senest reviewet" value="I går" icon={<MessageSquare className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Reviewere" subtitle="Tildelte personer og deres status">
          <div className="space-y-2">
            {REVIEWERS.map((r) => (
              <div key={r.name} className="flex items-center gap-3 p-2.5 rounded-lg border">
                <div className="h-9 w-9 rounded-full bg-leaf/30 text-primary grid place-items-center text-xs font-semibold">{r.initials}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground">{r.role} · {r.when}</div>
                </div>
                <Chip tone={r.status === "Godkendt" ? "success" : r.status === "Afventer" ? "warning" : "muted"}>{r.status}</Chip>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Kommentarer" subtitle="Review-feedback og afklaringer" action={<button className="text-xs rounded-lg border bg-card px-2.5 py-1 inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Ny</button>}>
          <div className="space-y-2">
            {COMMENTS.map((c, i) => (
              <div key={i} className={`rounded-lg border p-3 ${c.resolved ? "bg-success/5" : "bg-warning/5"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium">{c.who}</div>
                  <div className="flex items-center gap-2">
                    <Chip tone={c.resolved ? "success" : "warning"}>{c.resolved ? "Løst" : "Åben"}</Chip>
                    <span className="text-[11px] text-muted-foreground">{c.when}</span>
                  </div>
                </div>
                <p className="text-sm mt-1.5">{c.text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Godkendelses-checkliste" subtitle="Skal være opfyldt før ekstern eksport">
          <ul className="space-y-1.5">
            {checks.map((c, i) => (
              <li key={c.label}>
                <button onClick={() => setChecks((prev) => prev.map((x, j) => j === i ? { ...x, done: !x.done } : x))}
                  className="w-full flex items-center gap-3 text-left px-2 py-1.5 rounded-lg hover:bg-muted">
                  <span className={`h-5 w-5 rounded-md border grid place-items-center flex-shrink-0 ${c.done ? "bg-success border-success text-white" : "bg-card"}`}>
                    {c.done && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </span>
                  <span className={`text-sm flex-1 ${c.done ? "" : "text-foreground"}`}>{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className={`mt-3 rounded-lg p-2.5 text-xs ${allOk ? "bg-success/10 text-success" : "bg-warning/10 text-warning-foreground"}`}>
            {allOk ? "Alle krav opfyldt — klar til endelig eksport." : "Mangler godkendelse på ledelses- og ekstern brug."}
          </div>
        </Section>
      </div>

      <Section title="Eksportformater" subtitle="Vælg det format, modtageren skal bruge">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {EXPORT_OPTIONS.map((e) => {
            const Icon = e.icon;
            const isExported = exported === e.key;
            return (
              <div key={e.key} className="rounded-xl border bg-card p-4 flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-xl grid place-items-center bg-leaf/30 text-primary"><Icon className="h-4 w-4" /></div>
                  <Chip tone={isExported ? "success" : e.tone}>{isExported ? "Eksporteret" : e.status}</Chip>
                </div>
                <div className="mt-3 text-sm font-semibold">{e.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{e.best}</div>
                <div className="text-xs text-foreground/80 mt-2 flex-1">{e.includes}</div>
                <button onClick={() => setExported(e.key)}
                  className={`mt-3 w-full rounded-lg px-3 py-1.5 text-xs inline-flex items-center justify-center gap-1.5 transition ${isExported ? "bg-success/15 text-success border border-success/20" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
                  {isExported ? <><CheckCircle2 className="h-3.5 w-3.5" /> Klar til download</> : <><Download className="h-3.5 w-3.5" /> Eksportér</>}
                </button>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Endelig eksport-preview" subtitle="Sådan ser den genererede fil ud">
          <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
            <Row label="Filnavn" v="skallebaek-naturimpact-q2-2026-v1.4.pdf" />
            <Row label="Version" v="v1.4" />
            <Row label="Sider" v="18" />
            <Row label="Sektioner" v="14 inkluderet" />
            <Row label="Bilag" v="Metode, datatabel, audit extract" />
            <Row label="Audit reference" v="LDG-2041 · sha256:8f3c…42a1" />
            <Row label="ESG Ledger archive" v={<Chip tone="success">Klar</Chip>} />
            <Row label="Advarsler" v={<Chip tone="warning">1: feltverifikation Zone C</Chip>} />
          </div>
        </Section>

        <Section title="Efter eksport" subtitle="Fortsæt arbejdet med rapporten">
          <div className="grid grid-cols-1 gap-2">
            {[
              { icon: Archive, label: "Gem i ESG Ledger" },
              { icon: FileText, label: "Send til Dokumenter" },
              { icon: ArrowRight, label: "Opret opfølgende handlinger" },
              { icon: Share2, label: "Del link" },
              { icon: Archive, label: "Arkivér rapport" },
              { icon: Plus, label: "Start ny version" },
            ].map((a) => {
              const Icon = a.icon;
              return (
                <button key={a.label} className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card hover:bg-muted text-sm">
                  <Icon className="h-4 w-4 text-primary" />{a.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="AI-anbefaling" subtitle="DecisionsIQ foreslår">
          <div className="rounded-xl border bg-leaf/10 p-4 text-sm">
            <p>Rapporten er klar til intern brug og kunde-deling, men <span className="font-medium">ekstern revisor-brug bør afvente feltverifikation i Zone C</span>. Generér også en kort 2-siders <span className="font-medium">Projektfakta</span>-version til sales og partner-udsendelse.</p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <button className="text-xs rounded-lg bg-primary text-primary-foreground px-2.5 py-1">Generér Projektfakta</button>
              <button className="text-xs rounded-lg border bg-card px-2.5 py-1">Send til feltteam</button>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}

function Row({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right">{v}</span>
    </div>
  );
}
