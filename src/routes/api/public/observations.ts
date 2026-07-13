// Public ingest-endpoint for observationer (sensor/MQTT-bro, feltapps, scripts).
// Autentificeres med Supabase publishable key i `apikey`-headeren — samme
// mønster som /api/public/monitoring/evaluate. Efter insert genberegnes
// projektets indicators automatisk, så dashboardet opdateres uden manuel kørsel.
//
// Body: { project_id: uuid, observations: [{ indicator_key, value, unit?,
//         observed_at?, observation_type?, site_id?, source_id?, confidence?,
//         metadata? }] }  — eller et enkelt observations-objekt i stedet for listen.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ObservationInput = z.object({
  indicator_key: z.string().min(1).max(100),
  value: z.number().finite(),
  unit: z.string().max(50).optional(),
  observed_at: z.string().datetime({ offset: true }).optional(),
  observation_type: z.string().max(100).optional(),
  site_id: z.string().uuid().optional(),
  source_id: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const BodyInput = z.object({
  project_id: z.string().uuid(),
  observations: z.array(ObservationInput).min(1).max(500).optional(),
  observation: ObservationInput.optional(),
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/observations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!expected) return jsonResponse({ error: "Server key not configured" }, 503);
        if (!providedKey || providedKey !== expected) return jsonResponse({ error: "Unauthorized" }, 401);

        let parsed: z.infer<typeof BodyInput>;
        try {
          parsed = BodyInput.parse(await request.json());
        } catch (err) {
          const detail = err instanceof z.ZodError ? err.issues : String(err);
          return jsonResponse({ error: "Invalid payload", detail }, 400);
        }

        const observations = parsed.observations ?? (parsed.observation ? [parsed.observation] : []);
        if (observations.length === 0) {
          return jsonResponse({ error: "No observations provided" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Verificér at projektet findes, så vi ikke opretter forældreløse rækker.
        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("id", parsed.project_id)
          .maybeSingle();
        if (!project) return jsonResponse({ error: "Unknown project_id" }, 404);

        const rows = observations.map((o) => ({
          project_id: parsed.project_id,
          site_id: o.site_id ?? null,
          source_id: o.source_id ?? null,
          observation_type: o.observation_type ?? "ingest",
          indicator_key: o.indicator_key,
          value: o.value,
          unit: o.unit ?? null,
          confidence: o.confidence ?? null,
          observed_at: o.observed_at ?? new Date().toISOString(),
          metadata: (o.metadata ?? {}) as never,
        }));

        const { error: insertError } = await supabaseAdmin.from("observations").insert(rows as never);
        if (insertError) {
          return jsonResponse({ error: "Insert failed", detail: insertError.message }, 500);
        }

        // Genberegn indicators med det samme (best-effort — insert er allerede ok).
        let aggregation: unknown = null;
        try {
          const mod = await import("@/services/monitoring/indicator-aggregation-engine");
          type AggClient = import("@/services/monitoring/indicator-aggregation-engine").AggregationClient;
          aggregation = await mod.runIndicatorAggregation(parsed.project_id, {
            client: supabaseAdmin as unknown as AggClient,
          });
        } catch (err) {
          aggregation = { error: (err as Error).message };
        }

        return jsonResponse({
          inserted: rows.length,
          project_id: parsed.project_id,
          aggregation,
        });
      },
    },
  },
});
