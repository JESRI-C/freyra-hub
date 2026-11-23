import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [target, setTarget] = useState(indicator.target_value?.toString() ?? "");
  const [targetDirection, setTargetDirection] = useState<"at_least" | "at_most">(
    indicator.target_direction ?? "at_least",
  );
  const [warn, setWarn] = useState(indicator.threshold_warning?.toString() ?? "");
  const [crit, setCrit] = useState(indicator.threshold_critical?.toString() ?? "");
  const [direction, setDirection] = useState<"above" | "below">(
    indicator.threshold_direction ?? "above",
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const targetValue = target.trim() ? Number(target) : null;
    const targetUnit = unit.trim();
    if (
      targetValue !== null &&
      (!Number.isFinite(targetValue) ||
        !targetUnit ||
        targetUnit.length > 120 ||
        (indicator.target_unit && indicator.target_unit !== targetUnit))
    ) {
      toast.error(
        indicator.target_unit && indicator.target_unit !== targetUnit
          ? "Fjern den gamle målværdi, før du gemmer en ny enhed."
          : "Angiv en gyldig målværdi og enhed.",
      );
      return;
    }
    setSaving(true);
    try {
      await saveIndicatorConfig(indicator, {
        label: label.trim(),
        description: description.trim() || null,
        unit: unit.trim() || null,
        target_value: targetValue,
        target_direction: targetValue === null ? null : targetDirection,
        target_unit: targetValue === null ? null : targetUnit,
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
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
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="%, /100, t CO₂e"
              />
            </div>
            <div>
              <Label>Grænseretning</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "above" | "below")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
          <fieldset className="space-y-2 rounded-lg border p-3" disabled={saving}>
            <legend className="px-1 text-sm font-medium">Mål for indikatoren</legend>
            <Label htmlFor="indicator-target-value">Målværdi</Label>
            <Input
              id="indicator-target-value"
              type="number"
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <Label htmlFor="indicator-target-direction">Målets retning</Label>
            <select
              id="indicator-target-direction"
              className="block min-h-10 w-full rounded-md border bg-background px-2"
              value={targetDirection}
              onChange={(e) =>
                setTargetDirection(e.target.value === "at_most" ? "at_most" : "at_least")
              }
            >
              <option value="at_least">Mindst målværdien</option>
              <option value="at_most">Højst målværdien</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Målet bruger indikatorens enhed. Lad målværdien stå tom for at fjerne målet.
            </p>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annullér
          </Button>
          <Button onClick={handleSave} disabled={saving || !label.trim()}>
            {saving ? "Gemmer…" : "Gem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
