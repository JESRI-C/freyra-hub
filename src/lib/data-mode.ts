import { isSupabaseConfigured } from "@/lib/supabase/client";
/** Backward-compatible flag accepted only to reject sample data in every environment. */
export function resolveDemoDataMode(
  _requestedMode: unknown,
  _databaseConfigured: boolean,
): boolean {
  return false;
}
export const isDemoDataEnabled = false;
export function requireCustomerDatabase(): void {
  if (!isSupabaseConfigured)
    throw new Error(
      "Kundedatabasen er ikke konfigureret. Forbind Supabase før du åbner en kundesag.",
    );
}
