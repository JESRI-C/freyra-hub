import { Check, X } from "lucide-react";
import type { DocumentationScore as Score } from "@/services/documents-service";

interface Props {
  score: Score;
}

export function DocumentationScore({ score }: Props) {
  const tone =
    score.score >= 80 ? "text-emerald-600" : score.score >= 50 ? "text-amber-600" : "text-red-600";
  const barTone =
    score.score >= 80 ? "bg-emerald-500" : score.score >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <span className={`text-3xl font-semibold ${tone}`}>{score.score}%</span>
        <span className="text-sm text-muted-foreground">dokumentationsdækning</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-4">
        <div className={`h-full ${barTone}`} style={{ width: `${score.score}%` }} />
      </div>
      <ul className="space-y-1.5">
        {score.breakdown.map((b) => (
          <li key={b.label} className="flex items-center gap-2 text-sm">
            {b.ok ? (
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <X className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <span className={b.ok ? "" : "text-muted-foreground"}>{b.label}</span>
            {b.hint && <span className="text-xs text-muted-foreground">— {b.hint}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{b.weight}p</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
