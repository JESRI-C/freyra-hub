import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import { WizardSteps, Section, Chip } from "@/components/connect/Primitives";
import { PROJECTS, ZONES, SOURCE_TYPES, VALIDATION_RULES } from "@/lib/connect-data";

export const Route = createFileRoute("/app/connect/add")({
  component: Page,
});

const STEPS = [
  "Vælg kildetype",
  "Projekt og zone",
  "Forbindelsesmetode",
  "Konfigurer felter",
  "Valideringsregler",
  "Test forbindelse",
  "Routing",
  "Aktivér",
];
const METHODS = [
  "MQTT",
  "REST API",
  "Webhook",
  "CSV",
  "Manuel upload",
  "LoRaWAN Network Server",
  "NB-IoT",
  "Cloud storage",
  "Third-party connector",
];
const FIELDS = [
  "Timestamp",
  "Location",
  "Source ID",
  "Measurement type",
  "Value",
  "Unit",
  "Quality flag",
  "Metadata",
  "Verification status",
];
const MODULES = ["DecisionsIQ", "ESG Ledger", "Impact Exchange", "Reports"];

function Page() {
  const [step, setStep] = useState(0);
  const [type, setType] = useState("IoT sensor");
  const [project, setProject] = useState(PROJECTS[0]);
  const [zone, setZone] = useState(ZONES[0]);
  const [method, setMethod] = useState("MQTT");
  const [rules, setRules] = useState<string[]>([
    "Required timestamp",
    "Required location",
    "Unit validation",
  ]);
  const [routing, setRouting] = useState<string[]>(["DecisionsIQ", "ESG Ledger"]);
  const [tested, setTested] = useState(false);
  const [activated, setActivated] = useState(false);

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader
        title="Tilføj datakilde"
        description="Guidet onboarding til ny IoT-, satellit-, drone-, API-, CSV- eller manuel datakilde."
      />

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        <Card className="p-3 h-fit">
          <WizardSteps steps={STEPS} current={step} onSelect={setStep} />
        </Card>

        <Card className="p-6 min-h-[460px]">
          {step === 0 && (
            <Section title="Step 1 — Vælg kildetype">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {SOURCE_TYPES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setType(s)}
                    className={`text-left rounded-lg border p-3 text-sm transition ${type === s ? "border-primary bg-leaf/20" : "bg-card hover:bg-muted"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {step === 1 && (
            <Section title="Step 2 — Projekt og zone">
              <div className="grid sm:grid-cols-2 gap-3">
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
                <Field label="Zone">
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
                  >
                    {ZONES.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Map pin (valgfri)">
                  <input
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
                    placeholder="55.6761, 12.5683"
                  />
                </Field>
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section title="Step 3 — Forbindelsesmetode">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`text-left rounded-lg border p-3 text-sm ${method === m ? "border-primary bg-leaf/20" : "bg-card hover:bg-muted"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {step === 3 && (
            <Section
              title="Step 4 — Konfigurer felter"
              subtitle="Map indkommende data til vores datamodel"
            >
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Felt</th>
                    <th className="px-3 py-2 text-left">Map til</th>
                    <th className="px-3 py-2 text-left">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {FIELDS.map((f) => (
                    <tr key={f}>
                      <td className="px-3 py-2">{f}</td>
                      <td className="px-3 py-2">
                        <input
                          defaultValue={f.toLowerCase().replace(/ /g, "_")}
                          className="rounded border bg-card px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Chip>auto</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {step === 4 && (
            <Section title="Step 5 — Valideringsregler">
              <div className="grid sm:grid-cols-2 gap-2">
                {VALIDATION_RULES.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-2 text-sm rounded-lg border bg-card px-3 py-2 hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={rules.includes(r)}
                      onChange={() => toggle(rules, r, setRules)}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </Section>
          )}

          {step === 5 && (
            <Section title="Step 6 — Test forbindelse">
              {!tested ? (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-3">
                    Tryk for at sende et testkald og validere mapping.
                  </p>
                  <button
                    onClick={() => setTested(true)}
                    className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm"
                  >
                    Kør test
                  </button>
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2 p-2.5 rounded-lg border bg-success/10">
                    <CheckCircle2 className="h-4 w-4 text-success" /> Forbindelse oprettet
                  </li>
                  <li className="flex items-center gap-2 p-2.5 rounded-lg border bg-success/10">
                    <CheckCircle2 className="h-4 w-4 text-success" /> Sample data modtaget (3
                    records)
                  </li>
                  <li className="flex items-center gap-2 p-2.5 rounded-lg border bg-success/10">
                    <CheckCircle2 className="h-4 w-4 text-success" /> Mapping komplet
                  </li>
                  <li className="flex items-center gap-2 p-2.5 rounded-lg border bg-warning/10">
                    <AlertTriangle className="h-4 w-4 text-warning-foreground" /> 2 advarsler:
                    manglende enhed på 1 felt, ingen verifikationssignatur
                  </li>
                  <li className="flex items-center gap-2 p-2.5 rounded-lg border bg-leaf/15">
                    <Sparkles className="h-4 w-4 text-primary" /> Klar til aktivering
                  </li>
                </ul>
              )}
            </Section>
          )}

          {step === 6 && (
            <Section title="Step 7 — Routing" subtitle="Hvor skal data bruges?">
              <div className="grid sm:grid-cols-2 gap-2">
                {MODULES.map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-2 text-sm rounded-lg border bg-card px-3 py-2 hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={routing.includes(m)}
                      onChange={() => toggle(routing, m, setRouting)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </Section>
          )}

          {step === 7 && (
            <Section title="Step 8 — Aktivér">
              {!activated ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <KV label="Navn" v={`${type} — ${project}`} />
                    <KV label="Projekt" v={project} />
                    <KV label="Zone" v={zone} />
                    <KV label="Datatype" v={type} />
                    <KV label="Forbindelse" v={method} />
                    <KV label="Owner" v="Mikkel Holm" />
                    <KV
                      label="Valideringsregler"
                      v={
                        <div className="flex flex-wrap gap-1">
                          {rules.map((r) => (
                            <Chip key={r}>{r}</Chip>
                          ))}
                        </div>
                      }
                    />
                    <KV
                      label="Routing"
                      v={
                        <div className="flex flex-wrap gap-1">
                          {routing.map((r) => (
                            <Chip key={r} tone="primary">
                              {r}
                            </Chip>
                          ))}
                        </div>
                      }
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => setActivated(true)}
                      className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm"
                    >
                      Aktivér datakilde
                    </button>
                    <button className="rounded-lg border bg-card px-4 py-2 text-sm">
                      Test forbindelse
                    </button>
                    <button className="rounded-lg border bg-card px-4 py-2 text-sm">
                      Gem som kladde
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border bg-success/10 p-6 text-center">
                  <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                  <div className="text-lg font-semibold mt-3">Datakilde aktiveret</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Data routes nu til {routing.join(", ")} og er synlig i Live data.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Link
                      to="/app/connect/live"
                      className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm"
                    >
                      Åbn Live data
                    </Link>
                    <Link
                      to="/app/connect/sources"
                      className="rounded-lg border bg-card px-4 py-2 text-sm"
                    >
                      Se alle kilder
                    </Link>
                  </div>
                </div>
              )}
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

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
function KV({ label, v }: { label: string; v: any }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{v}</div>
    </div>
  );
}
