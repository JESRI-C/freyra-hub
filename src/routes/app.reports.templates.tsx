import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutTemplate, Sparkles, Plus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import { Drawer, Section, Chip } from "@/components/reports/Primitives";
import { TEMPLATES, AUDIENCES, TONES } from "@/lib/reports-data";

export const Route = createFileRoute("/app/reports/templates")({ component: Page });

function Page() {
  const [sel, setSel] = useState<(typeof TEMPLATES)[0] | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader
        title="Skabeloner"
        description="Genbrugelige rapportskabeloner med standard-sektioner og målgrupper."
        actions={
          <button
            onClick={() => setCreating(true)}
            className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Ny skabelon
          </button>
        }
      />

      <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Anbefalet skabelon</div>
            <p className="text-sm mt-1.5">
              Til <strong>Skallebæk</strong> anbefales{" "}
              <Chip tone="primary">Naturimpact-rapport</Chip> +{" "}
              <Chip tone="primary">ESG-bilag</Chip>, fordi projektet har stærk biodiversitets- og
              vanddata, men ikke fuld CSRD-dækning.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TEMPLATES.map((t) => (
          <Card key={t.name} className="p-4 flex flex-col">
            <div className="h-10 w-10 rounded-xl bg-leaf/20 text-primary grid place-items-center mb-3">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold">{t.name}</div>
            <div className="text-xs text-muted-foreground mt-1 min-h-[32px]">{t.purpose}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <div>
                <strong className="text-foreground">Målgruppe:</strong> {t.audience}
              </div>
              <div>
                <strong className="text-foreground">Sektioner:</strong> {t.sections}
              </div>
              <div>
                <strong className="text-foreground">Længde:</strong> {t.length}
              </div>
              <div>
                <strong className="text-foreground">Moduler:</strong> {t.modules.length}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {t.modules.map((m) => (
                <Chip key={m}>{m}</Chip>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setSel(t)}
                className="flex-1 text-xs rounded-lg border bg-card py-1.5"
              >
                Detaljer
              </button>
              <button className="flex-1 text-xs rounded-lg bg-primary text-primary-foreground py-1.5">
                Brug
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel?.name ?? ""}
        subtitle={sel?.purpose}
        footer={
          <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5">
            Brug skabelon
          </button>
        }
      >
        {sel && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KV label="Målgruppe" v={sel.audience} />
              <KV label="Længde" v={sel.length} />
              <KV label="Sektioner" v={`${sel.sections}`} />
              <KV
                label="Moduler"
                v={
                  <div className="flex flex-wrap gap-1">
                    {sel.modules.map((m) => (
                      <Chip key={m}>{m}</Chip>
                    ))}
                  </div>
                }
              />
            </div>
            <Section title="Standard-sektioner">
              <ul className="text-sm space-y-1 list-disc pl-5 text-foreground/90">
                <li>Forside · Executive summary · Hovedkonklusioner</li>
                <li>Datagrundlag · Metodekort</li>
                <li>Nøgletal · Diagrammer</li>
                <li>AI-anbefalinger · Risikoanalyse</li>
                <li>Dokumentation · Bilag</li>
              </ul>
            </Section>
            <Section title="Krævet data">
              <div className="flex flex-wrap gap-1.5">
                {sel.modules.map((m) => (
                  <Chip tone="primary" key={m}>
                    {m}
                  </Chip>
                ))}
              </div>
            </Section>
            <Section title="Eksportformater">
              <div className="flex flex-wrap gap-1.5">
                <Chip>PDF</Chip>
                <Chip>Word</Chip>
                <Chip>Delbart link</Chip>
              </div>
            </Section>
          </>
        )}
      </Drawer>

      <Drawer
        open={creating}
        onClose={() => setCreating(false)}
        title="Opret brugerdefineret skabelon"
        footer={
          <>
            <button
              onClick={() => setCreating(false)}
              className="text-xs rounded-lg border bg-card px-3 py-1.5"
            >
              Annullér
            </button>
            <button
              onClick={() => setCreating(false)}
              className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5"
            >
              Gem skabelon
            </button>
          </>
        }
      >
        <Field label="Skabelonnavn">
          <input
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
            placeholder="Fx Q-rapport til kunder"
          />
        </Field>
        <Field label="Målgruppe">
          <select className="w-full rounded-lg border bg-card px-3 py-2 text-sm">
            {AUDIENCES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Default tone">
          <select className="w-full rounded-lg border bg-card px-3 py-2 text-sm">
            {TONES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Default sektioner">
          <textarea
            rows={4}
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
            defaultValue="Forside, Executive summary, Nøgletal, AI-anbefalinger, Dokumentation, Bilag"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked /> Inkludér bilag
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked /> Aktivér godkendelsesflow
        </label>
      </Drawer>
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
