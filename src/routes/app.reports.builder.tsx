import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GripVertical, Trash2, Sparkles, Eye, Send, Filter, ChevronDown } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import { Section, Chip, ReadinessBar } from "@/components/reports/Primitives";
import { SECTION_LIBRARY, type SectionDef } from "@/lib/reports-data";

export const Route = createFileRoute("/app/reports/builder")({
  component: Page,
});

const GROUPS = [
  "Intro & resume",
  "ESG & compliance",
  "Natur & impact",
  "AI & beslutninger",
  "Data & verifikation",
  "Bilag",
];

function Page() {
  const recommended = SECTION_LIBRARY.filter((s) => s.recommended).map((s) => s.id);
  const [selected, setSelected] = useState<string[]>(recommended);
  const [activeId, setActiveId] = useState<string>(recommended[1]);
  const [openGroup, setOpenGroup] = useState<string | null>("Intro & resume");

  const ordered = useMemo(() => SECTION_LIBRARY.filter((s) => selected.includes(s.id)), [selected]);
  const active = SECTION_LIBRARY.find((s) => s.id === activeId);

  const totalWords = ordered.reduce((s, x) => s + x.words, 0);
  const totalCharts = ordered.reduce((s, x) => s + x.charts, 0);
  const avgReadiness = ordered.length
    ? Math.round(ordered.reduce((s, x) => s + x.readiness, 0) / ordered.length)
    : 0;
  const missing = ordered.filter((s) => s.missing).length;

  const toggle = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const move = (id: string, dir: -1 | 1) => {
    setSelected((p) => {
      const i = p.indexOf(id);
      if (i < 0) return p;
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const c = [...p];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  };

  return (
    <main className="p-6 max-w-[1500px] w-full mx-auto space-y-4">
      <PageHeader
        title="Rapportbygger"
        description="Vælg afsnit, omarranger og styr indhold pr. afsnit. AI foreslår sektioner ud fra rapporttype."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(recommended)}
              className="text-xs rounded-lg border bg-card px-3 py-1.5"
            >
              Vælg alle anbefalede
            </button>
            <button
              onClick={() =>
                setSelected((p) =>
                  p.filter((id) => !SECTION_LIBRARY.find((s) => s.id === id)?.missing),
                )
              }
              className="text-xs rounded-lg border bg-card px-3 py-1.5"
            >
              <Filter className="h-3 w-3 inline mr-1" /> Kun rapportklar data
            </button>
            <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5">
              <Sparkles className="h-3 w-3 inline mr-1" /> Optimér til målgruppe
            </button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[280px_1fr_320px] gap-4">
        {/* LEFT: Library */}
        <Card className="p-3">
          <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">
            Sektionsbibliotek
          </div>
          <div className="space-y-1">
            {GROUPS.map((g) => {
              const items = SECTION_LIBRARY.filter((s) => s.group === g);
              const isOpen = openGroup === g;
              return (
                <div key={g} className="rounded-lg border">
                  <button
                    onClick={() => setOpenGroup(isOpen ? null : g)}
                    className="w-full flex items-center justify-between px-2.5 py-2 text-sm font-medium"
                  >
                    {g}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <ul className="border-t divide-y">
                      {items.map((s) => (
                        <li key={s.id}>
                          <label className="flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-muted cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selected.includes(s.id)}
                              onChange={() => toggle(s.id)}
                            />
                            <span className="flex-1 truncate">{s.name}</span>
                            {s.recommended && <Chip tone="primary">Anbef.</Chip>}
                            {s.missing && <Chip tone="warning">!</Chip>}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* CENTER: Builder */}
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Sektioner" value={String(ordered.length)} />
            <Stat label="Ord (est.)" value={totalWords.toLocaleString("da-DK")} />
            <Stat label="Diagrammer" value={String(totalCharts)} />
            <Stat
              label="Ø klarhed"
              value={`${avgReadiness}%`}
              tone={avgReadiness >= 85 ? "success" : "warning"}
            />
          </div>

          <Section
            title="Rapportstruktur"
            subtitle={`${ordered.length} sektioner valgt · ${missing} med advarsler`}
          >
            {ordered.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Vælg sektioner i biblioteket til venstre.
              </div>
            ) : (
              <ol className="space-y-2">
                {ordered.map((s, i) => {
                  const isActive = s.id === activeId;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setActiveId(s.id)}
                        className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition ${isActive ? "border-primary bg-leaf/15" : "bg-card hover:bg-muted"}`}
                      >
                        <div className="flex flex-col">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              move(s.id, -1);
                            }}
                            className="text-muted-foreground hover:text-foreground text-xs"
                          >
                            ▲
                          </button>
                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              move(s.id, 1);
                            }}
                            className="text-muted-foreground hover:text-foreground text-xs"
                          >
                            ▼
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-6">
                          {i + 1}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{s.name}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            <Chip tone="muted">{s.module}</Chip>
                            <span>{s.words} ord</span>
                            <span>· {s.charts} diagrammer</span>
                            {s.missing && <Chip tone="warning">⚠ {s.missing}</Chip>}
                          </div>
                        </div>
                        <div className="w-28">
                          <ReadinessBar value={s.readiness} />
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(s.id);
                          }}
                          className="text-muted-foreground hover:text-destructive p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>

          <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">AI sektionsforslag</div>
                <p className="text-sm mt-2 text-foreground/90">
                  For en <strong>investorrapport</strong> anbefales det at medtage{" "}
                  <Chip tone="primary">Risikoanalyse</Chip>,{" "}
                  <Chip tone="primary">Porteføljeimpact</Chip>,{" "}
                  <Chip tone="primary">Datakvalitet</Chip> og{" "}
                  <Chip tone="primary">Verifikationsstatus</Chip>. Disse er pt. ikke alle valgt.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5">
                    Tilføj forslag
                  </button>
                  <button className="text-xs rounded-lg border bg-card px-3 py-1.5">
                    Medtag usikre data som bilag
                  </button>
                  <button className="text-xs rounded-lg border bg-card px-3 py-1.5">
                    <Send className="h-3 w-3 inline mr-1" /> Send mangler til DecisionsIQ
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT: Section settings */}
        <Card className="p-4 h-fit sticky top-[120px]">
          {active ? (
            <>
              <div className="text-xs text-muted-foreground">Sektionsindstillinger</div>
              <div className="text-sm font-semibold mt-0.5">{active.name}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Chip tone="muted">{active.module}</Chip>
                <Chip>{active.group}</Chip>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                {([
                  ["Inkludér tekst", true],
                  ["Inkludér diagrammer", active.charts > 0],
                  ["Inkludér tabeller", true],
                  ["Inkludér AI-resumé", true],
                  ["Inkludér rådata", false],
                ] as const).map(([l, def]) => (
                  <label key={l} className="flex items-center justify-between py-1">
                    <span>{l}</span>
                    <input type="checkbox" defaultChecked={def} />
                  </label>
                ))}
              </div>

              <div className="mt-4">
                <div className="text-xs text-muted-foreground mb-1">Detaljeniveau</div>
                <select className="w-full rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                  <option>Standard</option>
                  <option>Kort</option>
                  <option>Dybdegående</option>
                </select>
              </div>

              <div className="mt-4">
                <div className="text-xs text-muted-foreground mb-1">Datakilder brugt</div>
                <div className="flex flex-wrap gap-1">
                  <Chip tone="primary">{active.module}</Chip>
                  <Chip>SKB-WQ-01</Chip>
                  <Chip>Sentinel-2</Chip>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs text-muted-foreground mb-1">Klarhed</div>
                <ReadinessBar value={active.readiness} />
              </div>

              {active.missing && (
                <div className="mt-3 p-2.5 rounded-lg border bg-warning/10 text-xs">
                  <strong>Mangler:</strong> {active.missing}
                  <br />
                  <span className="text-muted-foreground">
                    Forslag: send opgave til Smart Connect for verifikation.
                  </span>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button className="flex-1 text-xs rounded-lg bg-primary text-primary-foreground py-2 inline-flex items-center justify-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> Preview sektion
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Vælg en sektion for indstillinger.</div>
          )}
        </Card>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const c =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "";
  return (
    <Card className="p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${c}`}>{value}</div>
    </Card>
  );
}
