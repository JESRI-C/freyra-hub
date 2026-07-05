// Quality-rule evaluation engine.
// Pure evaluators (unit-testable) + orchestrator that fetches recent
// measurements for a project and persists issues (with dedupe).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { QualityRule, QualityIssueInsert } from "./quality-rules-service";
import { logAuditEvent } from "./audit-service";

type Client = SupabaseClient<Database>;


export type Measurement = Database["public"]["Tables"]["device_measurements"]["Row"];
export type Device = Database["public"]["Tables"]["monitoring_devices"]["Row"];

export interface DetectedIssue {
  ruleId: string;
  issueType: string;
  severity: string;
  description: string;
  measurementId?: string | null;
  deviceId?: string | null;
  zoneId?: string | null;
  dataSourceId?: string | null;
  originalData?: Record<string, unknown> | null;
}

interface RuleContext {
  measurements: Measurement[];
  devices: Device[];
  now: Date;
}

/** Coerce configuration jsonb to a plain record. */
function cfg(rule: QualityRule): Record<string, unknown> {
  return (rule.configuration ?? {}) as Record<string, unknown>;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function matchesScope(rule: QualityRule, m: Measurement, devicesById: Map<string, Device>): boolean {
  const d = devicesById.get(m.device_id);
  if (rule.data_source_id && d?.zone_id) {
    // no direct data_source link on device; skip strict scope filter here.
  }
  if (rule.parameter_key) {
    // parameter_key can match parameter_id or a unit label.
    if (rule.parameter_key !== m.parameter_id && rule.parameter_key !== m.unit) return false;
  }
  return true;
}

/** Individual evaluators — each returns detected issues without persisting. */
export const evaluators: Record<string, (rule: QualityRule, ctx: RuleContext) => DetectedIssue[]> = {
  out_of_range: (rule, ctx) => {
    const c = cfg(rule);
    const min = num(c.min, -Infinity);
    const max = num(c.max, Infinity);
    return ctx.measurements
      .filter((m) => m.value < min || m.value > max)
      .map((m) => mkIssue(rule, m, `Værdi ${m.value} uden for [${min}, ${max}]`, { value: m.value, min, max }));
  },
  missing_gps: (rule, ctx) =>
    ctx.measurements
      .filter((m) => m.latitude === null || m.longitude === null)
      .map((m) => mkIssue(rule, m, "Måling mangler GPS-koordinater", { latitude: m.latitude, longitude: m.longitude })),
  invalid_date: (rule, ctx) => {
    const nowMs = ctx.now.getTime();
    return ctx.measurements
      .filter((m) => {
        const t = new Date(m.measured_at).getTime();
        return !Number.isFinite(t) || t > nowMs + 60_000;
      })
      .map((m) => mkIssue(rule, m, `Ugyldig dato: ${m.measured_at}`, { measured_at: m.measured_at }));
  },
  duplicate: (rule, ctx) => {
    const seen = new Map<string, Measurement>();
    const dupes: DetectedIssue[] = [];
    for (const m of ctx.measurements) {
      const key = `${m.device_id}|${m.parameter_id ?? ""}|${m.measured_at}|${m.value}`;
      if (seen.has(key)) {
        dupes.push(mkIssue(rule, m, "Dublet af eksisterende måling", { key, first_id: seen.get(key)!.id }));
      } else {
        seen.set(key, m);
      }
    }
    return dupes;
  },
  identical_repeat: (rule, ctx) => {
    const c = cfg(rule);
    const n = Math.max(3, Math.floor(num(c.count, 5)));
    const byDevice = groupBy(ctx.measurements, (m) => `${m.device_id}|${m.parameter_id ?? ""}`);
    const issues: DetectedIssue[] = [];
    for (const list of byDevice.values()) {
      list.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
      for (let i = n - 1; i < list.length; i++) {
        const window = list.slice(i - n + 1, i + 1);
        if (window.every((w) => w.value === window[0].value)) {
          issues.push(mkIssue(rule, list[i], `${n} identiske værdier i træk (${window[0].value})`, { value: window[0].value, count: n }));
        }
      }
    }
    return issues;
  },
  spike: (rule, ctx) => {
    const c = cfg(rule);
    const threshold = num(c.z_threshold, 3);
    const byDevice = groupBy(ctx.measurements, (m) => `${m.device_id}|${m.parameter_id ?? ""}`);
    const issues: DetectedIssue[] = [];
    for (const list of byDevice.values()) {
      if (list.length < 5) continue;
      const values = list.map((m) => m.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const sd = Math.sqrt(variance) || 1;
      list.forEach((m) => {
        const z = Math.abs((m.value - mean) / sd);
        if (z > threshold) {
          issues.push(mkIssue(rule, m, `Spike: z=${z.toFixed(2)} (grænse ${threshold})`, { z, mean, sd, value: m.value }));
        }
      });
    }
    return issues;
  },
  unit_mismatch: (rule, ctx) => {
    const c = cfg(rule);
    const expected = typeof c.expected_unit === "string" ? c.expected_unit : null;
    if (!expected) return [];
    return ctx.measurements
      .filter((m) => m.unit && m.unit !== expected)
      .map((m) => mkIssue(rule, m, `Enhed ${m.unit} matcher ikke forventet ${expected}`, { unit: m.unit, expected }));
  },
  stale_data: (rule, ctx) => {
    const c = cfg(rule);
    const maxMinutes = num(c.max_minutes, 24 * 60);
    const cutoff = ctx.now.getTime() - maxMinutes * 60_000;
    const issues: DetectedIssue[] = [];
    for (const d of ctx.devices) {
      const t = d.last_measurement_at ? new Date(d.last_measurement_at).getTime() : 0;
      if (!t || t < cutoff) {
        issues.push({
          ruleId: rule.id,
          issueType: rule.rule_type,
          severity: rule.severity,
          description: `Enhed ${d.name} har ikke sendt data i over ${maxMinutes} min`,
          deviceId: d.id,
          zoneId: d.zone_id,
          originalData: { last_measurement_at: d.last_measurement_at, max_minutes: maxMinutes },
        });
      }
    }
    return issues;
  },
  missing_value: (rule, _ctx) => {
    // Placeholder — device_measurements.value is NOT NULL. Consider mapping this
    // to expected-parameter coverage; for now no-op so it doesn't spam.
    void rule;
    return [];
  },
  outside_project: (rule, ctx) => {
    const c = cfg(rule);
    const bbox = c.bbox as { minLat?: number; maxLat?: number; minLng?: number; maxLng?: number } | undefined;
    if (!bbox) return [];
    return ctx.measurements
      .filter((m) => m.latitude != null && m.longitude != null)
      .filter(
        (m) =>
          m.latitude! < num(bbox.minLat, -90) ||
          m.latitude! > num(bbox.maxLat, 90) ||
          m.longitude! < num(bbox.minLng, -180) ||
          m.longitude! > num(bbox.maxLng, 180),
      )
      .map((m) => mkIssue(rule, m, `Måling uden for projektområde`, { lat: m.latitude, lng: m.longitude, bbox }));
  },
};

function mkIssue(rule: QualityRule, m: Measurement, description: string, original: Record<string, unknown>): DetectedIssue {
  return {
    ruleId: rule.id,
    issueType: rule.rule_type,
    severity: rule.severity,
    description,
    measurementId: m.id,
    deviceId: m.device_id,
    dataSourceId: rule.data_source_id,
    originalData: original,
  };
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Pure entry point — evaluates all rules against a snapshot. */
export function evaluateRules(rules: QualityRule[], ctx: RuleContext): DetectedIssue[] {
  const detected: DetectedIssue[] = [];
  const devicesById = new Map(ctx.devices.map((d) => [d.id, d]));
  for (const rule of rules) {
    if (!rule.is_active) continue;
    const evalFn = evaluators[rule.rule_type];
    if (!evalFn) continue;
    const scoped: RuleContext = {
      ...ctx,
      measurements: ctx.measurements.filter((m) => matchesScope(rule, m, devicesById)),
    };
    detected.push(...evalFn(rule, scoped));
  }
  return detected;
}

export interface RunResult {
  ruleCount: number;
  measurementCount: number;
  detected: number;
  inserted: number;
  skippedDuplicates: number;
  ranAt: string;
}

/** Fetch → evaluate → dedupe → insert. Returns summary. */
export async function runQualityEvaluation(
  projectId: string,
  opts?: { windowMinutes?: number },
): Promise<RunResult> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const windowMinutes = opts?.windowMinutes ?? 24 * 60;
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const [rulesRes, devicesRes] = await Promise.all([
    supabase.from("data_quality_rules").select("*").or(`project_id.eq.${projectId},project_id.is.null`).eq("is_active", true),
    supabase.from("monitoring_devices").select("*").eq("project_id", projectId),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (devicesRes.error) throw devicesRes.error;

  const rules = (rulesRes.data as QualityRule[] | null) ?? [];
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
  const detected = evaluateRules(rules, { measurements, devices, now });

  // Dedupe against currently-open issues for this project.
  const { data: openIssuesRaw } = await supabase
    .from("data_quality_issues")
    .select("id, measurement_id, device_id, issue_type, status")
    .eq("project_id", projectId)
    .eq("status", "open");
  const openKeys = new Set(
    ((openIssuesRaw ?? []) as Array<{ measurement_id: string | null; device_id: string | null; issue_type: string }>).map(
      (i) => `${i.issue_type}|${i.measurement_id ?? ""}|${i.device_id ?? ""}`,
    ),
  );

  const inserts: QualityIssueInsert[] = [];
  let skipped = 0;
  for (const d of detected) {
    const key = `${d.issueType}|${d.measurementId ?? ""}|${d.deviceId ?? ""}`;
    if (openKeys.has(key)) {
      skipped++;
      continue;
    }
    openKeys.add(key);
    inserts.push({
      project_id: projectId,
      zone_id: d.zoneId ?? null,
      device_id: d.deviceId ?? null,
      data_source_id: d.dataSourceId ?? null,
      measurement_id: d.measurementId ?? null,
      issue_type: d.issueType,
      severity: d.severity,
      status: "open",
      description: d.description,
      original_data: (d.originalData ?? null) as never,
    });
  }

  let inserted = 0;
  if (inserts.length > 0) {
    const { error, count } = await supabase
      .from("data_quality_issues")
      .insert(inserts as never, { count: "exact" });
    if (error) throw error;
    inserted = count ?? inserts.length;
  }

  const summary: RunResult = {
    ruleCount: rules.length,
    measurementCount: measurements.length,
    detected: detected.length,
    inserted,
    skippedDuplicates: skipped,
    ranAt: now.toISOString(),
  };

  await logAuditEvent({
    projectId,
    eventType: "quality_evaluation_ran",
    entityType: "project",
    entityId: projectId,
    title: `Kvalitetsregler kørt (${rules.length} regler)`,
    description: `${detected.length} fund, ${inserted} nye issues, ${skipped} eksisterende`,
    afterData: summary as unknown as Record<string, unknown>,
  });

  return summary;
}
