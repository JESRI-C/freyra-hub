// Trusted cron endpoint: reconciles cancelled/expired upload-intent objects.
// Authenticated by the independent monitoring cron secret, never a Supabase key.
import { createFileRoute } from "@tanstack/react-router";
import { requireDedicatedServerSecret } from "@/lib/server-api-auth.server";

export async function handleMonitoringReconcileUploadsPost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  const authError = await requireDedicatedServerSecret(request, "MONITORING_CRON_API_SECRET");
  if (authError) return authError;

  const options: { limit?: number; lease_seconds?: number } = {};
  try {
    const body = (await request.json()) as { limit?: unknown; lease_seconds?: unknown } | null;
    if (typeof body?.limit === "number") options.limit = body.limit;
    if (typeof body?.lease_seconds === "number") options.lease_seconds = body.lease_seconds;
  } catch {
    // Empty bodies use conservative service defaults.
  }

  try {
    const [{ supabaseAdmin }, { reconcileUploadIntentOrphans }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/services/monitoring/upload-orphan-reconciliation.server"),
    ]);
    const result = await reconcileUploadIntentOrphans({
      client:
        supabaseAdmin as unknown as import("@/services/monitoring/upload-orphan-reconciliation.server").UploadOrphanReconciliationClient,
      limit: options.limit,
      leaseSeconds: options.lease_seconds,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Detailed per-object diagnostics are sanitized into the private cleanup
    // ledger. Never emit provider errors or credentials to application logs.
    console.error("[monitoring/reconcile-uploads] reconciliation failed");
    return Response.json(
      { error: "Upload orphan reconciliation failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const Route = createFileRoute("/api/public/monitoring/reconcile-uploads")({
  server: {
    handlers: {
      POST: handleMonitoringReconcileUploadsPost,
    },
  },
});
