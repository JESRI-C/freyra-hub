// Public cron endpoint: evaluates quality + alert rules across all projects.
// Authenticated by a dedicated server secret via `x-api-key` or Bearer.
import { createFileRoute } from "@tanstack/react-router";
import { requireDedicatedServerSecret } from "@/lib/server-api-auth.server";

export async function handleMonitoringEvaluatePost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  const authError = await requireDedicatedServerSecret(request, "MONITORING_CRON_API_SECRET");
  if (authError) return authError;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runQualityEvaluation } = await import("@/services/monitoring/quality-engine");
  const { runAlertEvaluation } = await import("@/services/monitoring/alert-engine");
  const { runIndicatorAggregation } =
    await import("@/services/monitoring/indicator-aggregation-engine");

  // Optional body: { project_id?: string } for single-project runs.
  let projectIds: string[] = [];
  try {
    const body = (await request.json()) as { project_id?: string } | null;
    if (body?.project_id) projectIds = [body.project_id];
  } catch {
    /* no body */
  }

  if (projectIds.length === 0) {
    // Projekter med aktive regler ELLER nye observationer (seneste døgn)
    // — så indicator-genberegning også kører for projekter uden regler.
    const sinceObs = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [qr, ar, obs] = await Promise.all([
      supabaseAdmin.from("data_quality_rules").select("project_id").eq("is_active", true),
      supabaseAdmin.from("alert_rules").select("project_id").eq("is_active", true),
      supabaseAdmin
        .from("observations")
        .select("project_id")
        .gte("observed_at", sinceObs)
        .limit(1000),
    ]);
    const ids = new Set<string>();
    for (const row of qr.data ?? []) if (row.project_id) ids.add(row.project_id);
    for (const row of ar.data ?? []) if (row.project_id) ids.add(row.project_id);
    for (const row of obs.data ?? []) if (row.project_id) ids.add(row.project_id);
    projectIds = Array.from(ids);
  }

  const client = supabaseAdmin as unknown as Parameters<typeof runQualityEvaluation>[1] extends
    | infer O
    | undefined
    ? NonNullable<O> extends { client?: infer C }
      ? C
      : never
    : never;

  const results: unknown[] = [];
  for (const pid of projectIds) {
    try {
      const quality = await runQualityEvaluation(pid, { client });
      const alerts = await runAlertEvaluation(pid, { client });
      const indicators = await runIndicatorAggregation(pid, {
        client:
          supabaseAdmin as unknown as import("@/services/monitoring/indicator-aggregation-engine").AggregationClient,
      });
      results.push({ project_id: pid, quality, alerts, indicators });
    } catch (e) {
      results.push({ project_id: pid, error: (e as Error).message });
    }
  }

  return Response.json({
    ranAt: new Date().toISOString(),
    projects: results.length,
    results,
  });
}

export const Route = createFileRoute("/api/public/monitoring/evaluate")({
  server: {
    handlers: {
      POST: handleMonitoringEvaluatePost,
    },
  },
});
