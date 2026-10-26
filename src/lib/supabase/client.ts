import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabase as sharedClient } from "@/integrations/supabase/client";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const isSupabaseConfigured = Boolean(url && key);
// All data services share the authenticated session and preview storage.
export const supabase = isSupabaseConfigured
  ? (sharedClient as unknown as SupabaseClient<Database>)
  : null;
export function getSupabaseClient() {
  return supabase;
}
