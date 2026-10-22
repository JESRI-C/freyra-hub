import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import { WizardSteps, Section, Chip, ReadinessBar } from "@/components/reports/Primitives";
import {
  REPORT_TYPES,
  ORGANIZATIONS,
  MODULE_DATA,
  AUDIENCES,
  TONES,
  LANGUAGES,
  DETAIL_LEVELS,
  EXPORT_FORMATS,
} from "@/lib/reports-data";

export const Route = createFileRoute("/app/reports/new")({
  component: Page,
});

const STEPS = ["Rapporttype", "Scope", "Datamoduler", "Målgruppe & tone", "Output", "Bekræft"];
const PERIODS = [
  "Q1 2026",
  "Q2 2026",
  "H1 2026",
  "År 2026 (YTD)",
  "Sidste 12 mdr.",
  "Brugerdefineret",
];

function Page() {
  const [step, setStep] = useState(0);
  const [type, setType] = useState(REPORT_TYPES[4].key);
  const [org, setOrg] = useState(ORGANIZATIONS[1]);
  const [period, setPeriod] = useState(PERIODS[1]);
  const [baseline, setBaseline] = useState(true);
  const [trend, setTrend] = useState(true);
  const [modules, setModules] = useState<string[]>([
    "DecisionsIQ:AI-anbefalinger",
    "Impact Exchange:Projektfakta",
    "ESG Ledger:CO₂-regnskab",
    "Smart Connect:Datakvalitet",
  ]);
  const [audience, setAudience] = useState("Kunde");
  const [tone, setTone] = useState("Strategisk");
  const [lang, setLang] = useState("Dansk");
  const [detail, setDetail] = useState("Standard");
  const [formats, setFormats] = useState<string[]>(["PDF"]);

  const t = REPORT_TYPES.find((x) => x.key === type)!;
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader
        title="Opret rapport"
        description="Vælg type, scope, data og output. AI genererer udkastet."
      />

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        <Card className="p-3 h-fit">
          <WizardSteps steps={STEPS} current={step} onSelect={setStep} />
        </Card>

        <Card className="p-6 min-h-[520px]">
          {step === 0 && (
            <Section
              title="Vælg rapporttype"
              subtitle="Hver type har sin egen anbefalede struktur og målgruppe"
            >
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {REPORT_TYPES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setType(r.key)}
                    className={`text-left rounded-xl border p-4 transition ${type === r.key ? "border-primary bg-leaf/15 shadow-soft" : "bg-card hover:bg-muted"}`}
                  >
                    <div className="text-sm font-semibold">{r.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 min-h-[40px]">{r.desc}</div>
                    <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                      <div>
                        <strong>Bedst til:</strong> {r.best}
                      </div>
                      <div>
                        <strong>Længde:</strong> {r.length}
                      </div>
                      <div>
                        <strong>Målgruppe:</strong> {r.audience}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.needs.map((n) => (
                        <Chip key={n}>{n}</Chip>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {step === 1 && (
            <Section title="Scope" subtitle="Organisation, projekt og periode">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Organisation">
                  <select
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
                  >
                    {ORGANIZATIONS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Projekt eller portefølje">
                  <select className="w-full rounded-lg border bg-card px-3 py-2 text-sm">
                    {ORGANIZATIONS.slice(1).map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                    <option>Hele porteføljen</option>
                  </select>
                </Field>
                <Field label="Periode">
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
                  >
                    {PERIODS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <div className="flex flex-col gap-2 mt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={baseline}
                      onChange={(e) => setBaseline(e.target.checked)}
                    />{" "}
                    Sammenlign med baseline
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={trend}
                      onChange={(e) => setTrend(e.target.checked)}
                    />{" "}
                    Inkludér historisk trend
                  </label>
                </div>
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section
              title="Vælg datamoduler"
              subtitle="Hvilke moduler skal levere indhold til rapporten"
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {MODULE_DATA.map((m) => (
                  <Card key={m.module} className="p-4">
                    <div className="text-sm font-semibold mb-2">{m.module}</div>
                    <ul className="space-y-1.5">
                      {m.items.map((it) => {
                        const k = `${m.module}:${it}`;
                        const on = modules.includes(k);
                        return (
                          <li key={it}>
                            <label className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-muted cursor-pointer">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggle(modules, k, setModules)}
                              />
                              {it}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ))}
              </div>
            </Section>
          )}

          {step === 3 && (
            <Section title="Målgruppe og tone">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Målgruppe">
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Tone">
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
                  >
                    {TONES.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Sprog">
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
                  >
                    {LANGUAGES.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Detaljeniveau">
                  <div className="grid grid-cols-2 gap-2">
                    {DETAIL_LEVELS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDetail(d)}
                        className={`rounded-lg border px-3 py-2 text-xs ${detail === d ? "border-primary bg-leaf/20" : "bg-card hover:bg-muted"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </Section>
          )}

          {step === 4 && (
            <Section title="Vælg output">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {EXPORT_FORMATS.map((f) => (
                  <label
                    key={f}
                    className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2.5 cursor-pointer ${formats.includes(f) ? "border-primary bg-leaf/20" : "bg-card hover:bg-muted"}`}
                  >
                    <input
                      type="checkbox"
                      checked={formats.includes(f)}
                      onChange={() => toggle(formats, f, setFormats)}
                    />
                    {f}
                  </label>
                ))}
              </div>
            </Section>
          )}

          {step === 5 && (
            <Section title="Bekræft og opret">
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <KV label="Rapporttype" v={t.name} />
                <KV label="Organisation" v={org} />
                <KV label="Periode" v={period} />
                <KV label="Målgruppe" v={`${audience} · ${tone}`} />
                <KV label="Sprog & detaljeniveau" v={`${lang} · ${detail}`} />
                <KV
                  label="Format"
                  v={
                    <div className="flex flex-wrap gap-1">
                      {formats.map((f) => (
                        <Chip key={f} tone="primary">
                          {f}
                        </Chip>
                      ))}
                    </div>
                  }
                />
                <KV
                  label="Inkluderede moduler"
                  v={
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(modules.map((m) => m.split(":")[0]))].map((m) => (
                        <Chip key={m}>{m}</Chip>
                      ))}
                    </div>
                  }
                />
                <KV label="Forventet klarhed" v={<ReadinessBar value={82} />} />
              </div>
              <div className="mt-4 p-3 rounded-lg border bg-warning/10 flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5" />
                <span>
                  2 advarsler: feltverifikation mangler i Zone C, og droneupload mangler EXIF GPS.
                  Disse vil markeres som usikkerhed.
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-lg border bg-card px-4 py-2 text-sm">
                  Gem som kladde
                </button>
                <Link
                  to="/app/reports/builder"
                  className="rounded-lg border bg-card px-4 py-2 text-sm inline-flex items-center gap-1.5"
                >
                  Fortsæt til bygger <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  to="/app/reports/preview"
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Generér første udkast
                </Link>
              </div>
            </Section>
          )}

          <div className="flex justify-between mt-6 pt-4 border-t">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="rounded-lg border bg-card px-4 py-2 text-sm disabled:opacity-40"
            >
              Tilbage
            </button>
            <button
              onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
              disabled={step === STEPS.length - 1}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-40"
            >
              Næste
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
function KV({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{v}</div>
    </div>
  );
}
