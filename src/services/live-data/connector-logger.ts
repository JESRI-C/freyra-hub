import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

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

type ConnectorFetchLogInsert =
  Database["public"]["Tables"]["connector_fetch_logs"]["Insert"];

export async function logConnectorFetch(entry: ConnectorLogEntry): Promise<void> {
  if (!supabase) {
    if (import.meta.env.DEV) {
      console.debug("[connector-logger]", entry);
    }
    return;
  }
  const payload: ConnectorFetchLogInsert = {
    ...entry,
    error_message: entry.error_message ?? null,
    fetched_at: new Date().toISOString(),
  };
  try {
    // Supabase Database type resolves to a loose generic for this table at the
    // client boundary; cast through unknown keeps inference strict locally.
    await supabase
      .from("connector_fetch_logs")
      .insert(payload as unknown as never);
  } catch {
    // Never throw — logging must not break the app
  }
}
