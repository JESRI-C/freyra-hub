import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Reads env vars injected by Vite (VITE_ prefix).
// Falls back gracefully so the app still boots locally without a Supabase project.
const supabaseUrl = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
const supabaseKey = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// Singleton — safe to import from any module.
let _client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;
  if (!_client) {
    _client = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _client;
}

// Convenience re-export so call sites can write:
//   import { supabase } from "@/lib/supabase/client"
export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
