import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// This is the canonical publishable-key app client. Interactive browser auth
// persists only in the browser; privileged or request-authenticated server
// code must use an explicit server/request-scoped client instead.
function readBrowserEnv(name: string): string {
  return ((import.meta.env[name] as string | undefined) ?? "").trim();
}

const supabaseUrl = readBrowserEnv("VITE_SUPABASE_URL");
const supabaseKey =
  readBrowserEnv("VITE_SUPABASE_PUBLISHABLE_KEY") || readBrowserEnv("VITE_SUPABASE_ANON_KEY") || "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
const isBrowserRuntime = typeof window !== "undefined";

const browserClient: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: isBrowserRuntime,
        autoRefreshToken: isBrowserRuntime,
        detectSessionInUrl: isBrowserRuntime,
      },
    })
  : null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  return browserClient;
}

export function requireSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  throw new Error(
    "Missing browser Supabase environment variable(s): VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).",
  );
}

export const supabase = browserClient;
