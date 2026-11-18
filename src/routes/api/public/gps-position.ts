import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireDedicatedServerSecret } from "@/lib/server-api-auth.server";

const identifier = z.guid().transform((value) => value.toLowerCase());
const sample = z
  .object({
    event_id: identifier,
    device_id: identifier,
    measured_at: z.string().datetime({ offset: true }),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
const maximumBytes = 4096;
const headers = { "Cache-Control": "no-store" };

export async function handleGpsPositionPost({ request }: { request: Request }): Promise<Response> {
  const denied = await requireDedicatedServerSecret(request, "GPS_INGEST_API_SECRET");
  if (denied) return denied;
  const configuredProject = identifier.safeParse(process.env.GPS_INGEST_PROJECT_ID?.trim());
  if (!configuredProject.success)
    return Response.json({ error: "Ingest scope not configured" }, { status: 503, headers });

  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Invalid GPS measurement" }, { status: 400, headers });
  const bytes = new Uint8Array(maximumBytes);
  let length = 0;
  let position: z.infer<typeof sample>;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > maximumBytes) {
        void reader.cancel().catch(() => {});
        return Response.json({ error: "Payload too large" }, { status: 413, headers });
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
    position = sample.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))),
    );
  } catch {
    return Response.json({ error: "Invalid GPS measurement" }, { status: 400, headers });
  } finally {
    reader.releaseLock();
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await (supabaseAdmin as unknown as SupabaseClient).rpc("ingest_gps_position", {
      p_project_id: configuredProject.data,
      p_device_id: position.device_id,
      p_event_id: position.event_id,
      p_measured_at: position.measured_at,
      p_latitude: position.latitude,
      p_longitude: position.longitude,
    });
    if (!result.error && typeof result.data === "boolean")
      return Response.json(
        { event_id: position.event_id, inserted: result.data },
        { status: result.data ? 201 : 200, headers },
      );
    switch (result.error?.code) {
      case "P0002":
        return Response.json({ error: "Unknown GPS tracker" }, { status: 404, headers });
      case "22023":
        return Response.json({ error: "Invalid GPS measurement" }, { status: 400, headers });
      case "23505":
        return Response.json(
          { error: "GPS measurement ID is already in use" },
          { status: 409, headers },
        );
    }
  } catch {
    // Do not send database or credential details to the producer.
  }
  return Response.json({ error: "GPS measurement could not be stored" }, { status: 500, headers });
}

export const Route = createFileRoute("/api/public/gps-position")({
  server: { handlers: { POST: handleGpsPositionPost } },
});
