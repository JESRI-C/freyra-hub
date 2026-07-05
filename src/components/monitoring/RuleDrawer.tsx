// Combined rule drawer for data-quality and alert rules. The two rule
// systems share the same shape (name, trigger/rule type, severity,
// project scope, threshold config JSON) so we render one form and pick
// the right service based on `variant`.
import { useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Drawer } from "@/components/connect/Primitives";
import { RULE_TYPES, createRule } from "@/services/monitoring/quality-rules-service";
import { ALERT_TRIGGER_TYPES, ALERT_SEVERITIES, createAlertRule } from "@/services/monitoring/alert-rules-service";

interface Props {
  open: boolean;
  onClose: () => void;
  variant: "quality" | "alert";
  projectId: string | null;
  onCreated?: () => void;
}

export function RuleDrawer({ open, onClose, variant, projectId, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>(variant === "quality" ? "missing_value" : "device_offline");
  const [severity, setSeverity] = useState<string>("medium");
  const [thresholdText, setThresholdText] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setName(""); setDescription(""); setThresholdText("{}");
    setSeverity("medium"); setBusy(false); setError(null); setDone(false);
    setType(variant === "quality" ? "missing_value" : "device_offline");
  };

  const handleClose = () => { reset(); onClose(); };

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError("Navn er påkrævet."); return; }
    let threshold: Record<string, unknown> = {};
    try { threshold = thresholdText.trim() ? JSON.parse(thresholdText) : {}; }
    catch { setError("Threshold skal være gyldig JSON."); return; }

    setBusy(true);
    try {
      if (variant === "quality") {
        await createRule({
          project_id: projectId,
          name: name.trim(),
          description: description.trim() || null,
          rule_type: type,
          severity,
          config: threshold as never,
          is_active: true,
        } as never);
      } else {
        await createAlertRule({
          project_id: projectId,
          name: name.trim(),
          description: description.trim() || null,
          trigger_type: type,
          severity,
          conditions: threshold as never,
          is_active: true,
        } as never);
      }
      setDone(true);
      onCreated?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const options = variant === "quality" ? RULE_TYPES : ALERT_TRIGGER_TYPES;

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={variant === "quality" ? "Ny kvalitetsregel" : "Ny alarmregel"}
      subtitle={variant === "quality" ? "Reglen kører løbende mod nye målinger" : "Fyres når betingelsen matcher"}
      footer={
        <>
          <button onClick={handleClose} className="text-xs rounded-lg border bg-card px-3 py-1.5">Luk</button>
          {!done && (
            <button
              onClick={submit}
              disabled={busy || !name.trim()}
              className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Opret regel
            </button>
          )}
          {done && <button onClick={reset} className="text-xs rounded-lg border bg-card px-3 py-1.5">Opret en til</button>}
        </>
      }
    >
      {done ? (
        <div className="rounded-xl border bg-success/10 p-4 text-sm flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
          <div>
            <div className="font-semibold">Regel oprettet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Reglen er aktiv med det samme og logget i audit-sporet.
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <div className="rounded-lg border bg-destructive/10 border-destructive/30 p-2.5 text-xs flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5" /> {error}
            </div>
          )}
          <Field label="Navn">
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm" placeholder="fx 'GPS mangler på feltregistrering'" />
          </Field>
          <Field label="Beskrivelse (valgfri)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border bg-card px-3 py-2 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={variant === "quality" ? "Regeltype" : "Trigger"}>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm">
                {options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded-lg border bg-card px-3 py-2 text-sm">
                {ALERT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={variant === "quality" ? "Config (JSON)" : "Betingelser (JSON)"}>
            <textarea
              value={thresholdText}
              onChange={(e) => setThresholdText(e.target.value)}
              rows={5}
              className="w-full rounded-lg border bg-card px-3 py-2 text-xs font-mono"
              placeholder={variant === "quality" ? '{"min": 0, "max": 100}' : '{"minutes_offline": 30}'}
            />
          </Field>
          <div className="text-[11px] text-muted-foreground">
            Reglen scopes til {projectId ? "det valgte projekt" : "hele workspacet"}.
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
