import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, StatCard } from "@/components/ui-bits";
import { ReportStatusBadge, ReadinessScore, Drawer, Section, Chip } from "@/components/reports/Primitives";
import { RECENT_REPORTS, type ReportStatus } from "@/lib/reports-data";
import { Library, CheckCircle2, Clock, FileEdit, Archive, Download, Filter, Search, History, FileText, MessageSquare, Send, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/reports/library")({
  head: () => ({ meta: [{ title: "Rapportbibliotek — GoFreyra" }] }),
  component: LibraryPage,
});

const SAVED_FILTERS = [
  { key: "all", label: "Alle rapporter" },
  { key: "mine", label: "Mine rapporter" },
  { key: "review", label: "Skal reviewes" },
  { key: "ready", label: "Klar til eksport" },
  { key: "external", label: "Klar til ekstern deling" },
  { key: "missing", label: "Mangler data" },
  { key: "archived", label: "Arkiveret" },
];

const VERSIONS: Record<string, { v: string; by: string; when: string; changes: string[]; comment: string; exported: boolean; approved: boolean }[]> = {
  default: [
    { v: "v1.4", by: "Emma Larsen", when: "I dag · 09:42", changes: ["Executive summary opdateret", "Biodiversitetsindeks Q2 indlæst", "AI-anbefalinger genereret"], comment: "Klar til intern review", exported: false, approved: false },
    { v: "v1.3", by: "Mikkel Holm", when: "I går · 16:08", changes: ["Datakilder valideret", "Audit trail synkroniseret"], comment: "Smart Connect data refreshed", exported: false, approved: false },
    { v: "v1.2", by: "Emma Larsen", when: "3 dage siden", changes: ["Vandkvalitet-graf tilføjet", "Metodebilag opdateret"], comment: "Kunde-feedback indarbejdet", exported: true, approved: true },
    { v: "v1.1", by: "Jesper Riel", when: "1 uge siden", changes: ["Forside og branding tilrettet"], comment: "Initial review", exported: false, approved: false },
    { v: "v1.0", by: "Emma Larsen", when: "2 uger siden", changes: ["Første udkast genereret"], comment: "AI-udkast", exported: false, approved: false },
  ],
};

const ACTIVITY = [
  { icon: FileEdit, label: "Kladde oprettet fra skabelon Naturimpact-rapport", who: "Emma Larsen", when: "2 uger siden", tone: "default" as const },
  { icon: FileText, label: "Sektion 'Biodiversitetsindeks' tilføjet", who: "Emma Larsen", when: "12 dage siden", tone: "default" as const },
  { icon: Download, label: "Smart Connect data refresh — Skallebæk Zone A/B", who: "System", when: "8 dage siden", tone: "info" as const },
  { icon: ShieldCheck, label: "AI-summary opdateret af DecisionsIQ", who: "AI", when: "5 dage siden", tone: "info" as const },
  { icon: Send, label: "Sendt til review", who: "Emma Larsen", when: "3 dage siden", tone: "info" as const },
  { icon: MessageSquare, label: "Kommentar fra Jesper Riel: 'Forkort exec summary'", who: "Jesper Riel", when: "3 dage siden", tone: "default" as const },
  { icon: CheckCircle2, label: "Godkendt af ledelse", who: "Jesper Riel", when: "I går", tone: "success" as const },
  { icon: Download, label: "PDF eksporteret (v1.2) — 18 sider", who: "Emma Larsen", when: "I dag · 09:00", tone: "success" as const },
  { icon: Archive, label: "Arkivkopi gemt i ESG Ledger (LDG-2041)", who: "System", when: "I dag · 09:01", tone: "success" as const },
];

function LibraryPage() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let r = RECENT_REPORTS;
    if (filter === "mine") r = r.filter((x) => x.owner === "Emma Larsen");
    else if (filter === "review") r = r.filter((x) => x.status === "Klar til review");
    else if (filter === "ready") r = r.filter((x) => x.readiness >= 90 && x.status !== "Arkiveret");
    else if (filter === "external") r = r.filter((x) => x.readiness >= 92);
    else if (filter === "missing") r = r.filter((x) => x.status === "Kræver data" || x.readiness < 80);
    else if (filter === "archived") r = r.filter((x) => x.status === "Arkiveret");
    if (q) r = r.filter((x) => (x.name + x.type + x.scope + x.owner).toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [filter, q]);

  const open = openId ? RECENT_REPORTS.find((x) => x.id === openId) : null;

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary"><Library className="h-5 w-5" /></div>
        <div>
          <h1 className="text-xl font-semibold">Rapportbibliotek</h1>
          <p className="text-xs text-muted-foreground">Alle gemte rapporter, versioner og eksporthistorik</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Rapporter" value="24" icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Godkendte" value="8" icon={<CheckCircle2 className="h-5 w-5" />} accent="bg-success/15 text-success" />
        <StatCard label="Afventer review" value="5" icon={<Clock className="h-5 w-5" />} accent="bg-leaf/30 text-primary" />
        <StatCard label="Kladder" value="6" icon={<FileEdit className="h-5 w-5" />} accent="bg-warning/15 text-warning-foreground" />
        <StatCard label="Arkiverede" value="5" icon={<Archive className="h-5 w-5" />} accent="bg-muted text-muted-foreground" />
        <StatCard label="Eksports denne måned" value="12" icon={<Download className="h-5 w-5" />} />
      </div>

      <Section title="Gemte filtre" subtitle="Hurtig adgang til de mest brugte visninger">
        <div className="flex flex-wrap gap-2">
          {SAVED_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition ${filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
              <Filter className="h-3 w-3" />{f.label}
            </button>
          ))}
        </div>
      </Section>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b gap-3">
          <div className="text-sm font-semibold">Rapporter <span className="text-muted-foreground font-normal">({filtered.length})</span></div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 w-72 max-w-full">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg rapport, projekt eller ejer..." className="bg-transparent outline-none text-sm flex-1 min-w-0" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {["Rapportnavn", "Type", "Projekt/portefølje", "Målgruppe", "Version", "Status", "Readiness", "Ejer", "Senest", "Format", "Handlinger"].map((h) => (
                  <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(r.id)}>
                  <td className="px-4 py-3 font-medium">{r.name}<div className="text-[11px] text-muted-foreground">{r.id}</div></td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.type}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.scope}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.audience}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><Chip tone="muted">{r.version}</Chip></td>
                  <td className="px-4 py-3"><ReportStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3"><ReadinessScore value={r.readiness} size="sm" /></td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.owner}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.updated}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><Chip tone="muted">{r.format}</Chip></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }} className="text-xs rounded-lg border px-2 py-1 hover:bg-muted inline-flex items-center gap-1"><History className="h-3 w-3" /> Versioner</button>
                      <button onClick={(e) => e.stopPropagation()} className="text-xs rounded-lg border px-2 py-1 hover:bg-muted inline-flex items-center gap-1"><Download className="h-3 w-3" /> Eksport</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">Ingen rapporter matcher dette filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? ""} subtitle={open ? `${open.id} · ${open.type} · ${open.scope}` : ""} width="max-w-2xl"
        footer={
          <>
            <button className="rounded-lg border bg-card px-3 py-1.5 text-sm">Åbn i bygger</button>
            <button className="rounded-lg border bg-card px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Eksportér seneste version</button>
            <button className="ml-auto rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm">Start ny version</button>
          </>
        }>
        {open && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border p-3"><div className="text-[11px] text-muted-foreground">Status</div><div className="mt-1"><ReportStatusBadge status={open.status} /></div></div>
              <div className="rounded-xl border p-3"><div className="text-[11px] text-muted-foreground">Readiness</div><div className="mt-1"><ReadinessScore value={open.readiness} size="sm" /></div></div>
              <div className="rounded-xl border p-3"><div className="text-[11px] text-muted-foreground">Ejer</div><div className="mt-1 text-sm">{open.owner}</div></div>
            </div>

            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Versionshistorik</div>
              <div className="space-y-2">
                {VERSIONS.default.map((v, i) => (
                  <div key={v.v} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Chip tone={i === 0 ? "primary" : "muted"}>{v.v}</Chip>
                        {v.exported && <Chip tone="success">Eksporteret</Chip>}
                        {v.approved && <Chip tone="success">Godkendt</Chip>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{v.when}</div>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {v.changes.map((c) => <li key={c} className="text-xs flex gap-1.5"><span className="text-muted-foreground">·</span>{c}</li>)}
                    </ul>
                    <div className="mt-2 text-[11px] text-muted-foreground italic">"{v.comment}" — {v.by}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rapportaktivitet</div>
              <ol className="space-y-2">
                {ACTIVITY.map((a, i) => {
                  const Icon = a.icon;
                  const tones: Record<string, string> = { default: "bg-muted text-foreground", info: "bg-leaf/30 text-primary", success: "bg-success/15 text-success" };
                  return (
                    <li key={i} className="flex gap-3 items-start">
                      <div className={`h-7 w-7 rounded-lg grid place-items-center flex-shrink-0 ${tones[a.tone]}`}><Icon className="h-3.5 w-3.5" /></div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="text-sm">{a.label}</div>
                        <div className="text-[11px] text-muted-foreground">{a.who} · {a.when}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </Drawer>
    </main>
  );
}
