import { useMemo, useState } from "react";
import { Download, Search, ChevronDown, ChevronRight, ShieldCheck, RefreshCw, Eye, FileText, AlertTriangle, Activity } from "lucide-react";
import { Pill } from "@/components/ui-bits";
import { auditEventIcon, downloadAuditCsv } from "@/services/audit-service";
import type { AuditEvent } from "@/lib/supabase/types";

interface Props {
  events: AuditEvent[];
  projectName?: string;
}

function IconFor({ name }: { name: string }) {
  const map: Record<string, React.ReactNode> = {
    ShieldCheck: <ShieldCheck className="h-4 w-4" />,
    RefreshCw: <RefreshCw className="h-4 w-4" />,
    Eye: <Eye className="h-4 w-4" />,
    FileText: <FileText className="h-4 w-4" />,
    AlertTriangle: <AlertTriangle className="h-4 w-4" />,
  };
  return <>{map[name] ?? <Activity className="h-4 w-4" />}</>;
}

export function AuditTrailPanel({ events, projectName }: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.event_type).filter(Boolean))) as string[],
    [events],
  );
  const entityTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.entity_type).filter(Boolean))) as string[],
    [events],
  );
  const sources = useMemo(
    () => Array.from(new Set(events.map((e) => e.source).filter(Boolean))) as string[],
    [events],
  );

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
      if (entityFilter !== "all" && e.entity_type !== entityFilter) return false;
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (fromDate && e.created_at < fromDate) return false;
      if (toDate && e.created_at > `${toDate}T23:59:59`) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${e.title} ${e.description ?? ""} ${e.actor ?? ""} ${e.entity_id ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, typeFilter, entityFilter, sourceFilter, fromDate, toDate, query]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søg titel, beskrivelse eller aktør…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border bg-background"
          />
        </div>
        <Select label="Type" value={typeFilter} onChange={setTypeFilter} options={["all", ...eventTypes]} />
        <Select label="Entitet" value={entityFilter} onChange={setEntityFilter} options={["all", ...entityTypes]} />
        <Select label="Kilde" value={sourceFilter} onChange={setSourceFilter} options={["all", ...sources]} />
        <label className="text-xs">
          <span className="block text-muted-foreground mb-0.5">Fra</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-2 py-1.5 text-sm rounded-lg border bg-background" />
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground mb-0.5">Til</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-2 py-1.5 text-sm rounded-lg border bg-background" />
        </label>
        <button
          onClick={() =>
            downloadAuditCsv(filtered, `audit-${projectName ? projectName.replace(/\s+/g, "-").toLowerCase() : "trail"}.csv`)
          }
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border hover:bg-muted disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Eksportér CSV ({filtered.length})
        </button>
      </div>

      <div className="divide-y">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Ingen begivenheder matcher filteret</p>
        ) : (
          filtered.map((ev) => {
            const isOpen = !!expanded[ev.id];
            const hasDiff = !!(ev.before_data || ev.after_data);
            return (
              <div key={ev.id} className="py-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-muted-foreground">
                    <IconFor name={auditEventIcon(ev.event_type)} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{ev.title}</span>
                      {ev.event_type && <Pill tone="default">{ev.event_type}</Pill>}
                      {ev.entity_type && <Pill tone="info">{ev.entity_type}</Pill>}
                    </div>
                    {ev.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{ev.description}</div>
                    )}
                    <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                      {ev.actor && <span>{ev.actor}</span>}
                      {ev.source && <span>· {ev.source}</span>}
                      {ev.entity_id && <span>· {ev.entity_id.slice(0, 8)}…</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(ev.created_at).toLocaleString("da-DK")}
                    </span>
                    {hasDiff && (
                      <button
                        onClick={() => toggle(ev.id)}
                        className="p-1 hover:bg-muted rounded"
                        aria-label="Vis ændringer"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
                {isOpen && hasDiff && (
                  <div className="mt-2 ml-7 grid md:grid-cols-2 gap-2 text-xs">
                    <DiffBlock label="Før" data={ev.before_data} tone="rose" />
                    <DiffBlock label="Efter" data={ev.after_data} tone="emerald" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="text-xs">
      <span className="block text-muted-foreground mb-0.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 text-sm rounded-lg border bg-background"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "all" ? "Alle" : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function DiffBlock({
  label,
  data,
  tone,
}: {
  label: string;
  data: Record<string, unknown> | null | undefined;
  tone: "rose" | "emerald";
}) {
  const bg = tone === "rose" ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200";
  return (
    <div className={`rounded-lg border ${bg} p-2`}>
      <div className="text-[10px] uppercase tracking-wide font-medium mb-1">{label}</div>
      {data ? (
        <pre className="whitespace-pre-wrap break-words text-[11px] font-mono">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}
