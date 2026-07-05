// Public cron endpoint: evaluates quality + alert rules across all projects.
// Requires header `X-Cron-Secret` matching MONITORING_CRON_SECRET env var.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/monitoring/evaluate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        const expected = process.env.MONITORING_CRON_SECRET;
        if (!expected) {
          return new Response("Cron not configured", { status: 503 });
        }
        if (!secret || secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runQualityEvaluation } = await import("@/services/monitoring/quality-engine");
        const { runAlertEvaluation } = await import("@/services/monitoring/alert-engine");

        // Scope: optional { project_id?: string } body — if omitted, iterate
        // all projects that have at least one active rule.
        let projectIds: string[] = [];
        try {
          const body = (await request.json()) as { project_id?: string } | null;
          if (body?.project_id) projectIds = [body.project_id];
        } catch {
          /* no body */
        }

        if (projectIds.length === 0) {
          const [qr, ar] = await Promise.all([
            supabaseAdmin.from("data_quality_rules").select("project_id").eq("is_active", true),
            supabaseAdmin.from("alert_rules").select("project_id").eq("is_active", true),
          ]);
          const ids = new Set<string>();
          for (const row of qr.data ?? []) if (row.project_id) ids.add(row.project_id);
          for (const row of ar.data ?? []) if (row.project_id) ids.add(row.project_id);
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
            results.push({ project_id: pid, quality, alerts });
          } catch (e) {
            results.push({ project_id: pid, error: (e as Error).message });
          }
        }

        return Response.json({ ranAt: new Date().toISOString(), projects: results.length, results });
      },
    },
  },
});
