import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  FileText,
  FilePlus2,
  FileBarChart,
  ShieldCheck,
  AlertTriangle,
  Download,
  Send,
  History,
  X,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import { ESGMetricCard, ApprovalStatusBadge } from "@/components/ledger/Primitives";
import { DOCUMENTS, type LedgerDocument } from "@/lib/ledger-data";

export const Route = createFileRoute("/app/ledger/documents")({
  head: () => ({ meta: [{ title: "Dokumenter — ESG Ledger" }] }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState("Alle");
  const open = openId ? DOCUMENTS.find((d) => d.id === openId) ?? null : null;

  const filtered = filter === "Alle" ? DOCUMENTS : DOCUMENTS.filter((d) => d.type === filter);

  const TYPES: LedgerDocument["type"][] = [
    "ESG-rapport",
    "CO₂-bilag",
    "Impact-bilag",
    "Verifikationsnote",
    "Datametode",
    "Audit trail extract",
    "Projektfakta",
    "Feltdata",
    "Revisionspakke",
  ];

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <ESGMetricCard label="Dokumenter i alt" value={`${DOCUMENTS.length * 6}`} icon={<FileText className="h-4 w-4" />} />
        <ESGMetricCard label="Rapporter" value="14" icon={<FileBarChart className="h-4 w-4" />} />
        <ESGMetricCard label="Projektbilag" value="18" icon={<FileText className="h-4 w-4" />} />
        <ESGMetricCard label="Verifikationsnoter" value="9" icon={<ShieldCheck className="h-4 w-4" />} tone="success" />
        <ESGMetricCard label="Mangler godkendelse" value="7" icon={<AlertTriangle className="h-4 w-4" />} tone="warning" />
      </div>

      {/* Actions + filter */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter("Alle")}
            className={`text-xs px-2.5 py-1 rounded-full border ${filter === "Alle" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            Alle
          </button>
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-xs px-2.5 py-1 rounded-full border ${filter === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted inline-flex items-center gap-1.5">
            <FilePlus2 className="h-4 w-4" /> Upload dokument
          </button>
          <button className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2 inline-flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Generér dokument
          </button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Dokumentbibliotek" subtitle="Klik for forhåndsvisning og versionshistorik" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Dokument</th>
              <th className="py-2">Type</th>
              <th className="py-2">Projekt</th>
              <th className="py-2">Tilknyttet metrik</th>
              <th className="py-2">Oprettet</th>
              <th className="py-2">Status</th>
              <th className="py-2">Ansvarlig</th>
              <th className="py-2">Version</th>
              <th className="py-2">Anvendt i</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((d) => (
              <tr key={d.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(d.id)}>
                <td className="px-5 py-3 font-medium inline-flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> {d.name}
                </td>
                <td className="text-xs">{d.type}</td>
                <td className="text-xs">{d.project}</td>
                <td className="text-xs text-muted-foreground">{d.metric}</td>
                <td className="text-xs text-muted-foreground">{d.created}</td>
                <td><ApprovalStatusBadge status={d.status} /></td>
                <td className="text-xs">{d.owner}</td>
                <td className="text-xs tabular-nums">{d.version}</td>
                <td className="text-xs text-muted-foreground">{d.usedIn}</td>
                <td className="pr-5 text-right">
                  <button className="text-xs text-primary hover:underline">Åbn</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Approval workflow legend */}
      <Card className="p-5">
        <div className="font-semibold mb-3">Godkendelsesflow</div>
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {["Draft", "Intern review", "Klar til godkendelse", "Godkendt", "Sendt til rapport", "Arkiveret"].map((s, i, arr) => (
            <li key={s} className="inline-flex items-center gap-2">
              <ApprovalStatusBadge status={s} />
              {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
            </li>
          ))}
        </ol>
      </Card>

      {/* Preview drawer */}
      {open && (
        <div className="fixed inset-0 bg-foreground/30 z-40 flex justify-end" onClick={() => setOpenId(null)}>
          <div className="w-full max-w-2xl h-full bg-card border-l shadow-card overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-start justify-between">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{open.type} · {open.version}</div>
                <div className="font-semibold text-lg truncate">{open.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{open.project} · ansvarlig: {open.owner}</div>
              </div>
              <button onClick={() => setOpenId(null)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-5 text-sm">
              <div className="flex items-center justify-between">
                <ApprovalStatusBadge status={open.status} />
                <div className="text-xs text-muted-foreground">Oprettet {open.created}</div>
              </div>

              {/* Preview body */}
              <div className="rounded-xl border bg-background p-5">
                <div className="text-xs text-muted-foreground">FREYRA · {open.project}</div>
                <h2 className="text-lg font-semibold mt-1">{open.name}</h2>
                <Section title="Resumé">
                  Dokumentet samler nøgleresultater og dokumentation for {open.metric.toLowerCase()} i {open.project}.
                  Indholdet er sporbart til kilder i ESG Ledger og er klar til intern eller ekstern brug.
                </Section>
                <Section title="Inkluderede metrikker">
                  {open.metric} · datakvalitet · verifikationsstatus · audit-trail-uddrag.
                </Section>
                <Section title="Kildedata">
                  Sensorer, Sentinel-2, ERP, Impact Exchange og tredjepartsverifikation. Krydsvalideret med
                  baseline og kontrolleret for fuldstændighed og konsistens.
                </Section>
                <Section title="Verifikationsstatus">
                  Tredjepartsreview {open.status === "Godkendt" ? "fuldført" : "i gang"}. Audit-trail vedhæftet som
                  bilag.
                </Section>
              </div>

              {/* Version history */}
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> Versionshistorik
                </div>
                <ul className="rounded-xl border divide-y text-xs">
                  <li className="px-3 py-2 flex justify-between"><span>{open.version} · {open.created}</span><span className="text-muted-foreground">Aktuel</span></li>
                  <li className="px-3 py-2 flex justify-between"><span>v0.9 · 2026-04-22</span><span className="text-muted-foreground">Intern review afsluttet</span></li>
                  <li className="px-3 py-2 flex justify-between"><span>v0.5 · 2026-04-10</span><span className="text-muted-foreground">Udkast oprettet</span></li>
                </ul>
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted inline-flex items-center gap-1.5"><Download className="h-4 w-4" /> Eksportér PDF</button>
                <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted inline-flex items-center gap-1.5"><Send className="h-4 w-4" /> Send til rapportering</button>
                <button className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2 inline-flex items-center gap-1.5"><Send className="h-4 w-4" /> Send til revisorpakke</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
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
