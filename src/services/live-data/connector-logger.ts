import { supabase } from "@/lib/supabase/client";

export interface ConnectorLogEntry {
  connector_id: string;
  project_id: string | null;
  mode: string;
  status: string;
  latency_ms: number;
  error_message?: string;
  source_type: string;
  geometry_used: boolean;
}

export async function logConnectorFetch(entry: ConnectorLogEntry): Promise<void> {
  if (!supabase) {
    if (import.meta.env.DEV) {
      console.debug("[connector-logger]", entry);
    }
    return;
  }
  try {
    await (supabase.from("connector_fetch_logs") as any).insert({
      ...entry,
      fetched_at: new Date().toISOString(),
    });
  } catch {
    // Never throw — logging must not break the app
  }
}
