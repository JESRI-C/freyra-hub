import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ScrollText,
  Database,
  CheckCircle2,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Search,
  Filter,
  Hash,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { ESGMetricCard, Drawer } from "@/components/ledger/Primitives";
import { LEDGER_EVENTS, getEvent, type LedgerEvent } from "@/lib/ledger-data";

export const Route = createFileRoute("/app/ledger/audit")({
  head: () => ({ meta: [{ title: "Audit trail — ESG Ledger" }] }),
  component: AuditPage,
});

const TYPES: LedgerEvent["type"][] = [
  "Data tilføjet",
  "Data ændret",
  "Data valideret",
  "Kilde synkroniseret",
  "Rapport genereret",
  "Dokument eksporteret",
  "Verifikation tilføjet",
  "AI-anbefaling accepteret",
  "Impact Exchange-projekt tilføjet",
  "Beslutningsnotat oprettet",
];

function AuditPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [type, setType] = useState<string>("Alle");
  const [q, setQ] = useState("");
  const open = openId ? getEvent(openId) : null;

  const filtered = useMemo(() => {
    return LEDGER_EVENTS.filter((e) => {
      if (type !== "Alle" && e.type !== type) return false;
      if (q && !`${e.description} ${e.related} ${e.user}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [type, q]);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <ESGMetricCard label="Ledger events" value="1.284" trend={6} icon={<ScrollText className="h-4 w-4" />} />
        <ESGMetricCard label="Data updates" value="326" trend={4} icon={<Database className="h-4 w-4" />} />
        <ESGMetricCard label="Approvals" value="82" trend={8} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
        <ESGMetricCard label="Report exports" value="41" trend={12} icon={<FileText className="h-4 w-4" />} tone="info" />
        <ESGMetricCard label="Verification events" value="18" trend={3} icon={<ShieldCheck className="h-4 w-4" />} />
        <ESGMetricCard label="Critical integrity issues" value="0" icon={<AlertTriangle className="h-4 w-4" />} tone="success" hint="Ingen brud i kæden" />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2 bg-muted/40 border rounded-xl px-3 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg i audit trail (bruger, beskrivelse, metrik…)"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Dato", "Bruger", "Projekt", "Metrik", "Status", "Ledger ID"].map((f) => (
              <button key={f} className="text-xs px-2.5 py-1 rounded-full bg-muted/50 hover:bg-muted inline-flex items-center gap-1">
                <Filter className="h-3 w-3" /> {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <button
            onClick={() => setType("Alle")}
            className={`text-xs px-2.5 py-1 rounded-full border ${type === "Alle" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            Alle event-typer
          </button>
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`text-xs px-2.5 py-1 rounded-full border ${type === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader title="Audit trail" subtitle={`${filtered.length} hændelser`} />
        <ol className="px-5 pb-5 relative">
          <div className="absolute left-[34px] top-2 bottom-4 w-px bg-border" />
          {filtered.map((e) => (
            <li key={e.id} className="relative pl-12 pb-4 last:pb-0">
              <div
                className={`absolute left-[26px] top-2 h-4 w-4 rounded-full border-2 bg-card ${
                  e.status === "OK" ? "border-success" : e.status === "Advarsel" ? "border-warning" : "border-destructive"
                }`}
              />
              <button
                onClick={() => setOpenId(e.id)}
                className="w-full text-left rounded-xl border p-3 hover:bg-muted/40 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{e.description}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {e.timestamp} · {e.user} · {e.related}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Pill>{e.type}</Pill>
                    <Pill tone={e.status === "OK" ? "success" : e.status === "Advarsel" ? "warning" : "danger"}>
                      {e.status}
                    </Pill>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
                  <Hash className="h-3 w-3" /> {e.ledgerId}
                </div>
              </button>
            </li>
          ))}
        </ol>
      </Card>

      {/* Integrity */}
      <Card className="p-5 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          ESG Ledger registrerer alle ændringer, datakilder og rapportudtræk, så dokumentationen kan spores over tid.
          Hver post har en unik ledger-reference, kilde og ansvarlig — og kan eksporteres som revisionsbevis.
        </p>
      </Card>

      {/* Drawer */}
      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.description ?? ""}
        subtitle={open ? `${open.type} · ${open.timestamp}` : ""}
        footer={
          <div className="flex gap-2 justify-end">
            <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted">Eksportér event</button>
            <button className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2">Se i revisionspakke</button>
          </div>
        }
      >
        {open && (
          <div className="space-y-4 text-sm">
            {open.before && open.after && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">Før</div>
                  <div className="font-medium mt-0.5">{open.before}</div>
                </div>
                <div className="rounded-xl border p-3 bg-leaf/10">
                  <div className="text-xs text-muted-foreground">Efter</div>
                  <div className="font-medium mt-0.5 text-primary">{open.after}</div>
                </div>
              </div>
            )}
            <Field k="Type" v={open.type} />
            <Field k="Bruger / system" v={open.user} />
            <Field k="Tidspunkt" v={open.timestamp} />
            <Field k="Tilknyttet" v={open.related} />
            {open.source && <Field k="Kilde" v={open.source} />}
            <Field k="Ledger reference" v={open.ledgerId} />
            <Field k="Status" v={open.status} />
            {open.document && <Field k="Tilknyttet dokument" v={open.document} />}
            <div className="rounded-xl border p-3 bg-muted/30 text-xs font-mono break-all">
              <div className="text-muted-foreground mb-1">Hash</div>
              0x{open.id.split("-").join("").padEnd(16, "a")}…{Math.floor(Math.random() * 9999).toString(16)}
            </div>
          </div>
        )}
      </Drawer>
    </main>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
