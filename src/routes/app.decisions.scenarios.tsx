import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui-bits";
import { ScenarioComparison } from "@/components/decisions/ScenarioComparison";
import { SCENARIOS, PROJECTS } from "@/lib/decisions-data";
import { Sparkles, Save, FileText, ListPlus, FlaskConical, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/decisions/scenarios")({
  head: () => ({ meta: [{ title: "Scenarier — DecisionsIQ" }] }),
  component: Page,
});

function Page() {
  const [project, setProject] = useState<string>(PROJECTS[0]);
  const [horizon, setHorizon] = useState<string>("12");
  const [focus, setFocus] = useState<string>("CO₂");
  const [investment, setInvestment] = useState<string>("Medium");
  const [selected, setSelected] = useState<string[]>(["baseline", "bio", "co2"]);

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="Scenarier"
        description="Simulér mulige beslutninger og se forventet effekt på dine KPI'er."
      />

      {/* Builder */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">Scenariekonstruktør</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Projekt">
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
            >
              {PROJECTS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Tidshorisont">
            <SegGroup
              value={horizon}
              onChange={setHorizon}
              options={["3", "6", "12", "24"]}
              suffix=" mdr"
            />
          </Field>
          <Field label="Fokus">
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
            >
              {["CO₂", "Biodiversitet", "Vand", "ESG", "Datakvalitet"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Investeringsniveau">
            <SegGroup
              value={investment}
              onChange={setInvestment}
              options={["Lav", "Medium", "Høj"]}
            />
          </Field>
        </div>
      </Card>

      {/* Scenario cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {SCENARIOS.map((s) => {
          const active = selected.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`text-left rounded-2xl border p-4 transition shadow-soft ${
                active
                  ? "border-primary bg-card ring-2 ring-primary/20"
                  : "bg-card hover:shadow-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    s.color === "danger"
                      ? "bg-destructive/15 text-destructive"
                      : s.color === "leaf"
                        ? "bg-leaf/20 text-primary"
                        : s.color === "success"
                          ? "bg-success/15 text-success"
                          : s.color === "info"
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.tag}
                </span>
                {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
              <div className="mt-2 font-medium text-sm">{s.name}</div>
              <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {s.description}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
                <Mini label="ESG" value={s.metrics.esg} />
                <Mini label="CO₂e" value={s.metrics.co2} />
                <Mini label="Bio" value={s.metrics.bio.toFixed(2)} />
                <Mini label="Risiko" value={s.metrics.risk} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Comparison */}
      <Card>
        <CardHeader title="Sammenligning" subtitle="Valgte scenarier ved 12-måneders horisont" />
        <div className="px-5 pb-6">
          <ScenarioComparison scenarios={SCENARIOS} selectedIds={selected} />
        </div>
      </Card>

      {/* AI interpretation */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-leaf/15 text-primary grid place-items-center shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium">AI-fortolkning</div>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              På {horizon} måneders sigt giver scenariet{" "}
              <strong>"Biodiversitetsindsats øges"</strong> det stærkeste samlede afkast på ESG og
              naturimpact ved en medium investering. <strong>"CO₂-reduktion prioriteres"</strong>{" "}
              giver den største enkeltreduktion i CO₂e, men kræver høj investering. Scenariet{" "}
              <strong>"Ingen handling"</strong> hæver risikoniveauet til 81 og forværrer
              datakvalitet — anbefales fravalgt.
            </p>
          </div>
        </div>
      </Card>

      {/* Action plan */}
      <Card>
        <CardHeader title="Handlingsplan" subtitle="Konvertér valgt scenarie til konkrete skridt" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Skridt</th>
              <th className="py-2">Forventet effekt</th>
              <th className="py-2">Tidsramme</th>
              <th className="py-2">Krævet data</th>
              <th className="py-2">Dokumentationsværdi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[
              [
                "Plejeplan område B aftalt og igangsat",
                "+0,06 bio-indeks",
                "Måned 1–2",
                "Felt + drone",
                "Høj",
              ],
              ["Sentinel-2 NDVI tilkoblet projekt", "Bedre dækning", "Måned 1", "Satellit", "Høj"],
              [
                "Felt-app udrullet til 6 medarbejdere",
                "+14% datadækning",
                "Måned 2",
                "Felt-input",
                "Medium",
              ],
              [
                "Q3 statusnotat genereret og delt",
                "Verificeret kommunikation",
                "Måned 3",
                "AI + ledger",
                "Høj",
              ],
            ].map((r, i) => (
              <tr key={i}>
                <td className="px-5 py-3 font-medium">{r[0]}</td>
                <td className="text-success">{r[1]}</td>
                <td className="text-muted-foreground">{r[2]}</td>
                <td className="text-muted-foreground">{r[3]}</td>
                <td>{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4 flex flex-wrap gap-2 border-t">
          <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm shadow-soft">
            <Save className="h-4 w-4" /> Gem scenarie
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
            <FileText className="h-4 w-4" /> Tilføj til beslutningsnotat
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
            <ListPlus className="h-4 w-4" /> Opret handlingsplan
          </button>
        </div>
      </Card>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
function SegGroup({
  value,
  onChange,
  options,
  suffix = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  suffix?: string;
}) {
  return (
    <div className="flex rounded-lg border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 text-xs py-1.5 rounded-md transition ${value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o}
          {suffix}
        </button>
      ))}
    </div>
  );
}
function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}
