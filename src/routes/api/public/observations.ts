// Public ingest-endpoint for observationer (sensor/MQTT-bro, feltapps, scripts).
// Autentificeres med en dedikeret server-secret via `x-api-key` eller Bearer.
// Secretet er bundet til ét serverkonfigureret projekt; body kan ikke udvide scope.
// Efter insert genberegnes
// projektets indicators automatisk, så dashboardet opdateres uden manuel kørsel.
//
// Body: { project_id: uuid, observations: [{ indicator_key, value, unit?,
//         observed_at?, observation_type?, site_id?, source_id?, confidence?,
//         metadata? }] }  — eller et enkelt observations-objekt i stedet for listen.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireDedicatedServerSecret } from "@/lib/server-api-auth.server";

// Postgres accepts UUID/GUID values whose version nibble is 0 (used by the
// existing deterministic fixtures). Zod's strict uuid validator does not.
const PostgresIdInput = z.guid().transform((value) => value.toLowerCase());

const ObservationInput = z.object({
  indicator_key: z.string().min(1).max(100),
  value: z.number().finite(),
  unit: z.string().max(50).optional(),
  observed_at: z.string().datetime({ offset: true }).optional(),
  observation_type: z.string().max(100).optional(),
  site_id: PostgresIdInput.optional(),
  source_id: PostgresIdInput.optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const BodyInput = z.object({
  project_id: PostgresIdInput,
  observations: z.array(ObservationInput).min(1).max(500).optional(),
  observation: ObservationInput.optional(),
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function atomicIngestErrorResponse(error: { code?: string | null }): Response {
  switch (error.code) {
    case "22023":
      return jsonResponse({ error: "Invalid payload" }, 400);
    case "P0002":
      return jsonResponse({ error: "Unknown project_id" }, 404);
    case "23503":
    case "23514":
      return jsonResponse({ error: "Invalid observation scope" }, 400);
    default:
      // Do not expose database/provider details from this public endpoint.
      return jsonResponse({ error: "Insert failed" }, 500);
  }
}

export async function handleObservationsPost({ request }: { request: Request }): Promise<Response> {
  const authError = await requireDedicatedServerSecret(request, "OBSERVATIONS_INGEST_API_SECRET");
  if (authError) return authError;

  // Credentialets autoritative scope ligger server-side. Det forhindrer, at en
  // legitim integration kan vælge et andet projekt i request-body.
  const configuredProject = PostgresIdInput.safeParse(
    process.env.OBSERVATIONS_INGEST_PROJECT_ID?.trim(),
  );
  if (!configuredProject.success) {
    return jsonResponse({ error: "Ingest scope not configured" }, 503);
  }

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

  if (parsed.project_id !== configuredProject.data) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const rows = observations.map((o) => ({
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

  let ingestResult: Awaited<ReturnType<typeof supabaseAdmin.rpc>>;
  try {
    ingestResult = await supabaseAdmin.rpc("ingest_observations_atomic", {
      p_project_id: configuredProject.data,
      p_observations: rows,
    });
  } catch {
    return jsonResponse({ error: "Insert failed" }, 500);
  }

  if (ingestResult.error) {
    return atomicIngestErrorResponse(ingestResult.error);
  }
  if (!Number.isSafeInteger(ingestResult.data) || ingestResult.data !== rows.length) {
    return jsonResponse({ error: "Insert failed" }, 500);
  }

  // Genberegn indicators med det samme (best-effort — insert er allerede ok).
  let aggregation: unknown = null;
  try {
    const mod = await import("@/services/monitoring/indicator-aggregation-engine");
    type AggClient = import("@/services/monitoring/indicator-aggregation-engine").AggregationClient;
    aggregation = await mod.runIndicatorAggregation(configuredProject.data, {
      client: supabaseAdmin as unknown as AggClient,
    });
  } catch (err) {
    aggregation = { error: (err as Error).message };
  }

  return jsonResponse({
    inserted: ingestResult.data,
    project_id: configuredProject.data,
    aggregation,
  });
}

export const Route = createFileRoute("/api/public/observations")({
  server: {
    handlers: {
      POST: handleObservationsPost,
    },
  },
});
