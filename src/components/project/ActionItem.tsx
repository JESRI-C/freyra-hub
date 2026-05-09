import { Pill } from "@/components/ui-bits";
import { actionPriorityTone } from "@/services/actions-service";
import type { Action } from "@/lib/supabase/types";

interface ActionItemProps {
  action: Action;
  onMarkInProgress?: (id: string) => void;
  onMarkCompleted?: (id: string) => void;
}

export function ActionItem({ action, onMarkInProgress, onMarkCompleted }: ActionItemProps) {
  const tone = actionPriorityTone(action.priority ?? "Lav");

  return (
    <div className="flex items-start gap-4 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{action.title}</span>
          <Pill tone={tone === "neutral" ? "default" : tone}>{action.priority ?? "Lav"}</Pill>
          <span className="text-xs text-muted-foreground">{action.status}</span>
        </div>
        {action.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{action.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {action.owner && <span>Ansvarlig: {action.owner}</span>}
          {action.due_date && (
            <span>Frist: {new Date(action.due_date).toLocaleDateString("da-DK")}</span>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {action.status === "Åben" && onMarkInProgress && (
          <button
            onClick={() => onMarkInProgress(action.id)}
            className="text-xs border rounded-lg px-2.5 py-1 hover:bg-muted transition-colors"
          >
            I gang
          </button>
        )}
        {action.status !== "Lukket" && onMarkCompleted && (
          <button
            onClick={() => onMarkCompleted(action.id)}
            className="text-xs bg-emerald-600 text-white rounded-lg px-2.5 py-1 hover:bg-emerald-700 transition-colors"
          >
            Færdig
          </button>
        )}
      </div>
    </div>
  );
}
