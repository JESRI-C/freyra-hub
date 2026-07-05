// Indicators Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchIndicatorsByProject,
  fetchIndicator,
  upsertIndicator,
  fetchMeasurementsForIndicator,
  insertMeasurement,
  updateIndicatorConfig,
} from "@/lib/supabase/queries";
import { logAuditEvent } from "@/services/audit-service";
import { createAction } from "@/services/actions-service";
import { SEED_INDICATORS } from "@/data/platform-seed";
import type { Indicator, IndicatorMeasurement } from "@/lib/supabase/types";

function isMissingTable(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "PGRST205");
}

export async function getIndicatorsByProject(projectId: string): Promise<Indicator[]> {
  const fallback = () => SEED_INDICATORS.filter((i) => i.project_id === projectId);
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchIndicatorsByProject(projectId);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

export async function getIndicator(projectId: string, key: string): Promise<Indicator | null> {
  const fallback = () =>
    SEED_INDICATORS.find((i) => i.project_id === projectId && i.key === key) ?? null;
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchIndicator(projectId, key);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function saveIndicator(input: {
  project_id: string;
  key: string;
  label: string;
  category?: string;
  value?: number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  status?: "good" | "warning" | "critical";
}): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await upsertIndicator(input);
  void logAuditEvent({
    project_id: input.project_id,
    event_type: "data_update",
    title: `Indikator opdateret: ${input.label}`,
    description: input.value !== undefined
      ? `Ny værdi: ${input.value}${input.unit ?? ""}`
      : undefined,
    actor: "System",
    source: "automated",
  });
}

// Formats an indicator value for display.
export function formatIndicatorValue(indicator: Indicator): string {
  if (indicator.value === null) return "—";
  const v = indicator.value;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} k${indicator.unit ?? ""}`.trim();
  return `${v}${indicator.unit ?? ""}`.trim();
}

// Returns a CSS color token for status.
export function indicatorStatusColor(indicator: Indicator): string {
  switch (indicator.status) {
    case "ok":
      return "text-emerald-600";
    case "warning":
      return "text-amber-600";
    case "critical":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

// ─── Measurements ─────────────────────────────────────────────────────────────

export type Period = "30d" | "90d" | "12m" | "all";

function periodToSince(period: Period): string | undefined {
  const now = new Date();
  if (period === "30d") now.setDate(now.getDate() - 30);
  else if (period === "90d") now.setDate(now.getDate() - 90);
  else if (period === "12m") now.setMonth(now.getMonth() - 12);
  else return undefined;
  return now.toISOString();
}

function seedMeasurements(indicator: Indicator, days: number): IndicatorMeasurement[] {
  const base = indicator.value ?? 50;
  const step = days > 90 ? 15 : days > 30 ? 7 : 3;
  const out: IndicatorMeasurement[] = [];
  for (let d = days; d >= 0; d -= step) {
    const t = new Date();
    t.setDate(t.getDate() - d);
    const noise = (Math.sin(d * 0.7) + Math.cos(d * 0.3)) * (base * 0.08);
    out.push({
      id: `seed-${indicator.id}-${d}`,
      indicator_id: indicator.id,
      project_id: indicator.project_id,
      measured_at: t.toISOString(),
      value: Math.max(0, Math.round((base + noise) * 100) / 100),
      unit: indicator.unit,
      source: "seed",
      confidence_score: 0.85,
      method: "simuleret",
      metadata: null,
      created_at: t.toISOString(),
    });
  }
  return out;
}

export async function getMeasurements(
  indicator: Indicator,
  period: Period = "90d",
): Promise<IndicatorMeasurement[]> {
  const days = period === "30d" ? 30 : period === "90d" ? 90 : period === "12m" ? 365 : 365;
  const fallback = () => seedMeasurements(indicator, days);
  if (!isSupabaseConfigured) return fallback();
  try {
    const rows = await fetchMeasurementsForIndicator(indicator.id, periodToSince(period));
    if (rows.length === 0) return fallback();
    return rows;
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

export async function recordMeasurement(input: {
  indicator: Indicator;
  value: number;
  measured_at?: string;
  source?: string;
  method?: string;
  confidence_score?: number;
}): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  const { indicator } = input;
  await insertMeasurement({
    indicator_id: indicator.id,
    project_id: indicator.project_id,
    value: input.value,
    unit: indicator.unit,
    measured_at: input.measured_at,
    source: input.source,
    method: input.method,
    confidence_score: input.confidence_score,
  });

  // Update current value + status + trend on the indicator
  const prev = indicator.value;
  const trend: "up" | "down" | "flat" =
    prev === null || prev === undefined
      ? "flat"
      : input.value > prev
        ? "up"
        : input.value < prev
          ? "down"
          : "flat";
  const status = evaluateStatus(indicator, input.value);

  await upsertIndicator({
    project_id: indicator.project_id ?? "",
    key: indicator.key,
    label: indicator.label,
    category: indicator.category ?? undefined,
    value: input.value,
    unit: indicator.unit ?? undefined,
    trend,
    status,
  });

  void logAuditEvent({
    project_id: indicator.project_id ?? undefined,
    event_type: "data_update",
    title: `Måling registreret: ${indicator.label}`,
    description: `${input.value}${indicator.unit ?? ""} · ${input.source ?? "manuel"}`,
    actor: "Bruger",
    source: "manual",
  });

  // Threshold breach → auto-create action
  if (status === "critical" && indicator.project_id) {
    try {
      await createAction({
        project_id: indicator.project_id,
        title: `Kritisk grænse overskredet: ${indicator.label}`,
        description: `Ny værdi ${input.value}${indicator.unit ?? ""} overskrider kritisk grænse (${indicator.threshold_critical}). Oprettet automatisk fra indikator.`,
        priority: "Høj",
      });
    } catch {
      // non-fatal
    }
  } else if (status === "warning" && indicator.project_id) {
    try {
      await createAction({
        project_id: indicator.project_id,
        title: `Advarselsgrænse ramt: ${indicator.label}`,
        description: `Ny værdi ${input.value}${indicator.unit ?? ""} har ramt advarselsgrænsen (${indicator.threshold_warning}). Oprettet automatisk fra indikator.`,
        priority: "Medium",
      });
    } catch {
      // non-fatal
    }
  }
}

export function evaluateStatus(
  indicator: Indicator,
  value: number,
): "ok" | "warning" | "critical" {
  const dir = indicator.threshold_direction ?? "above";
  const warn = indicator.threshold_warning ?? null;
  const crit = indicator.threshold_critical ?? null;
  if (crit !== null) {
    if (dir === "above" && value >= crit) return "critical";
    if (dir === "below" && value <= crit) return "critical";
  }
  if (warn !== null) {
    if (dir === "above" && value >= warn) return "warning";
    if (dir === "below" && value <= warn) return "warning";
  }
  return "ok";
}

export async function saveIndicatorConfig(
  indicator: Indicator,
  input: {
    label?: string;
    description?: string | null;
    threshold_warning?: number | null;
    threshold_critical?: number | null;
    threshold_direction?: "above" | "below";
    unit?: string | null;
  },
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateIndicatorConfig(indicator.id, input);
  void logAuditEvent({
    project_id: indicator.project_id ?? undefined,
    event_type: "data_update",
    title: `Indikator-konfiguration opdateret: ${indicator.label}`,
    actor: "Bruger",
    source: "manual",
  });
}
