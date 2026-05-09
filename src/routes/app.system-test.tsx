import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader } from "@/components/ui-bits";
import { getLiveDataConfig } from "@/config/live-data-config";
import {
  dmiClient,
  miljoeportalClient,
  dataforsyningenClient,
  copernicusClient,
} from "@/services/live-data";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/app/system-test")({
  head: () => ({ meta: [{ title: "System Test — GoFreyra" }] }),
  component: SystemTestPage,
});

type ConnectorStatus = "live" | "preview" | "missing_key";

interface ConnectorRow {
  name: string;
  id: string;
  status: ConnectorStatus;
  requiresKey: boolean;
  keyPresent: boolean;
  keyEnvVar: string | null;
  previewFallback: boolean;
}

function ModeBadge({ mode }: { mode: "live" | "preview" }) {
  if (mode === "live") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
        Live
      </span>
    );
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
      Preview
    </span>
  );
}

function StatusBadge({ status }: { status: ConnectorStatus }) {
  if (status === "live") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
        Live
      </span>
    );
  }
  if (status === "preview") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
        Preview
      </span>
    );
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
      Nøgle mangler
    </span>
  );
}

function PresentBadge({ present }: { present: boolean }) {
  if (present) {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
        ✓ Tilstede
      </span>
    );
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
      ✗ Mangler
    </span>
  );
}

function SystemTestPage() {
  const config = getLiveDataConfig();
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);

  useEffect(() => {
    Promise.all([
      dmiClient.getStatus(),
      miljoeportalClient.getStatus(),
      dataforsyningenClient.getStatus(),
      copernicusClient.getStatus(),
    ]).then(([dmiStatus, miljoStatus, dataforStatus, copStatus]) => {
      setConnectors([
        {
          name: "DMI Vejrdata",
          id: "dmi-open-data",
          status: dmiStatus,
          requiresKey: false,
          keyPresent: true,
          keyEnvVar: null,
          previewFallback: true,
        },
        {
          name: "Miljøportal",
          id: "miljoeportal",
          status: miljoStatus,
          requiresKey: false,
          keyPresent: true,
          keyEnvVar: null,
          previewFallback: true,
        },
        {
          name: "Datafordeler",
          id: "datafordeler-dhm",
          status: dataforStatus,
          requiresKey: true,
          keyPresent: config.credentials.datafordeler.present,
          keyEnvVar: "VITE_DATAFORDELER_KEY",
          previewFallback: true,
        },
        {
          name: "Copernicus Sentinel-2",
          id: "copernicus-sentinel-2",
          status: copStatus,
          requiresKey: true,
          keyPresent: config.credentials.copernicus.present,
          keyEnvVar: "VITE_COPERNICUS_TOKEN",
          previewFallback: true,
        },
      ]);
    });
  }, [config.credentials.copernicus.present, config.credentials.datafordeler.present]);

  return (
    <>
      <AppTopbar title="System Test" subtitle="Diagnostik og konfigurationsstatus" />
      <main className="p-6 max-w-[960px] w-full mx-auto space-y-5">
        {/* ── Section 1: Live Data Readiness ──────────────────────────────── */}
        <Card>
          <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4 border-b">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-base font-semibold">Live Data Readiness</h2>
                <ModeBadge mode={config.mode} />
              </div>
              <p className="text-sm text-muted-foreground">
                Oversigt over connector-konfiguration og nøglestatus.
              </p>
            </div>
          </div>

          {config.mode === "preview" && (
            <div className="mx-5 mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Preview mode aktiv — live data er klar, men ikke slået til. Sæt{" "}
              <code className="font-mono text-xs">VITE_ENABLE_LIVE_DATA=true</code> i din{" "}
              <code className="font-mono text-xs">.env</code>-fil for at aktivere live-tilstand.
            </div>
          )}

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-y bg-muted/30">
                <tr>
                  <th className="px-5 py-2">Connector</th>
                  <th className="py-2">Kræver nøgle</th>
                  <th className="py-2">Nøglestatus</th>
                  <th className="py-2">Tilstand</th>
                  <th className="py-2 pr-5">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {connectors.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="py-3 text-muted-foreground">{c.requiresKey ? "Ja" : "Nej"}</td>
                    <td className="py-3">
                      {c.requiresKey ? (
                        <PresentBadge present={c.keyPresent} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3 pr-5">
                      {c.requiresKey && !c.keyPresent ? (
                        <span className="text-xs text-muted-foreground">
                          Tilføj <code className="font-mono">{c.keyEnvVar}</code>
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-600">Klar</span>
                      )}
                    </td>
                  </tr>
                ))}
                {connectors.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground text-sm">
                      Henter connector-status…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-5" />
        </Card>

        {/* ── Section 2: Environment variables ────────────────────────────── */}
        <Card>
          <CardHeader
            title="Miljøvariabler"
            subtitle="Tilstedeværelse af nøgler og konfiguration"
          />
          <div className="px-5 pb-5 space-y-2">
            {(
              [
                {
                  label: "VITE_ENABLE_LIVE_DATA",
                  value: config.isLiveDataEnabled ? "true" : "false",
                  present: config.isLiveDataEnabled,
                  chip: (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        config.isLiveDataEnabled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {config.isLiveDataEnabled ? "On" : "Off"}
                    </span>
                  ),
                },
                {
                  label: "VITE_DMI_BASE_URL",
                  present: true,
                  chip: (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                      ✓ Åben API
                    </span>
                  ),
                },
                {
                  label: "VITE_DATAFORDELER_KEY",
                  present: config.credentials.datafordeler.present,
                  chip: <PresentBadge present={config.credentials.datafordeler.present} />,
                },
                {
                  label: "VITE_COPERNICUS_TOKEN",
                  present: config.credentials.copernicus.present,
                  chip: <PresentBadge present={config.credentials.copernicus.present} />,
                },
                {
                  label: "VITE_SUPABASE_URL",
                  present: !!import.meta.env.VITE_SUPABASE_URL,
                  chip: <PresentBadge present={!!import.meta.env.VITE_SUPABASE_URL} />,
                },
              ] as { label: string; present: boolean; chip: React.ReactNode }[]
            ).map(({ label, chip }) => (
              <div
                key={label}
                className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
              >
                <code className="text-xs text-muted-foreground font-mono">{label}</code>
                {chip}
              </div>
            ))}
          </div>
        </Card>

        {/* ── Section 3: Connector status table ───────────────────────────── */}
        <Card>
          <CardHeader title="Connector Status" subtitle="Detaljeret status for hver datakilde" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-y bg-muted/30">
                <tr>
                  <th className="px-5 py-2">Connector</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Kræver nøgle</th>
                  <th className="py-2">Nøgle</th>
                  <th className="py-2 pr-5">Preview fallback</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {connectors.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3 text-muted-foreground">{c.requiresKey ? "Ja" : "Nej"}</td>
                    <td className="py-3">
                      {c.requiresKey ? (
                        <PresentBadge present={c.keyPresent} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-5">
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                        Ja
                      </span>
                    </td>
                  </tr>
                ))}
                {connectors.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground text-sm">
                      Henter connector-status…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-5" />
        </Card>

        {/* ── Section 4: Pages showing live data ──────────────────────────── */}
        <Card>
          <CardHeader
            title="Sider med live data"
            subtitle="Steder i platformen, hvor live dataintegrationer er synlige"
          />
          <ul className="px-5 pb-5 space-y-2">
            {(
              [
                {
                  to: "/app/connect/registry" as const,
                  label: "/app/connect/registry",
                  description: "Connector Registry tabel",
                },
                {
                  to: "/app/system-test" as const,
                  label: "/app/system-test",
                  description: "Denne side",
                },
              ] as {
                to: "/app/connect/registry" | "/app/system-test";
                label: string;
                description: string;
              }[]
            ).map(({ to, label, description }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex items-center justify-between p-3 rounded-xl border bg-background hover:bg-muted/40 transition group"
                >
                  <div>
                    <code className="text-xs font-mono text-primary">{label}</code>
                    <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
                  </div>
                  <span className="text-xs text-primary group-hover:underline">Åbn →</span>
                </Link>
              </li>
            ))}
            <li>
              <div className="flex items-center justify-between p-3 rounded-xl border bg-background">
                <div>
                  <code className="text-xs font-mono text-primary">
                    /app/projects/&#123;slug&#125;
                  </code>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Miljødata tab → Live Data kort
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">Vælg et projekt</span>
              </div>
            </li>
          </ul>
        </Card>
      </main>
    </>
  );
}
