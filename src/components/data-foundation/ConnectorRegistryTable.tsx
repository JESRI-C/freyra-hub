import React from "react";
import { ExternalLink, Key, Globe } from "lucide-react";
import type { DataConnector, ConnectorCategory, ConnectorStatus } from "@/lib/supabase/types";
import { getLiveDataConfig } from "@/config/live-data-config";

// ─── Category helpers ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  satellite: "Satellit",
  nature: "Natur",
  water: "Vand",
  terrain: "Terræn",
  weather: "Vejr",
  authority: "Myndighed",
  soil: "Jordbund",
  eu_reference: "EU-reference",
};

const CATEGORY_COLORS: Record<ConnectorCategory, string> = {
  satellite: "bg-violet-100 text-violet-700",
  nature: "bg-emerald-100 text-emerald-700",
  water: "bg-blue-100 text-blue-700",
  terrain: "bg-amber-100 text-amber-700",
  weather: "bg-sky-100 text-sky-700",
  authority: "bg-slate-100 text-slate-700",
  soil: "bg-orange-100 text-orange-700",
  eu_reference: "bg-indigo-100 text-indigo-700",
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ConnectorStatus, string> = {
  active: "Aktiv",
  connector_ready: "Klar",
  configuration_required: "Konfiguration påkrævet",
  preview_data: "Preview",
  coming_soon: "Kommer snart",
};

const STATUS_COLORS: Record<ConnectorStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  connector_ready: "bg-blue-100 text-blue-700",
  configuration_required: "bg-orange-100 text-orange-700",
  preview_data: "bg-violet-100 text-violet-700",
  coming_soon: "bg-muted text-muted-foreground",
};

// ─── Live mode badge ──────────────────────────────────────────────────────────

function liveModeBadge(connectorId: string): React.ReactNode {
  const config = getLiveDataConfig();
  const isLiveEnabled = config.isLiveDataEnabled;

  const keyRequiredIds = [
    "copernicus-sentinel-2",
    "datafordeler-matrikel",
    "datafordeler-dhm",
    "dmi-opendata",
    "dmi-open-data",
  ];
  const requiresKey = keyRequiredIds.includes(connectorId);

  let keyPresent = true;
  if (connectorId === "copernicus-sentinel-2") {
    keyPresent = config.credentials.copernicus.present;
  } else if (connectorId === "datafordeler-matrikel" || connectorId === "datafordeler-dhm") {
    keyPresent = config.credentials.datafordeler.present;
  } else if (connectorId === "dmi-opendata" || connectorId === "dmi-open-data") {
    keyPresent = config.credentials.dmi.present;
  }

  if (requiresKey && !keyPresent) {
    return (
      <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
        Nøgle mangler
      </span>
    );
  }
  if (!isLiveEnabled) {
    return (
      <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">
        Preview
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      Live
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ConnectorRegistryTableProps {
  connectors: DataConnector[];
}

export function ConnectorRegistryTable({ connectors }: ConnectorRegistryTableProps) {
  if (connectors.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        Ingen connectorer fundet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
              <th className="px-4 py-3 font-medium">Connector</th>
              <th className="px-4 py-3 font-medium">Udbyder</th>
              <th className="px-4 py-3 font-medium">Kategori</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">API-nøgle</th>
              <th className="px-4 py-3 font-medium">Opdatering</th>
              <th className="px-4 py-3 font-medium">Dækning</th>
              <th className="px-4 py-3 font-medium">Live mode</th>
              <th className="px-4 py-3 font-medium">Dokumentation</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {connectors.map((c) => (
              <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium leading-tight">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 max-w-xs leading-snug">
                    {c.description.length > 90 ? c.description.slice(0, 90) + "…" : c.description}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {c.provider}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[c.category]}`}
                  >
                    {CATEGORY_LABELS[c.category]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[c.status]}`}
                  >
                    {STATUS_LABELS[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.requires_api_key ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                        <Key className="h-2.5 w-2.5" /> Påkrævet
                      </span>
                      {c.env_key_name && (
                        <code className="text-[10px] text-muted-foreground">{c.env_key_name}</code>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Åben
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {c.update_frequency}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    {c.coverage}
                  </span>
                </td>
                <td className="px-4 py-3">{liveModeBadge(c.id)}</td>
                <td className="px-4 py-3">
                  {c.docs_url ? (
                    <a
                      href={c.docs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
