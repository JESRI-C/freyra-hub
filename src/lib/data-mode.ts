import { isSupabaseConfigured } from "@/lib/supabase/client";

/** Demo data is an explicit local choice and never a database-error fallback. */
export function resolveDemoDataMode(requestedMode: unknown, databaseConfigured: boolean): boolean {
  return requestedMode === "demo" && !databaseConfigured;
}

export const isDemoDataEnabled = resolveDemoDataMode(
  import.meta.env.VITE_APP_DATA_MODE,
  isSupabaseConfigured,
);

export function requireCustomerDatabase(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Kundedatabasen er ikke konfigureret. Forbind Supabase før du åbner en kundesag. Eksempeldata kræver eksplicit demotilstand.",
    );
  }
}
