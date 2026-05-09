import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, StatusPill } from "@/components/settings/Primitives";
import { FRAMEWORKS } from "@/lib/settings-data";
import { BookOpen, Settings as SettingsIcon, CheckCircle2, FolderKanban } from "lucide-react";

export const Route = createFileRoute("/app/settings/frameworks")({
  head: () => ({ meta: [{ title: "Standarder & frameworks — GoFreyra" }] }),
  component: FrameworksPage,
});

function FrameworksPage() {
  const [selected, setSelected] = useState<string[]>(
    FRAMEWORKS.filter((f) => f.status === "Aktiv").map((f) => f.key),
  );
  const toggle = (k: string) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Standarder & frameworks</h1>
          <p className="text-xs text-muted-foreground">
            Vælg rapporteringsstandarder, ESG-frameworks og naturmetodologier
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Aktive frameworks"
          value={String(selected.length)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="bg-success/15 text-success"
        />
        <StatCard
          label="Tilgængelige"
          value={String(FRAMEWORKS.length)}
          icon={<BookOpen className="h-5 w-5" />}
        />
        <StatCard label="Projekter mappet" value="7" icon={<FolderKanban className="h-5 w-5" />} />
        <StatCard label="Gns. readiness" value="84%" icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      <Section title="Frameworks" subtitle="Klik på et kort for at aktivere/deaktivere">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FRAMEWORKS.map((f) => {
            const on = selected.includes(f.key);
            return (
              <button
                key={f.key}
                onClick={() => toggle(f.key)}
                className={`text-left rounded-2xl border p-4 transition ${on ? "border-primary bg-leaf/10 shadow-soft" : "bg-card hover:bg-muted/30"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{f.name}</div>
                  <span
                    className={`h-5 w-5 rounded-md border grid place-items-center flex-shrink-0 ${on ? "bg-primary border-primary text-white" : "bg-card"}`}
                  >
                    {on && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <Box label="Status" v={<StatusPill status={f.status} />} />
                  <Box label="Brugt af" v={`${f.projects} projekter`} />
                  <Box label="Datakrav" v={f.data} />
                  <Box label="Relevans" v={f.relevance} />
                </div>
                <div className="mt-3 flex gap-2">
                  <span className="text-xs rounded-lg border bg-card px-2 py-1 inline-flex items-center gap-1">
                    <SettingsIcon className="h-3 w-3" /> Konfigurér
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Projekt-mapping" subtitle="Hvilke frameworks er aktiveret pr. projekt">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Projekt</th>
                {FRAMEWORKS.slice(0, 6).map((f) => (
                  <th key={f.key} className="font-medium px-2 py-2.5 text-[11px] text-center">
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                "Skallebæk Biodiversity Pilot",
                "Nordic Coastal Restoration",
                "Urban Water Quality Program",
                "Mangrove Restoration Indonesia",
                "Urban Biodiversity Corridor Copenhagen",
              ].map((p, i) => (
                <tr key={p} className="border-t">
                  <td className="px-4 py-2.5 font-medium">{p}</td>
                  {FRAMEWORKS.slice(0, 6).map((f, j) => {
                    const on = (i + j) % 3 !== 2 && selected.includes(f.key);
                    return (
                      <td key={f.key} className="px-2 py-2.5 text-center">
                        {on ? (
                          <CheckCircle2 className="h-4 w-4 text-success inline" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}

function Box({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate">{v}</div>
    </div>
  );
}
