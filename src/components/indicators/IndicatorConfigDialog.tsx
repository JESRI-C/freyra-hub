import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveIndicatorConfig } from "@/services/indicators-service";
import { toast } from "sonner";
import type { Indicator } from "@/lib/supabase/types";

export function IndicatorConfigDialog({
  indicator,
  open,
  onOpenChange,
  onSaved,
}: {
  indicator: Indicator;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const [label, setLabel] = useState(indicator.label);
  const [description, setDescription] = useState(indicator.description ?? "");
  const [unit, setUnit] = useState(indicator.unit ?? "");
  const [warn, setWarn] = useState(indicator.threshold_warning?.toString() ?? "");
  const [crit, setCrit] = useState(indicator.threshold_critical?.toString() ?? "");
  const [direction, setDirection] = useState<"above" | "below">(
    indicator.threshold_direction ?? "above",
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await saveIndicatorConfig(indicator, {
        label: label.trim(),
        description: description.trim() || null,
        unit: unit.trim() || null,
        threshold_warning: warn === "" ? null : Number(warn),
        threshold_critical: crit === "" ? null : Number(crit),
        threshold_direction: direction,
      });
      toast.success("Indikator gemt");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Konfigurér indikator</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Navn</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label>Beskrivelse</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Hvad måler denne indikator?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Enhed</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="%, /100, t CO₂e" />
            </div>
            <div>
              <Label>Grænseretning</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "above" | "below")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Alarmér når værdi er OVER grænse</SelectItem>
                  <SelectItem value="below">Alarmér når værdi er UNDER grænse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Advarselsgrænse</Label>
              <Input type="number" value={warn} onChange={(e) => setWarn(e.target.value)} />
            </div>
            <div>
              <Label>Kritisk grænse</Label>
              <Input type="number" value={crit} onChange={(e) => setCrit(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Målinger, der rammer en grænse, opretter automatisk en handling.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annullér</Button>
          <Button onClick={handleSave} disabled={saving || !label.trim()}>
            {saving ? "Gemmer…" : "Gem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
