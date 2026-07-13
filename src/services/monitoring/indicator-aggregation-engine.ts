// Indicator-aggregerings-engine: genberegner projekt-indicators ud fra rå
// observations + datakvalitets-tilstand. Pure aggregering (unit-testbar) +
// orkestrator der læser/skriver via Supabase.
//
// Dette er den automatiske "observations → indicators"-kobling som dashboardet
// (app.overview KPI'er, indikator-faner) læser fra. Kaldes fra ingest-endpointet
// og cron-jobbet, så indicators altid afspejler nyeste data.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logAuditEvent } from "./audit-service";

type Client = SupabaseClient<Database>;

/** Klient-typen som runIndicatorAggregation accepterer (til server-kald med admin-klient). */
export type AggregationClient = Client;

export interface ObservationLike {
  indicator_key: string | null;
  value: number | null;
  unit: string | null;
  observed_at: string | null;
  confidence: number | null;
}

export interface AggregatedIndicator {
  key: string;
  value: number;
  unit: string | null;
  trend: "up" | "down" | "flat";
  observationCount: number;
  avgConfidence: number | null;
}

/** Kendte indicator-nøgler → danske labels; ukendte nøgler humaniseres. */
const KEY_LABELS: Record<string, string> = {
  biodiversity_index: "Biodiversitetsindeks",
  data_quality: "Datakvalitet",
  co2e_reduced: "CO₂e reduceret",
  co2_sequestration: "CO₂-binding",
  water_table: "Vandstand",
  soil_moisture: "Jordfugtighed",
  report_readiness: "Rapportklarhed",
};

export function labelForIndicatorKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Aggregér observationer pr. indicator_key: nyeste værdi vinder, trend
 * beregnes mod den forrige (næstnyeste) observation.
 */
export function aggregateObservations(observations: ObservationLike[]): AggregatedIndicator[] {
  const byKey = new Map<string, ObservationLike[]>();
  for (const o of observations) {
    if (!o.indicator_key || o.value == null) continue;
    const list = byKey.get(o.indicator_key) ?? [];
    list.push(o);
    byKey.set(o.indicator_key, list);
  }

  const result: AggregatedIndicator[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => {
      const ta = a.observed_at ? Date.parse(a.observed_at) : 0;
      const tb = b.observed_at ? Date.parse(b.observed_at) : 0;
      return tb - ta;
    });
    const latest = sorted[0];
    const previous = sorted[1];
    const latestValue = latest.value as number;
    const trend: AggregatedIndicator["trend"] =
      previous?.value == null || previous.value === latestValue
        ? "flat"
        : latestValue > previous.value
          ? "up"
          : "down";
    const confidences = sorted.map((o) => o.confidence).filter((c): c is number => c != null);
    result.push({
      key,
      value: latestValue,
      unit: latest.unit,
      trend,
      observationCount: sorted.length,
      avgConfidence: confidences.length
        ? Math.round((confidences.reduce((s, c) => s + c, 0) / confidences.length) * 100) / 100
        : null,
    });
  }
  return result;
}

/**
 * Datakvalitets-score 0-100: starter på 100 og trækker fra pr. åbent issue
 * relativt til datamængden. Ingen målinger + ingen issues = null (ukendt).
 */
export function computeDataQualityScore(input: {
  measurementCount: number;
  openIssueCount: number;
}): number | null {
  const { measurementCount, openIssueCount } = input;
  if (measurementCount <= 0 && openIssueCount <= 0) return null;
  if (measurementCount <= 0) return 0;
  const issueRatio = openIssueCount / measurementCount;
  const score = Math.round(100 - Math.min(1, issueRatio) * 100);
  return Math.max(0, Math.min(100, score));
}

export interface AggregationRunResult {
  projectId: string;
  indicatorsUpdated: number;
  dataQualityScore: number | null;
  skipped: boolean;
}

/**
 * Kør fuld aggregering for et projekt: observations (90 dage) → indicators,
 * plus en samlet data_quality-indicator fra målinger vs. åbne kvalitets-issues.
 */
export async function runIndicatorAggregation(
  projectId: string,
  opts: { client?: Client } = {},
): Promise<AggregationRunResult> {
  const client = opts.client ?? (isSupabaseConfigured ? (browserClient as unknown as Client) : null);
  if (!client) return { projectId, indicatorsUpdated: 0, dataQualityScore: null, skipped: true };

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: obsRows } = await client
    .from("observations")
    .select("indicator_key,value,unit,observed_at,confidence")
    .eq("project_id", projectId)
    .gte("observed_at", since)
    .order("observed_at", { ascending: false })
    .limit(500);

  const aggregated = aggregateObservations((obsRows ?? []) as ObservationLike[]);

  let updated = 0;
  for (const agg of aggregated) {
    const { error } = await client.from("indicators").upsert(
      [
        {
          project_id: projectId,
          key: agg.key,
          label: labelForIndicatorKey(agg.key),
          value: agg.value,
          unit: agg.unit,
          trend: agg.trend,
          updated_at: new Date().toISOString(),
        },
      ] as never,
      { onConflict: "project_id,key" },
    );
    if (!error) updated++;
  }

  // Datakvalitet: målinger (30 dage) vs. åbne kvalitets-issues.
  const sinceQuality = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: devices }, { count: issueCount }] = await Promise.all([
    client.from("monitoring_devices").select("id").eq("project_id", projectId),
    client
      .from("data_quality_issues")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "open"),
  ]);
  const deviceIds = (devices ?? []).map((d) => (d as { id: string }).id);
  let measurementCount = 0;
  if (deviceIds.length > 0) {
    const { count } = await client
      .from("device_measurements")
      .select("id", { count: "exact", head: true })
      .in("device_id", deviceIds)
      .gte("measured_at", sinceQuality);
    measurementCount = count ?? 0;
  }
  // Observationer tæller også som datapunkter i kvalitetsgrundlaget.
  measurementCount += (obsRows ?? []).length;

  const dataQualityScore = computeDataQualityScore({
    measurementCount,
    openIssueCount: issueCount ?? 0,
  });
  if (dataQualityScore != null) {
    const { error } = await client.from("indicators").upsert(
      [
        {
          project_id: projectId,
          key: "data_quality",
          label: labelForIndicatorKey("data_quality"),
          value: dataQualityScore,
          unit: "%",
          trend: "flat",
          updated_at: new Date().toISOString(),
        },
      ] as never,
      { onConflict: "project_id,key" },
    );
    if (!error) updated++;
  }

  if (updated > 0) {
    await logAuditEvent({
      projectId,
      eventType: "indicators_recalculated",
      entityType: "indicator",
      title: `Indikatorer genberegnet (${updated} opdateret)`,
      description: `Aggregeret fra ${(obsRows ?? []).length} observationer · datakvalitet ${dataQualityScore ?? "ukendt"}`,
      source: "indicator-aggregation-engine",
    }).catch(() => undefined);
  }

  return { projectId, indicatorsUpdated: updated, dataQualityScore, skipped: false };
}
