import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import type { Site } from "@/lib/supabase/types";
import {
  DATA_SOURCE_TYPES,
  type DataSourceType,
  createDataSource,
  testDataSourceConfig,
  validateDataSource,
} from "@/services/data-sources-wizard-service";

type Step = 0 | 1 | 2 | 3;

interface Props {
  projectId: string;
  sites: Site[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

export function DataSourceWizard({ projectId, sites, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<DataSourceType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const activeSites = useMemo(() => sites.filter((s) => (s.status ?? "active") === "active"), [sites]);
  const canGoStep1 = true; // site is optional (project-level source allowed)
  const canGoStep2 = !!sourceType;

  function validate(): boolean {
    if (!sourceType) return false;
    const res = validateDataSource(sourceType, { name, description, site_id: siteId }, config);
    setErrors(res.errors);
    return res.ok;
  }

  async function runTest() {
    if (!sourceType) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testDataSourceConfig(sourceType, config);
      setTestResult(r);
    } finally {
      setTesting(false);
    }
  }

  async function submit() {
    if (!sourceType) return;
    if (!validate()) {
      toast.error("Ret felter markeret med rødt");
      return;
    }
    setSaving(true);
    try {
      const status = testResult?.ok ? "online" : "attention";
      await createDataSource({
        project_id: projectId,
        site_id: siteId,
        source_type: sourceType,
        name: name.trim(),
        description: description.trim() || undefined,
        provider: (config.provider as string | undefined) ?? null,
        config,
        status,
        last_sync_status: testResult?.ok ? "ok" : testResult ? "warning" : null,
        last_sync_message: testResult?.message ?? null,
      });
      toast.success("Datakilde oprettet");
      await queryClient.invalidateQueries({ queryKey: ["data-sources", projectId] });
      await onCreated();
      onClose();
    } catch (err) {
      toast.error(`Kunne ikke oprette: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-2xl shadow-xl border w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">Ny datakilde</h2>
            <div className="text-xs text-muted-foreground mt-0.5">
              Trin {step + 1} af 4 · {["Site", "Type", "Konfiguration", "Bekræft"][step]}
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted grid place-items-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress */}
        <div className="h-1.5 bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((step + 1) / 4) * 100}%` }}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {step === 0 && (
            <SiteStep sites={activeSites} siteId={siteId} onChange={setSiteId} />
          )}
          {step === 1 && (
            <TypeStep sourceType={sourceType} onChange={setSourceType} />
          )}
          {step === 2 && sourceType && (
            <ConfigStep
              sourceType={sourceType}
              name={name}
              onName={setName}
              description={description}
              onDescription={setDescription}
              config={config}
              onConfig={setConfig}
              errors={errors}
              testing={testing}
              testResult={testResult}
              onTest={runTest}
            />
          )}
          {step === 3 && sourceType && (
            <ConfirmStep
              siteName={activeSites.find((s) => s.id === siteId)?.name ?? "Projekt-niveau (intet site)"}
              sourceType={sourceType}
              name={name}
              description={description}
              config={config}
              testResult={testResult}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex items-center justify-between gap-2 bg-muted/20">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => (s - 1) as Step))}
            className="inline-flex items-center gap-1 rounded-xl border px-4 py-2 text-sm hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? "Annuller" : "Tilbage"}
          </button>
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 2 && !validate()) {
                  toast.error("Udfyld påkrævede felter");
                  return;
                }
                setStep((s) => (s + 1) as Step);
              }}
              disabled={(step === 0 && !canGoStep1) || (step === 1 && !canGoStep2)}
              className="inline-flex items-center gap-1 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              Næste
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Opret datakilde
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function SiteStep({ sites, siteId, onChange }: { sites: Site[]; siteId: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Vælg hvilket site datakilden dækker. Vælg <em>Projekt-niveau</em> hvis kilden dækker hele projektet.
      </p>
      <div className="space-y-2">
        <SiteOption
          selected={siteId === null}
          onClick={() => onChange(null)}
          title="Projekt-niveau"
          subtitle="Dækker hele projektet (fx satellitdata for området)"
        />
        {sites.length === 0 ? (
          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            Ingen aktive sites endnu. Opret et site først, eller vælg Projekt-niveau.
          </div>
        ) : (
          sites.map((s) => (
            <SiteOption
              key={s.id}
              selected={siteId === s.id}
              onClick={() => onChange(s.id)}
              title={s.name}
              subtitle={`${s.site_type ?? "—"}${s.area_ha != null ? ` · ${s.area_ha} ha` : ""}`}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SiteOption({ selected, onClick, title, subtitle }: { selected: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition-colors ${
        selected ? "border-primary bg-primary/5" : "hover:bg-muted"
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </button>
  );
}

function TypeStep({ sourceType, onChange }: { sourceType: DataSourceType | null; onChange: (t: DataSourceType) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Vælg hvilken type datakilde du opretter. Feltkravene tilpasses.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DATA_SOURCE_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`text-left rounded-xl border p-4 transition-colors ${
              sourceType === t.id ? "border-primary bg-primary/5" : "hover:bg-muted"
            }`}
          >
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

interface ConfigStepProps {
  sourceType: DataSourceType;
  name: string;
  onName: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  config: Record<string, unknown>;
  onConfig: (v: Record<string, unknown>) => void;
  errors: Record<string, string>;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onTest: () => void;
}

function ConfigStep(p: ConfigStepProps) {
  const set = (k: string, v: unknown) => p.onConfig({ ...p.config, [k]: v });
  return (
    <div className="space-y-4">
      <Field label="Navn på datakilde" required error={p.errors.name}>
        <input value={p.name} onChange={(e) => p.onName(e.target.value)} className="input-base" placeholder="F.eks. DMI regnmålere — Vejle" />
      </Field>
      <Field label="Beskrivelse" error={p.errors.description}>
        <textarea value={p.description} onChange={(e) => p.onDescription(e.target.value)} rows={2} className="input-base resize-none" />
      </Field>

      {p.sourceType === "file_upload" && (
        <>
          <Field label="Format" required error={p.errors["config.format"]}>
            <select className="input-base" value={String(p.config.format ?? "")} onChange={(e) => set("format", e.target.value)}>
              <option value="">Vælg…</option>
              <option value="csv">CSV</option>
              <option value="geojson">GeoJSON</option>
              <option value="excel">Excel</option>
            </select>
          </Field>
          <Field label="Filnavn / reference" required error={p.errors["config.file_ref"]}>
            <input className="input-base" value={String(p.config.file_ref ?? "")} onChange={(e) => set("file_ref", e.target.value)} placeholder="baseline_2025.csv" />
          </Field>
          <Field label="Opdaterings­frekvens" error={p.errors["config.frequency"]}>
            <select className="input-base" value={String(p.config.frequency ?? "once")} onChange={(e) => set("frequency", e.target.value)}>
              <option value="once">Engangs-upload</option>
              <option value="weekly">Ugentlig</option>
              <option value="monthly">Månedlig</option>
            </select>
          </Field>
        </>
      )}

      {p.sourceType === "api_endpoint" && (
        <>
          <Field label="Udbyder" required error={p.errors["config.provider"]}>
            <input className="input-base" value={String(p.config.provider ?? "")} onChange={(e) => set("provider", e.target.value)} placeholder="DMI, Miljøportalen, DataFordeleren…" />
          </Field>
          <Field label="Endpoint-URL (HTTPS)" required error={p.errors["config.url"]}>
            <input className="input-base" value={String(p.config.url ?? "")} onChange={(e) => set("url", e.target.value)} placeholder="https://api.example.dk/…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Auth-type" error={p.errors["config.auth_type"]}>
              <select className="input-base" value={String(p.config.auth_type ?? "none")} onChange={(e) => set("auth_type", e.target.value)}>
                <option value="none">Ingen</option>
                <option value="api_key">API-nøgle</option>
                <option value="bearer">Bearer-token</option>
              </select>
            </Field>
            <Field label="Refresh (min)" error={p.errors["config.refresh_interval_minutes"]}>
              <input type="number" min={5} max={10080} className="input-base" value={String(p.config.refresh_interval_minutes ?? 1440)} onChange={(e) => set("refresh_interval_minutes", Number(e.target.value))} />
            </Field>
          </div>
          {String(p.config.auth_type ?? "none") !== "none" && (
            <Field label="Secret-navn (reference)" required error={p.errors["config.api_key_ref"]}>
              <input className="input-base" value={String(p.config.api_key_ref ?? "")} onChange={(e) => set("api_key_ref", e.target.value)} placeholder="fx DMI_API_KEY" />
            </Field>
          )}
        </>
      )}

      {p.sourceType === "satellite" && (
        <>
          <Field label="Udbyder" required error={p.errors["config.provider"]}>
            <select className="input-base" value={String(p.config.provider ?? "")} onChange={(e) => set("provider", e.target.value)}>
              <option value="">Vælg…</option>
              <option value="sentinel-2">Sentinel-2</option>
              <option value="landsat-8">Landsat-8</option>
              <option value="landsat-9">Landsat-9</option>
            </select>
          </Field>
          <Field label="Tile-ID eller bbox" required error={p.errors["config.tile_or_bbox"]}>
            <input className="input-base" value={String(p.config.tile_or_bbox ?? "")} onChange={(e) => set("tile_or_bbox", e.target.value)} placeholder="T32VNH eller 9.4,55.5,9.8,55.8" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Revisit (dage)" error={p.errors["config.revisit_days"]}>
              <input type="number" min={1} max={30} className="input-base" value={String(p.config.revisit_days ?? 5)} onChange={(e) => set("revisit_days", Number(e.target.value))} />
            </Field>
            <Field label="Maks skydække (%)" error={p.errors["config.cloud_cover_max"]}>
              <input type="number" min={0} max={100} className="input-base" value={String(p.config.cloud_cover_max ?? 20)} onChange={(e) => set("cloud_cover_max", Number(e.target.value))} />
            </Field>
          </div>
        </>
      )}

      {p.sourceType === "iot_sensor" && (
        <>
          <Field label="Sensortype" required error={p.errors["config.sensor_type"]}>
            <input className="input-base" value={String(p.config.sensor_type ?? "")} onChange={(e) => set("sensor_type", e.target.value)} placeholder="Jordfugt, vandstand, temp…" />
          </Field>
          <Field label="Device-ID" required error={p.errors["config.device_id"]}>
            <input className="input-base" value={String(p.config.device_id ?? "")} onChange={(e) => set("device_id", e.target.value)} placeholder="fx eui-70b3d57ed0…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Protokol" error={p.errors["config.protocol"]}>
              <select className="input-base" value={String(p.config.protocol ?? "mqtt")} onChange={(e) => set("protocol", e.target.value)}>
                <option value="mqtt">MQTT</option>
                <option value="http">HTTP</option>
                <option value="lora">LoRaWAN</option>
              </select>
            </Field>
            <Field label="Måleenhed" required error={p.errors["config.unit"]}>
              <input className="input-base" value={String(p.config.unit ?? "")} onChange={(e) => set("unit", e.target.value)} placeholder="%, °C, m³/h…" />
            </Field>
          </div>
        </>
      )}

      {p.sourceType === "manual" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Måleenhed" required error={p.errors["config.unit"]}>
              <input className="input-base" value={String(p.config.unit ?? "")} onChange={(e) => set("unit", e.target.value)} placeholder="stk, %, cm…" />
            </Field>
            <Field label="Frekvens" error={p.errors["config.frequency"]}>
              <select className="input-base" value={String(p.config.frequency ?? "monthly")} onChange={(e) => set("frequency", e.target.value)}>
                <option value="daily">Daglig</option>
                <option value="weekly">Ugentlig</option>
                <option value="monthly">Månedlig</option>
                <option value="quarterly">Kvartalsvis</option>
              </select>
            </Field>
          </div>
          <Field label="Ansvarlig" error={p.errors["config.responsible"]}>
            <input className="input-base" value={String(p.config.responsible ?? "")} onChange={(e) => set("responsible", e.target.value)} placeholder="Navn eller rolle" />
          </Field>
        </>
      )}

      {/* Test connection */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Test forbindelse</div>
            <div className="text-xs text-muted-foreground">Bekræfter at kilden er nåbar/konfigureret — kan springes over.</div>
          </div>
          <button onClick={p.onTest} disabled={p.testing} className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            {p.testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Kør test
          </button>
        </div>
        {p.testResult && (
          <div className={`mt-2 rounded-xl px-3 py-2 text-xs flex items-start gap-2 ${p.testResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {p.testResult.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}
            <div>{p.testResult.message}</div>
          </div>
        )}
      </div>

      <style>{`
        .input-base { width: 100%; border-radius: 0.75rem; border: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.3); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input-base:focus { box-shadow: 0 0 0 2px hsl(var(--primary) / 0.4); }
        .input-base[data-error="true"] { border-color: hsl(var(--destructive)); }
      `}</style>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

function ConfirmStep({
  siteName,
  sourceType,
  name,
  description,
  config,
  testResult,
}: {
  siteName: string;
  sourceType: DataSourceType;
  name: string;
  description: string;
  config: Record<string, unknown>;
  testResult: { ok: boolean; message: string } | null;
}) {
  const typeLabel = DATA_SOURCE_TYPES.find((t) => t.id === sourceType)?.label ?? sourceType;
  const status = testResult?.ok ? "online" : "attention";
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/20 p-4 space-y-2 text-sm">
        <Row label="Site" value={siteName} />
        <Row label="Type" value={typeLabel} />
        <Row label="Navn" value={name || "—"} />
        {description && <Row label="Beskrivelse" value={description} />}
        <Row label="Status ved oprettelse" value={
          status === "online" ? "Online" : "Kræver handling"
        } />
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Konfiguration</div>
        <div className="rounded-xl border bg-muted/10 p-3 text-xs font-mono max-h-64 overflow-auto whitespace-pre-wrap break-all">
          {JSON.stringify(config, null, 2)}
        </div>
      </div>

      {testResult && (
        <div className={`rounded-xl px-3 py-2 text-xs flex items-start gap-2 ${testResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {testResult.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}
          <div>{testResult.message}</div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
