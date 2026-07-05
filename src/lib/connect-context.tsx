// Cross-tab context for the Monitoring & Field Data module.
// - Selected project (falls back to useAuth().currentProject)
// - Selected date range (24h, 7d, 30d, 90d, 12m, all, custom)
// Both are synced to URL search params so links are shareable and the
// selection survives navigation between tabs.

import { useMemo, useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export type ConnectRangeKey = "24h" | "7d" | "30d" | "90d" | "12m" | "all" | "custom";

export interface ConnectRange {
  key: ConnectRangeKey;
  from: Date | null; // null when "all"
  to: Date;
  label: string;
}

export const RANGE_OPTIONS: { key: ConnectRangeKey; label: string }[] = [
  { key: "24h", label: "Seneste 24 timer" },
  { key: "7d", label: "Seneste 7 dage" },
  { key: "30d", label: "Seneste 30 dage" },
  { key: "90d", label: "Seneste 90 dage" },
  { key: "12m", label: "Seneste 12 måneder" },
  { key: "all", label: "Hele projektperioden" },
];

function computeRange(key: ConnectRangeKey, customFrom?: string, customTo?: string): ConnectRange {
  const now = new Date();
  const label = RANGE_OPTIONS.find((o) => o.key === key)?.label ?? "Brugerdefineret";

  if (key === "custom" && customFrom && customTo) {
    return {
      key,
      from: new Date(customFrom),
      to: new Date(customTo),
      label: `${customFrom} – ${customTo}`,
    };
  }
  if (key === "all") {
    return { key, from: null, to: now, label };
  }

  const from = new Date(now);
  switch (key) {
    case "24h":
      from.setHours(from.getHours() - 24);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "12m":
      from.setMonth(from.getMonth() - 12);
      break;
    case "30d":
    default:
      from.setDate(from.getDate() - 30);
      break;
  }
  return { key, from, to: now, label };
}

export function useConnectContext() {
  const navigate = useNavigate();
  const searchRaw = useRouterState({ select: (s) => s.location.search });
  const search = searchRaw as unknown as Record<string, unknown>;
  const auth = useAuth();

  const projectId =
    (typeof search.project === "string" && search.project) || auth.currentProject?.id || null;

  const rangeKey: ConnectRangeKey =
    (typeof search.range === "string" && (search.range as ConnectRangeKey)) || "30d";
  const customFrom = typeof search.from === "string" ? search.from : undefined;
  const customTo = typeof search.to === "string" ? search.to : undefined;

  const range = useMemo(
    () => computeRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );

  const projects = useMemo(() => auth.currentOrg?.projects ?? [], [auth.currentOrg]);
  const project = projects.find((p) => p.id === projectId) ?? projects[0] ?? null;

  const setProject = useCallback(
    (id: string) => {
      auth.selectProject(id);
      void navigate({ to: ".", search: (prev) => ({ ...prev, project: id }) as never });
    },
    [auth, navigate],
  );

  const setRange = useCallback(
    (key: ConnectRangeKey, custom?: { from: string; to: string }) => {
      void navigate({
        to: ".",
        search: (prev) => {
          const next = { ...prev, range: key } as Record<string, unknown>;
          if (key === "custom" && custom) {
            next.from = custom.from;
            next.to = custom.to;
          } else {
            delete next.from;
            delete next.to;
          }
          return next as never;
        },
      });
    },
    [navigate],
  );

  return { project, projectId, projects, range, setProject, setRange };
}
