// Device creation wizard — 6 steps
import * as React from "react";
import { X, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createDevice } from "@/services/monitoring/devices-service";
import type { MonitoringDeviceInsert } from "@/services/monitoring/devices-service";

interface Props {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: (deviceId: string) => void;
}

const STEPS = ["Type", "Identifikation", "Placering", "Parametre", "Interval", "Bekræft"] as const;

const DEVICE_TYPES = [
  { key: "sensor", label: "Sensor" },
  { key: "gateway", label: "Gateway" },
  { key: "camera", label: "Kamera" },
  { key: "weather_station", label: "Vejrstation" },
  { key: "acoustic", label: "Akustisk monitor" },
  { key: "water_quality", label: "Vandkvalitet" },
] as const;

const CONNECTIVITY = ["lorawan", "cellular", "wifi", "ethernet", "satellite"] as const;

export function DeviceWizard({ open, projectId, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    device_type: "sensor" as string,
    name: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    connectivity_type: "lorawan" as string,
    latitude: "" as string,
    longitude: "" as string,
    expected_interval_minutes: "60" as string,
  });

  React.useEffect(() => {
    if (open) {
      setStep(0);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const canNext = () => {
    if (step === 0) return !!form.device_type;
    if (step === 1) return form.name.trim().length > 0;
    if (step === 4) return Number(form.expected_interval_minutes) > 0;
    return true;
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const insert: MonitoringDeviceInsert = {
        project_id: projectId,
        name: form.name.trim(),
        device_type: form.device_type,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        serial_number: form.serial_number || null,
        connectivity_type: form.connectivity_type,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        expected_interval_minutes: Number(form.expected_interval_minutes),
        status: "not_activated",
        created_by: user?.id ?? null,
      };
      const d = await createDevice(insert);
      onCreated(d.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke oprette enhed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl bg-card rounded-xl border shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h2 className="font-semibold">Ny enhed</h2>
            <p className="text-xs text-muted-foreground">
              Trin {step + 1} af {STEPS.length}: {STEPS[step]}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-2 border-b bg-muted/30">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        </div>

        <div className="p-5 min-h-[300px] space-y-4">
          {step === 0 && (
            <div className="grid grid-cols-2 gap-2">
              {DEVICE_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => set("device_type", t.key)}
                  className={`text-left rounded-lg border p-3 hover:border-primary transition ${form.device_type === t.key ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="font-medium text-sm">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.key}</div>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Field label="Navn *" value={form.name} onChange={(v) => set("name", v)} placeholder="fx SKB-WQ-01" />
              <Field label="Producent" value={form.manufacturer} onChange={(v) => set("manufacturer", v)} />
              <Field label="Model" value={form.model} onChange={(v) => set("model", v)} />
              <Field label="Serienummer" value={form.serial_number} onChange={(v) => set("serial_number", v)} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <label className="block text-xs font-medium">Forbindelse</label>
              <select className="w-full text-sm rounded-lg border bg-background px-3 py-2" value={form.connectivity_type} onChange={(e) => set("connectivity_type", e.target.value)}>
                {CONNECTIVITY.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bredde­grad" value={form.latitude} onChange={(v) => set("latitude", v)} placeholder="55.6761" />
                <Field label="Længde­grad" value={form.longitude} onChange={(v) => set("longitude", v)} placeholder="12.5683" />
              </div>
              <p className="text-xs text-muted-foreground">Koordinater kan sættes senere via kortet.</p>
            </div>
          )}

          {step === 3 && (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Parametre (fx pH, temperatur, turbiditet) tilføjes fra enhedens detaljevisning efter oprettelse.</p>
              <p>Dette gør det muligt at binde parametre til fysiske sensor-kanaler bagefter.</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <Field
                label="Forventet interval (minutter) *"
                value={form.expected_interval_minutes}
                onChange={(v) => set("expected_interval_minutes", v)}
                placeholder="60"
              />
              <p className="text-xs text-muted-foreground">
                Bruges til at afgøre om enheden er online, forsinket eller offline.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2 text-sm">
              <Row k="Type" v={form.device_type} />
              <Row k="Navn" v={form.name} />
              <Row k="Producent / model" v={`${form.manufacturer || "—"} / ${form.model || "—"}`} />
              <Row k="Serienummer" v={form.serial_number || "—"} />
              <Row k="Forbindelse" v={form.connectivity_type} />
              <Row k="Position" v={form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : "Sættes senere"} />
              <Row k="Interval" v={`${form.expected_interval_minutes} min`} />
              {error && <div className="text-xs text-destructive">{error}</div>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
            className="text-xs px-3 py-1.5 rounded-lg border bg-card inline-flex items-center gap-1 disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Tilbage
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-1 disabled:opacity-50"
            >
              Næste <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> {saving ? "Opretter…" : "Opret enhed"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <input
        className="w-full text-sm rounded-lg border bg-background px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b py-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
