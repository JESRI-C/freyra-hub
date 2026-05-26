// Indicators Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchIndicatorsByProject, fetchIndicator } from "@/lib/supabase/queries";
import { SEED_INDICATORS } from "@/data/platform-seed";
import type { Indicator } from "@/lib/supabase/types";

function isMissingTable(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "PGRST205");
}

export async function getIndicatorsByProject(projectId: string): Promise<Indicator[]> {
  const fallback = () => SEED_INDICATORS.filter((i) => i.project_id === projectId);
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchIndicatorsByProject(projectId);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

export async function getIndicator(projectId: string, key: string): Promise<Indicator | null> {
  const fallback = () =>
    SEED_INDICATORS.find((i) => i.project_id === projectId && i.key === key) ?? null;
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchIndicator(projectId, key);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

// Formats an indicator value for display.
export function formatIndicatorValue(indicator: Indicator): string {
  if (indicator.value === null) return "—";
  const v = indicator.value;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} k${indicator.unit ?? ""}`.trim();
  return `${v}${indicator.unit ?? ""}`.trim();
}

// Returns a CSS color token for status.
export function indicatorStatusColor(indicator: Indicator): string {
  switch (indicator.status) {
    case "ok":
      return "text-emerald-600";
    case "warning":
      return "text-amber-600";
    case "critical":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}
