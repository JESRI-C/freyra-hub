import type { EnvironmentalContextResult, ConnectorCategory } from "@/lib/supabase/types";

// ─── Category badge ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  satellite: "Satellit",
  nature: "Natur",
  water: "Vand",
  terrain: "Terræn",
  weather: "Vejr",
  authority: "Myndighed",
  soil: "Jordbund",
  eu_reference: "EU-reference",
};

const CATEGORY_COLORS: Record<ConnectorCategory, string> = {
  satellite: "bg-violet-100 text-violet-700",
  nature: "bg-emerald-100 text-emerald-700",
  water: "bg-blue-100 text-blue-700",
  terrain: "bg-amber-100 text-amber-700",
  weather: "bg-sky-100 text-sky-700",
  authority: "bg-slate-100 text-slate-700",
  soil: "bg-orange-100 text-orange-700",
  eu_reference: "bg-indigo-100 text-indigo-700",
};

// ─── Result status chip ───────────────────────────────────────────────────────

const RESULT_STATUS_STYLES = {
  success: "bg-emerald-100 text-emerald-700",
  fallback: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  not_configured: "bg-muted text-muted-foreground",
};

const RESULT_STATUS_LABELS = {
  success: "Live",
  fallback: "Preview",
  error: "Fejl",
  not_configured: "Ikke konfigureret",
};

// ─── Data field renderer ──────────────────────────────────────────────────────

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Ja" : "Nej";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") return String(v);
  return String(v);
}

function formatKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EnvironmentalContextCardProps {
  result: EnvironmentalContextResult;
}

export function EnvironmentalContextCard({ result }: EnvironmentalContextCardProps) {
  const { connector, status, summary, data, fetchedAt } = result;
  const dataEntries = Object.entries(data).slice(0, 5);

  const fetchedDate = new Date(fetchedAt);
  const timeLabel = fetchedDate.toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm leading-tight truncate">{connector.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{connector.provider}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[connector.category]}`}
          >
            {CATEGORY_LABELS[connector.category]}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${RESULT_STATUS_STYLES[status]}`}
          >
            {RESULT_STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>

      {/* Key data fields */}
      {dataEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {dataEntries.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <div className="text-[10px] text-muted-foreground truncate">{formatKey(k)}</div>
              <div className="text-xs font-medium truncate">{formatValue(v)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timestamp */}
      <div className="text-[10px] text-muted-foreground border-t pt-2">Hentet {timeLabel}</div>
    </div>
  );
}
