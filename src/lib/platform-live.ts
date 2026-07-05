// Live-data hooks that replace the platform-data mock arrays with real
// Supabase reads scoped to the current user's organization.
//
// Shapes match ActivityFeed / CriticalActionsPanel props in
// src/components/platform/Primitives.tsx.

import { useQuery } from "@tanstack/react-query";
import { fetchAllAuditEvents, fetchAllOpenActions } from "@/lib/supabase/queries";
import { useAuth } from "@/lib/auth";

type FeedItem = { module: string; text: string; at: string; tone: "info" | "success" | "warning" };
type CriticalAction = {
  module: string;
  title: string;
  priority: string;
  owner: string;
  deadline: string;
  href: string;
};

function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - d) / 1000));
  if (diff < 60) return "lige nu";
  if (diff < 3600) return `${Math.floor(diff / 60)} min siden`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} timer siden`;
  if (diff < 172800) return "i går";
  return `${Math.floor(diff / 86400)} dage siden`;
}

function toneFromEventType(t?: string | null): FeedItem["tone"] {
  if (!t) return "info";
  const low = t.toLowerCase();
  if (low.includes("fejl") || low.includes("advars") || low.includes("warn")) return "warning";
  if (low.includes("succes") || low.includes("godkendt") || low.includes("publ")) return "success";
  return "info";
}

function moduleFromSource(source?: string | null): string {
  if (!source) return "Aktivitet";
  const s = source.toLowerCase();
  if (s.includes("connect") || s.includes("sensor") || s.includes("drone")) return "Smart Connect";
  if (s.includes("decision") || s.includes("recommend")) return "DecisionsIQ";
  if (s.includes("ledger") || s.includes("audit") || s.includes("csrd")) return "ESG Ledger";
  if (s.includes("report") || s.includes("rapport")) return "Rapporter";
  return source;
}

export function useLiveActivityFeed(): FeedItem[] {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["live-activity-feed", user?.id ?? ""],
    queryFn: () => fetchAllAuditEvents(20),
    enabled: !!user,
    staleTime: 30_000,
  });
  if (!data) return [];
  return data.map((e) => ({
    module: moduleFromSource(e.source ?? e.event_type),
    text: e.title,
    at: relativeTime(e.created_at),
    tone: toneFromEventType(e.event_type),
  }));
}

export function useLiveCriticalActions(): CriticalAction[] {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["live-critical-actions", user?.id ?? ""],
    queryFn: () => fetchAllOpenActions(),
    enabled: !!user,
    staleTime: 30_000,
  });
  if (!data) return [];
  return data.slice(0, 10).map((a) => ({
    module: moduleFromSource(a.title),
    title: a.title,
    priority: a.priority ?? "Lav",
    owner: a.owner ?? "—",
    deadline: a.due_date ? new Date(a.due_date).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "—",
    href: "/app/decisions",
  }));
}
