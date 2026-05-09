import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader } from "@/components/ui-bits";
import { getLiveDataConfig } from "@/config/live-data-config";
import { generateProjectSensors } from "@/services/iot-simulation-service";
import {
  dmiClient,
  miljoeportalClient,
  dataforsyningenClient,
  copernicusClient,
} from "@/services/live-data";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

type UntypedSupabase = ReturnType<typeof createClient>;
const untypedSupabase = supabase as unknown as UntypedSupabase | null;

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

type SupabaseCheckStatus = "ok" | "fejl" | "ikke-konfigureret" | "afventer";

interface SupabaseMediaCheck {
  label: string;
  status: SupabaseCheckStatus;
  detail?: string;
}

function SupabaseStatusBadge({ status }: { status: SupabaseCheckStatus }) {
  if (status === "ok") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
        OK
      </span>
    );
  }
  if (status === "fejl") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
        Fejl
      </span>
    );
  }
  if (status === "ikke-konfigureret") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
        Ikke konfigureret
      </span>
    );
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
      Afventer…
    </span>
  );
}

function SystemTestPage() {
  const config = getLiveDataConfig();
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [supabaseMediaChecks, setSupabaseMediaChecks] = useState<SupabaseMediaCheck[]>([
    { label: "project_media tabel", status: "afventer" },
    { label: "project-media bucket", status: "afventer" },
  ]);

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

  useEffect(() => {
    if (!isSupabaseConfigured || supabase === null) {
      setSupabaseMediaChecks([
        { label: "project_media tabel", status: "ikke-konfigureret" },
        { label: "project-media bucket", status: "ikke-konfigureret" },
      ]);
      return;
    }

    // Check project_media table
    untypedSupabase!
      .from("project_media")
      .select("id")
      .limit(1)
      .then(({ error }: { error: { message: string } | null }) => {
        setSupabaseMediaChecks((prev) =>
          prev.map((c) =>
            c.label === "project_media tabel"
              ? {
                  ...c,
                  status: error ? "fejl" : "ok",
                  detail: error ? error.message : undefined,
                }
              : c,
          ),
        );
      });

    // Check project-media storage bucket
    supabase.storage
      .from("project-media")
      .list("", { limit: 1 })
      .then(({ error }) => {
        setSupabaseMediaChecks((prev) =>
          prev.map((c) =>
            c.label === "project-media bucket"
              ? {
                  ...c,
                  status: error ? "fejl" : "ok",
                  detail: error ? error.message : undefined,
                }
              : c,
          ),
        );
      });
  }, []);

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

        {/* ── Section 4: Supabase Medier ──────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Supabase Medier"
            subtitle="Status for project_media tabel og project-media storage bucket"
            action={
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  isSupabaseConfigured
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isSupabaseConfigured ? "Supabase konfigureret" : "Supabase ikke konfigureret"}
              </span>
            }
          />
          <div className="px-5 pb-5 space-y-2">
            {supabaseMediaChecks.map((check) => (
              <div
                key={check.label}
                className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <span className="text-sm font-medium">{check.label}</span>
                  {check.detail && (
                    <p className="text-[11px] text-red-600 mt-0.5 font-mono">{check.detail}</p>
                  )}
                </div>
                <SupabaseStatusBadge status={check.status} />
              </div>
            ))}
          </div>
        </Card>

        {/* ── Section 5: IoT Simulation ────────────────────────────────── */}
        {(() => {
          const exampleSensors = generateProjectSensors(
            "system-test-project",
            { lat: 55.676, lng: 12.568 },
            6,
          );
          const online = exampleSensors.filter((s) => s.status === "online").length;
          const warning = exampleSensors.filter((s) => s.status === "warning").length;
          const offline = exampleSensors.filter((s) => s.status === "offline").length;
          return (
            <Card>
              <CardHeader
                title="IoT Simulation"
                subtitle="Deterministisk feltdata-simulation — genereres fra projekt-ID + centroid"
                action={
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                    Simuleret
                  </span>
                }
              />
              <div className="px-5 pb-5 space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-emerald-700 font-medium">{online} online</span>
                  </span>
                  {warning > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                      <span className="text-amber-700 font-medium">{warning} advarsel</span>
                    </span>
                  )}
                  {offline > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
                      <span className="text-red-700 font-medium">{offline} offline</span>
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground border-y bg-muted/30">
                      <tr>
                        <th className="px-3 py-2">Sensor</th>
                        <th className="py-2">Type</th>
                        <th className="py-2">Værdi</th>
                        <th className="py-2">Batteri</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {exampleSensors.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium text-xs">{s.label}</td>
                          <td className="py-2 text-xs text-muted-foreground">{s.type}</td>
                          <td className="py-2 tabular-nums text-xs">
                            {s.latestValue} {s.unit}
                          </td>
                          <td className="py-2 text-xs">{s.batteryPercent}%</td>
                          <td className="py-2 pr-3">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                s.status === "online"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : s.status === "warning"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Samme projekt-ID giver altid samme sensor-layout. Aktivér Livekort-fanen på et
                  projekt for at se sensorerne på kortet.
                </p>
              </div>
            </Card>
          );
        })()}

        {/* ── Section 6: Sider med live data ──────────────────────────────── */}
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
