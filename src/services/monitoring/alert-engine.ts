// Alert-rule evaluation engine.
// Pure evaluators + orchestrator that fetches state and fires monitoring_alerts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { AlertRule } from "./alert-rules-service";
import { logAuditEvent } from "./audit-service";

type Client = SupabaseClient<Database>;


type Device = Database["public"]["Tables"]["monitoring_devices"]["Row"];
type Measurement = Database["public"]["Tables"]["device_measurements"]["Row"];
type AlertInsert = Database["public"]["Tables"]["monitoring_alerts"]["Insert"];

export interface DetectedAlert {
  ruleId: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  sourceType: string | null;
  sourceId: string | null;
  deviceId: string | null;
  zoneId: string | null;
  context: Record<string, unknown>;
  dedupeKey: string;
}

interface AlertContext {
  devices: Device[];
  measurements: Measurement[];
  openIssueCount: number;
  now: Date;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function cond(rule: AlertRule): Record<string, unknown> {
  return (rule.condition ?? {}) as Record<string, unknown>;
}

export const alertEvaluators: Record<string, (rule: AlertRule, ctx: AlertContext) => DetectedAlert[]> = {
  device_offline: (rule, ctx) => {
    const c = cond(rule);
    const defaultMinutes = num(c.max_minutes, 0);
    const out: DetectedAlert[] = [];
    for (const d of ctx.devices) {
      const expected = defaultMinutes > 0
        ? defaultMinutes
        : Math.max(60, (d.expected_interval_minutes ?? 60) * 2);
      const t = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
      const cutoff = ctx.now.getTime() - expected * 60_000;
      if (!t || t < cutoff) {
        out.push({
          ruleId: rule.id,
          alertType: rule.trigger_type,
          severity: rule.severity,
          title: `Enhed offline: ${d.name}`,
          message: `Ingen kontakt i ${Math.round((ctx.now.getTime() - t) / 60_000)} min (grænse ${expected}).`,
          sourceType: "monitoring_device",
          sourceId: d.id,
          deviceId: d.id,
          zoneId: d.zone_id,
          context: { last_seen_at: d.last_seen_at, expected_minutes: expected },
          dedupeKey: `${rule.id}|device_offline|${d.id}`,
        });
      }
    }
    return out;
  },
  low_battery: (rule, ctx) => {
    const c = cond(rule);
    const threshold = num(c.threshold, 20);
    return ctx.devices
      .filter((d) => d.battery_level != null && d.battery_level <= threshold)
      .map((d) => ({
        ruleId: rule.id,
        alertType: rule.trigger_type,
        severity: rule.severity,
        title: `Lavt batteri: ${d.name}`,
        message: `Batteri ${d.battery_level}% (grænse ${threshold}%).`,
        sourceType: "monitoring_device",
        sourceId: d.id,
        deviceId: d.id,
        zoneId: d.zone_id,
        context: { battery_level: d.battery_level, threshold },
        dedupeKey: `${rule.id}|low_battery|${d.id}`,
      }));
  },
  missing_data: (rule, ctx) => {
    const c = cond(rule);
    const hours = num(c.hours, 24);
    const cutoff = ctx.now.getTime() - hours * 3600_000;
    const bydev = new Map<string, number>();
    for (const m of ctx.measurements) {
      const t = new Date(m.measured_at).getTime();
      const prev = bydev.get(m.device_id) ?? 0;
      if (t > prev) bydev.set(m.device_id, t);
    }
    return ctx.devices
      .filter((d) => (bydev.get(d.id) ?? 0) < cutoff)
      .map((d) => ({
        ruleId: rule.id,
        alertType: rule.trigger_type,
        severity: rule.severity,
        title: `Manglende data: ${d.name}`,
        message: `Ingen målinger i ${hours} timer.`,
        sourceType: "monitoring_device",
        sourceId: d.id,
        deviceId: d.id,
        zoneId: d.zone_id,
        context: { hours },
        dedupeKey: `${rule.id}|missing_data|${d.id}`,
      }));
  },
  low_data_quality: (rule, ctx) => {
    const c = cond(rule);
    const threshold = num(c.max_open_issues, 10);
    if (ctx.openIssueCount < threshold) return [];
    return [
      {
        ruleId: rule.id,
        alertType: rule.trigger_type,
        severity: rule.severity,
        title: `Lav datakvalitet`,
        message: `${ctx.openIssueCount} åbne datakvalitetsproblemer (grænse ${threshold}).`,
        sourceType: "project",
        sourceId: null,
        deviceId: null,
        zoneId: null,
        context: { open_issues: ctx.openIssueCount, threshold },
        dedupeKey: `${rule.id}|low_data_quality|project`,
      },
    ];
  },
  critical_reading: (rule, ctx) => {
    const c = cond(rule);
    const critMin = num(c.critical_min, -Infinity);
    const critMax = num(c.critical_max, Infinity);
    return ctx.measurements
      .filter((m) => m.value < critMin || m.value > critMax)
      .map((m) => ({
        ruleId: rule.id,
        alertType: rule.trigger_type,
        severity: rule.severity,
        title: `Kritisk måling`,
        message: `Værdi ${m.value} uden for kritisk interval [${critMin}, ${critMax}].`,
        sourceType: "device_measurement",
        sourceId: m.id,
        deviceId: m.device_id,
        zoneId: null,
        context: { value: m.value, critical_min: critMin, critical_max: critMax },
        dedupeKey: `${rule.id}|critical_reading|${m.id}`,
      }));
  },
  data_anomaly: (rule, ctx) => {
    const c = cond(rule);
    const threshold = num(c.z_threshold, 3);
    const groups = new Map<string, Measurement[]>();
    for (const m of ctx.measurements) {
      const key = `${m.device_id}|${m.parameter_id ?? ""}`;
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }
    const out: DetectedAlert[] = [];
    for (const list of groups.values()) {
      if (list.length < 5) continue;
      const values = list.map((m) => m.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const sd = Math.sqrt(variance) || 1;
      const last = list[list.length - 1];
      const z = Math.abs((last.value - mean) / sd);
      if (z > threshold) {
        out.push({
          ruleId: rule.id,
          alertType: rule.trigger_type,
          severity: rule.severity,
          title: `Dataafvigelse`,
          message: `Seneste værdi z=${z.toFixed(2)} (grænse ${threshold}).`,
          sourceType: "device_measurement",
          sourceId: last.id,
          deviceId: last.device_id,
          zoneId: null,
          context: { z, mean, sd },
          dedupeKey: `${rule.id}|data_anomaly|${last.device_id}`,
        });
      }
    }
    return out;
  },
};

export function evaluateAlertRules(rules: AlertRule[], ctx: AlertContext): DetectedAlert[] {
  const out: DetectedAlert[] = [];
  for (const rule of rules) {
    if (!rule.is_active) continue;
    const fn = alertEvaluators[rule.trigger_type];
    if (!fn) continue;
    out.push(...fn(rule, ctx));
  }
  return out;
}

export interface AlertRunResult {
  ruleCount: number;
  deviceCount: number;
  detected: number;
  fired: number;
  skippedDuplicates: number;
  ranAt: string;
}

export async function runAlertEvaluation(
  projectId: string,
  opts?: { windowMinutes?: number },
): Promise<AlertRunResult> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const windowMinutes = opts?.windowMinutes ?? 24 * 60;
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const [rulesRes, devicesRes, issuesCountRes] = await Promise.all([
    supabase.from("alert_rules").select("*").or(`project_id.eq.${projectId},project_id.is.null`).eq("is_active", true),
    supabase.from("monitoring_devices").select("*").eq("project_id", projectId),
    supabase.from("data_quality_issues").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "open"),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (devicesRes.error) throw devicesRes.error;

  const rules = (rulesRes.data as AlertRule[] | null) ?? [];
  const devices = (devicesRes.data as Device[] | null) ?? [];
  const deviceIds = devices.map((d) => d.id);

  let measurements: Measurement[] = [];
  if (deviceIds.length > 0) {
    const { data, error } = await supabase
      .from("device_measurements")
      .select("*")
      .in("device_id", deviceIds)
      .gte("measured_at", since)
      .order("measured_at", { ascending: true })
      .limit(5000);
    if (error) throw error;
    measurements = (data as Measurement[] | null) ?? [];
  }

  const now = new Date();
  const detected = evaluateAlertRules(rules, {
    devices,
    measurements,
    openIssueCount: issuesCountRes.count ?? 0,
    now,
  });

  // Dedupe against active alerts for this project.
  const { data: openAlertsRaw } = await supabase
    .from("monitoring_alerts")
    .select("id, alert_rule_id, alert_type, source_id, status")
    .eq("project_id", projectId)
    .in("status", ["active", "acknowledged"]);
  const openKeys = new Set(
    ((openAlertsRaw ?? []) as Array<{ alert_rule_id: string | null; alert_type: string; source_id: string | null }>).map(
      (a) => `${a.alert_rule_id ?? ""}|${a.alert_type}|${a.source_id ?? ""}`,
    ),
  );

  const inserts: AlertInsert[] = [];
  let skipped = 0;
  for (const d of detected) {
    const key = `${d.ruleId}|${d.alertType}|${d.sourceId ?? ""}`;
    if (openKeys.has(key)) {
      skipped++;
      continue;
    }
    openKeys.add(key);
    inserts.push({
      project_id: projectId,
      alert_rule_id: d.ruleId,
      alert_type: d.alertType,
      severity: d.severity,
      title: d.title,
      message: d.message,
      status: "active",
      source_type: d.sourceType,
      source_id: d.sourceId,
      device_id: d.deviceId,
      zone_id: d.zoneId,
      context: d.context as never,
      triggered_at: now.toISOString(),
    });
  }

  let fired = 0;
  if (inserts.length > 0) {
    const { error, count } = await supabase.from("monitoring_alerts").insert(inserts as never, { count: "exact" });
    if (error) throw error;
    fired = count ?? inserts.length;
  }

  const summary: AlertRunResult = {
    ruleCount: rules.length,
    deviceCount: devices.length,
    detected: detected.length,
    fired,
    skippedDuplicates: skipped,
    ranAt: now.toISOString(),
  };

  await logAuditEvent({
    projectId,
    eventType: "alert_evaluation_ran",
    entityType: "project",
    entityId: projectId,
    title: `Alarmregler kørt (${rules.length} regler)`,
    description: `${detected.length} fund, ${fired} nye alarmer, ${skipped} eksisterende`,
    afterData: summary as unknown as Record<string, unknown>,
  });

  return summary;
}
