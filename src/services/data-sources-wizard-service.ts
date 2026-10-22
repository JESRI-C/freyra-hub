// Data-source create/update helpers (kompletterer data-sources-service.ts).
import { z } from "zod";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { DataSource } from "@/lib/supabase/types";
import { logAuditEvent } from "@/services/audit-service";

function db() {
  if (!isSupabaseConfigured || !supabase) throw new Error("Backend ikke konfigureret");
  return supabase as unknown as {
    from: (t: string) => {
      insert: (v: Record<string, unknown>) => {
        select: (c: string) => { single: () => Promise<{ data: DataSource | null; error: { message: string } | null }> };
      };
      update: (v: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
      delete: () => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

// ─── Type catalogue & validation ──────────────────────────────────────────────

export const DATA_SOURCE_TYPES = [
  { id: "file_upload", label: "Fil-upload", description: "CSV, Excel eller GeoJSON manuelt indlæst" },
  { id: "api_endpoint", label: "API-endpoint", description: "Ekstern REST/JSON-tjeneste (fx Miljøportalen, DMI)" },
  { id: "satellite", label: "Satellit", description: "Sentinel-2 / Landsat billedserie" },
  { id: "iot_sensor", label: "IoT-sensor", description: "Feltmåler der sender data løbende" },
  { id: "manual", label: "Manuel registrering", description: "Feltbesøg og notater indtastet af holdet" },
] as const;

export type DataSourceType = (typeof DATA_SOURCE_TYPES)[number]["id"];

// Base envelope
const baseSchema = z.object({
  name: z.string().trim().min(2, "Navn skal være mindst 2 tegn").max(120),
  description: z.string().trim().max(500).optional().default(""),
  site_id: z.string().uuid().nullable().optional(),
});

const fileUploadConfig = z.object({
  format: z.enum(["csv", "geojson", "excel"], { message: "Vælg filformat" }),
  file_ref: z.string().trim().min(1, "Angiv filnavn eller reference").max(255),
  frequency: z.enum(["once", "weekly", "monthly"]).default("once"),
});

const apiEndpointConfig = z.object({
  provider: z.string().trim().min(2, "Angiv udbyder").max(80),
  url: z.string().trim().url("Skal være en gyldig URL").startsWith("https://", "Kun HTTPS er tilladt"),
  auth_type: z.enum(["none", "api_key", "bearer"]).default("none"),
  api_key_ref: z.string().trim().max(120).optional().default(""),
  refresh_interval_minutes: z.coerce.number().int().min(5).max(10080).default(1440),
}).refine(
  (v) => v.auth_type === "none" || v.api_key_ref.length > 0,
  { message: "Angiv reference til API-nøgle (secret-navn)", path: ["api_key_ref"] },
);

const satelliteConfig = z.object({
  provider: z.enum(["sentinel-2", "landsat-8", "landsat-9"], { message: "Vælg satellit-udbyder" }),
  tile_or_bbox: z.string().trim().min(3, "Angiv tile-id eller bbox").max(200),
  revisit_days: z.coerce.number().int().min(1).max(30).default(5),
  cloud_cover_max: z.coerce.number().int().min(0).max(100).default(20),
});

const iotSensorConfig = z.object({
  sensor_type: z.string().trim().min(2, "Angiv sensortype").max(80),
  device_id: z.string().trim().min(2, "Angiv device-ID").max(120),
  protocol: z.enum(["mqtt", "http", "lora"]).default("mqtt"),
  unit: z.string().trim().min(1, "Angiv enhed").max(20),
});

const manualConfig = z.object({
  unit: z.string().trim().min(1, "Angiv enhed").max(20),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]).default("monthly"),
  responsible: z.string().trim().max(120).optional().default(""),
});

export const configSchemas: Record<DataSourceType, z.ZodTypeAny> = {
  file_upload: fileUploadConfig,
  api_endpoint: apiEndpointConfig,
  satellite: satelliteConfig,
  iot_sensor: iotSensorConfig,
  manual: manualConfig,
};

export function validateDataSource(sourceType: DataSourceType, base: unknown, config: unknown) {
  const baseParse = baseSchema.safeParse(base);
  const configParse = configSchemas[sourceType].safeParse(config);
  const errors: Record<string, string> = {};
  if (!baseParse.success) {
    for (const issue of baseParse.error.issues) {
      errors[issue.path.join(".")] = issue.message;
    }
  }
  if (!configParse.success) {
    for (const issue of configParse.error.issues) {
      errors[`config.${issue.path.join(".")}`] = issue.message;
    }
  }
  return {
    ok: baseParse.success && configParse.success,
    errors,
    data: baseParse.success && configParse.success
      ? { base: baseParse.data, config: configParse.data as Record<string, unknown> }
      : null,
  };
}

// ─── Test-connection ("dry run") ──────────────────────────────────────────────

export async function testDataSourceConfig(
  sourceType: DataSourceType,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  if (sourceType === "api_endpoint") {
    const url = String(config.url ?? "");
    if (!url) return { ok: false, message: "Mangler URL" };
    try {
      const res = await fetch(url, { method: "HEAD", mode: "no-cors" });
      // no-cors gives opaque response — treat as reachable
      return res.ok || res.type === "opaque"
        ? { ok: true, message: "Endpoint svarede — klar til brug" }
        : { ok: false, message: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, message: `Kunne ikke nå endpoint: ${(err as Error).message}` };
    }
  }
  if (sourceType === "file_upload") {
    const ref = String(config.file_ref ?? "");
    return ref
      ? { ok: true, message: `Fil-reference registreret: ${ref}` }
      : { ok: false, message: "Angiv en fil-reference" };
  }
  if (sourceType === "iot_sensor") {
    const id = String(config.device_id ?? "");
    return id
      ? { ok: true, message: `Sensor ${id} registreret — afventer første payload` }
      : { ok: false, message: "Mangler device-ID" };
  }
  if (sourceType === "satellite") {
    return { ok: true, message: "Satellit-konfiguration gemt — første revisit hentes af scheduler" };
  }
  return { ok: true, message: "Manuel kilde klar — feltdata indtastes af holdet" };
}

// ─── DB writes ────────────────────────────────────────────────────────────────

export async function createDataSource(input: {
  project_id: string;
  site_id: string | null;
  source_type: DataSourceType;
  name: string;
  description?: string;
  provider?: string | null;
  config: Record<string, unknown>;
  status: string;
  last_sync_status?: string | null;
  last_sync_message?: string | null;
}): Promise<DataSource> {
  const { data, error } = await db().from("data_sources").insert({
    project_id: input.project_id,
    site_id: input.site_id,
    name: input.name,
    source_type: input.source_type,
    provider: input.provider ?? null,
    description: input.description ?? null,
    config: input.config,
    status: input.status,
    last_sync_status: input.last_sync_status ?? null,
    last_sync_message: input.last_sync_message ?? null,
    last_sync_at: input.status === "online" ? new Date().toISOString() : null,
  }).select("*").single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ingen data returneret");
  void logAuditEvent({
    project_id: input.project_id,
    event_type: "data_source_created",
    title: `Datakilde tilføjet: ${input.name}`,
    description: `Type: ${input.source_type}${input.provider ? ` · ${input.provider}` : ""}`,
    actor: "Bruger",
    source: "manual",
  });
  return data;
}

export async function deleteDataSource(id: string, projectId: string): Promise<void> {
  const { error } = await db().from("data_sources").delete().eq("id", id);
  if (error) throw new Error(error.message);
  void logAuditEvent({
    project_id: projectId,
    event_type: "data_source_deleted",
    title: "Datakilde fjernet",
    actor: "Bruger",
    source: "manual",
  });
}
