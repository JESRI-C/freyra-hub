import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getActionEvidence,
  addActionEvidence,
  removeActionEvidence,
} from "@/services/actions-service";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Paperclip, Trash2, Camera, FileText, StickyNote } from "lucide-react";
import { toast } from "sonner";
import type { Action } from "@/lib/supabase/types";

export function ActionEvidenceDialog({
  action,
  open,
  onOpenChange,
}: {
  action: Action;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [evidenceType, setEvidenceType] = useState<"photo" | "document" | "note">("note");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: evidence = [], refetch } = useQuery({
    queryKey: ["action-evidence", action.id],
    queryFn: () => getActionEvidence(action.id),
    enabled: open,
  });

  async function handleAdd() {
    if (!note.trim() && !reference.trim()) {
      toast.error("Angiv en note eller reference");
      return;
    }
    setSaving(true);
    try {
      await addActionEvidence({
        action_id: action.id,
        evidence_type: evidenceType,
        note: note.trim() || null,
        media_id: evidenceType === "photo" && reference.trim() ? reference.trim() : null,
        evidence_file_id:
          evidenceType === "document" && reference.trim() ? reference.trim() : null,
        project_id: action.project_id ?? undefined,
      });
      toast.success("Evidens tilføjet");
      setNote("");
      setReference("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["actions"] });
      qc.invalidateQueries({ queryKey: ["audit-events"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme evidens");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await removeActionEvidence(id, action.project_id ?? undefined);
      await refetch();
      qc.invalidateQueries({ queryKey: ["actions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke fjerne");
    }
  }

  const typeIcon = (t: string) =>
    t === "photo" ? Camera : t === "document" ? FileText : StickyNote;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Evidens for handling</DialogTitle>
          <DialogDescription className="line-clamp-2">{action.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Existing evidence */}
          {evidence.length > 0 && (
            <div className="rounded-lg border divide-y max-h-56 overflow-y-auto">
              {evidence.map((ev) => {
                const Icon = typeIcon(ev.evidence_type);
                return (
                  <div key={ev.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground capitalize">
                        {ev.evidence_type}
                      </div>
                      {ev.note && <div className="text-sm">{ev.note}</div>}
                      {(ev.media_id || ev.evidence_file_id) && (
                        <div className="text-xs text-muted-foreground truncate">
                          Ref: {ev.media_id ?? ev.evidence_file_id}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(ev.created_at).toLocaleString("da-DK")}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(ev.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Fjern"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new */}
          <div className="rounded-lg border p-3 space-y-2">
            <Label className="text-sm">Tilføj evidens</Label>
            <Select value={evidenceType} onValueChange={(v) => setEvidenceType(v as typeof evidenceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="photo">Foto (medie-ID)</SelectItem>
                <SelectItem value="document">Dokument (fil-ID)</SelectItem>
              </SelectContent>
            </Select>
            {evidenceType !== "note" && (
              <Input
                placeholder={
                  evidenceType === "photo" ? "Medie-ID fra galleri" : "Evidensfil-ID"
                }
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            )}
            <Textarea
              rows={2}
              placeholder="Note eller beskrivelse"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              onClick={handleAdd}
              disabled={saving || !isSupabaseConfigured}
              className="w-full"
              size="sm"
            >
              <Paperclip className="h-4 w-4 mr-1.5" />
              {saving ? "Gemmer…" : "Tilføj evidens"}
            </Button>
            {!isSupabaseConfigured && (
              <p className="text-xs text-muted-foreground">Kræver tilkoblet database.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Luk</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
