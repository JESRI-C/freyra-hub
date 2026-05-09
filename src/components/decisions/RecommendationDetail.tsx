import { X, ListTodo, FileText, PlayCircle } from "lucide-react";
import { ConfidenceScore, PriorityBadge, RiskBadge } from "./Primitives";
import type { Recommendation } from "@/lib/decisions-data";

export function RecommendationDetail({
  r,
  onClose,
}: {
  r: Recommendation | null;
  onClose: () => void;
}) {
  if (!r) return null;
  return (
    <>
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-card border-l shadow-card z-50 overflow-y-auto">
        <div className="sticky top-0 bg-card border-b px-5 py-4 flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <PriorityBadge p={r.priority} />
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{r.category}</span>
              <ConfidenceScore value={r.confidence} size="sm" />
            </div>
            <h3 className="font-semibold leading-snug">{r.title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-sm">
          <Section title="Problem">{r.problem}</Section>
          <Section title="Hvorfor det betyder noget">{r.whyItMatters}</Section>

          <div>
            <SectionTitle>Datagrundlag</SectionTitle>
            <ul className="space-y-1.5">
              {r.dataBasis.map((d) => (
                <li key={d} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf" /> {d}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <ValueBlock label="Forventet forretningsværdi" value={r.businessValue} />
            <ValueBlock label="Forventet ESG-værdi" value={r.esgValue} />
          </div>

          <div>
            <SectionTitle>Foreslåede næste skridt</SectionTitle>
            <ol className="space-y-2">
              {r.nextSteps.map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-leaf/20 text-primary grid place-items-center text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-soft">
              <ListTodo className="h-4 w-4" /> Opret opgave
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card py-2.5 text-sm">
              <FileText className="h-4 w-4" /> Tilføj til rapport
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card py-2.5 text-sm">
              <PlayCircle className="h-4 w-4" /> Markér igangsat
            </button>
          </div>

          <div className="pt-2 text-xs text-muted-foreground flex items-center gap-2">
            Status: <RiskBadge level="Lav" /> · Ejer: {r.owner} · Deadline: {r.deadline}
          </div>
        </div>
      </aside>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{children}</div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
function ValueBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm mt-1">{value}</div>
    </div>
  );
}
