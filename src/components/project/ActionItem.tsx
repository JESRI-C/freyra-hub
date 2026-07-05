import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { actionPriorityTone, getActionEvidence } from "@/services/actions-service";
import { ActionEvidenceDialog } from "./ActionEvidenceDialog";
import { Paperclip, ShieldAlert, MapPin, Target } from "lucide-react";
import { toast } from "sonner";
import type { Action } from "@/lib/supabase/types";

interface ActionItemProps {
  action: Action;
  siteName?: string | null;
  indicatorLabel?: string | null;
  onStart?: (id: string) => void;
  onComplete?: (id: string, actualImpact?: string) => void;
  onMarkInProgress?: (id: string) => void;
  onMarkCompleted?: (id: string) => void;
}

export function ActionItem({
  action,
  siteName,
  indicatorLabel,
  onStart,
  onComplete,
  onMarkInProgress,
  onMarkCompleted,
}: ActionItemProps) {
  const tone = actionPriorityTone(action.priority ?? "Lav");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [completingWithImpact, setCompletingWithImpact] = useState(false);
  const [actualImpact, setActualImpact] = useState("");

  const requiresEvidence = action.requires_evidence === true;

  const { data: evidence = [] } = useQuery({
    queryKey: ["action-evidence", action.id],
    queryFn: () => getActionEvidence(action.id),
    enabled: requiresEvidence,
  });

  const evidenceCount = evidence.length;
  const canComplete = !requiresEvidence || evidenceCount > 0;

  const startHandler = onStart ?? onMarkInProgress;
  const completeHandler = onComplete ?? ((id: string) => onMarkCompleted?.(id));

  const isOpen = action.status === "Åben" || action.status === "open";
  const isInProgress = action.status === "I gang";
  const isClosed = action.status === "Lukket" || action.status === "closed";

  function handleComplete() {
    if (!canComplete) {
      toast.error("Handlingen kræver evidens før den kan afsluttes");
      setEvidenceOpen(true);
      return;
    }
    if (action.expected_impact && !completingWithImpact) {
      setCompletingWithImpact(true);
      return;
    }
    completeHandler?.(action.id, actualImpact || undefined);
    setCompletingWithImpact(false);
    setActualImpact("");
  }

  return (
    <>
      <div className="flex items-start gap-4 py-3 border-b last:border-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{action.title}</span>
            <Pill tone={tone === "neutral" ? "default" : tone}>{action.priority ?? "Lav"}</Pill>
            <span className="text-xs text-muted-foreground">{action.status}</span>
            {action.action_type && (
              <Pill tone="info">{action.action_type}</Pill>
            )}
            {requiresEvidence && (
              <span
                className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                  canComplete
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                <ShieldAlert className="h-3 w-3" />
                Evidens {evidenceCount}/{requiresEvidence ? "1+" : "0"}
              </span>
            )}
          </div>
          {action.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {action.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {action.owner && <span>Ansvarlig: {action.owner}</span>}
            {action.due_date && (
              <span>Frist: {new Date(action.due_date).toLocaleDateString("da-DK")}</span>
            )}
            {siteName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {siteName}
              </span>
            )}
            {indicatorLabel && (
              <span className="inline-flex items-center gap-1">
                <Target className="h-3 w-3" />
                {indicatorLabel}
              </span>
            )}
          </div>
          {action.expected_impact && (
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">Forventet effekt: </span>
              <span>{action.expected_impact}</span>
            </div>
          )}
          {isClosed && action.actual_impact && (
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">Realiseret: </span>
              <span>{action.actual_impact}</span>
            </div>
          )}
          {completingWithImpact && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={actualImpact}
                onChange={(e) => setActualImpact(e.target.value)}
                placeholder="Registrér faktisk effekt (valgfri)"
                className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                autoFocus
              />
              <Button size="sm" onClick={handleComplete}>Bekræft</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCompletingWithImpact(false);
                  setActualImpact("");
                }}
              >
                Annullér
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => setEvidenceOpen(true)}
            className="text-xs border rounded-lg px-2.5 py-1 hover:bg-muted transition-colors inline-flex items-center gap-1"
            title="Håndtér evidens"
          >
            <Paperclip className="h-3 w-3" />
            {evidenceCount > 0 ? evidenceCount : ""}
          </button>
          {isOpen && startHandler && (
            <button
              onClick={() => startHandler(action.id)}
              className="text-xs border rounded-lg px-2.5 py-1 hover:bg-muted transition-colors"
            >
              I gang
            </button>
          )}
          {!isClosed && !completingWithImpact && (completeHandler || onMarkCompleted) && (
            <button
              onClick={handleComplete}
              disabled={!canComplete}
              className={`text-xs rounded-lg px-2.5 py-1 transition-colors ${
                canComplete
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
              title={!canComplete ? "Kræver evidens først" : undefined}
            >
              Færdig
            </button>
          )}
        </div>
      </div>

      <ActionEvidenceDialog
        action={action}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
      />
    </>
  );
}
