import { ChevronRight } from "lucide-react";
import { ConfidenceScore, PriorityBadge } from "./Primitives";
import type { Recommendation } from "@/lib/decisions-data";

export function RecommendationCard({ r, onClick }: { r: Recommendation; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-2xl bg-card border p-5 shadow-soft hover:shadow-card transition group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityBadge p={r.priority} />
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{r.category}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
      </div>
      <div className="mt-3 font-semibold leading-snug">{r.title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{r.requiredAction}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">Forventet effekt</div>
          <div className="font-medium mt-0.5">{r.expectedEffect}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Konfidens</div>
          <div className="mt-0.5"><ConfidenceScore value={r.confidence} size="sm" /></div>
        </div>
        <div>
          <div className="text-muted-foreground">Ejer</div>
          <div className="font-medium mt-0.5">{r.owner}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Deadline</div>
          <div className="font-medium mt-0.5">{r.deadline}</div>
        </div>
      </div>
    </button>
  );
}
