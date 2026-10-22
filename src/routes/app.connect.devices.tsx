import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Wifi, BatteryLow, WifiOff, Plus, Info } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import {
  ConnectionHealthCard,
  DeviceStatusBadge,
  SignalStrengthIndicator,
  BatteryIndicator,
  Section,
  Chip,
} from "@/components/connect/Primitives";
import { DeviceWizard } from "@/components/monitoring/DeviceWizard";
import { useConnectContext } from "@/lib/connect-context";
import {
  listDevices,
  computeDeviceKpis,
  deriveDeviceStatus,
  type MonitoringDevice,
  type DeviceStatus,
} from "@/services/monitoring/devices-service";

const devicesQuery = (projectId: string | null) => ({
  queryKey: ["monitoring-devices", projectId] as const,
  queryFn: () => (projectId ? listDevices(projectId) : Promise.resolve<MonitoringDevice[]>([])),
});

export const Route = createFileRoute("/app/connect/devices")({
  component: Page,
});

function statusFilterMatches(d: MonitoringDevice, f: string): boolean {
  if (f === "all") return true;
  return deriveDeviceStatus(d) === f;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Aldrig";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "lige nu";
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} t siden`;
  return `${Math.floor(hrs / 24)} d siden`;
}

function Page() {
  const { projectId } = useConnectContext();
  const qc = useQueryClient();
  const { data: devices } = useSuspenseQuery(devicesQuery(projectId));
  const [filter, setFilter] = useState<string>("all");
  const [wizardOpen, setWizardOpen] = useState(false);

  const kpis = computeDeviceKpis(devices);
  const filtered = devices.filter((d) => statusFilterMatches(d, filter));

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader
        title="Enheder"
        description="Sensorer, gateways, kameraer, vejrstationer og akustiske monitorer."
        actions={
          projectId && (
            <button
              onClick={() => setWizardOpen(true)}
              className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Ny enhed
            </button>
          )
        }
      />

      {!projectId && (
        <Card className="p-4 flex items-start gap-3 border-warning/40 bg-warning/5">
          <Info className="h-4 w-4 text-warning mt-0.5" />
          <div className="text-sm">
            Vælg et projekt i topbaren for at se og oprette enheder.
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ConnectionHealthCard label="Enheder" value={String(kpis.total)} icon={<Cpu className="h-5 w-5" />} />
        <ConnectionHealthCard label="Online" value={String(kpis.online)} tone="success" icon={<Wifi className="h-5 w-5" />} />
        <ConnectionHealthCard label="Kræver opmærksomhed" value={String(kpis.attention)} tone="warning" icon={<BatteryLow className="h-5 w-5" />} />
        <ConnectionHealthCard label="Offline" value={String(kpis.offline)} tone="danger" icon={<WifiOff className="h-5 w-5" />} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Filter:</span>
          {(
            [
              ["all", "Alle"],
              ["online", "Online"],
              ["partial", "Delvist"],
              ["attention", "Kræver handling"],
              ["offline", "Offline"],
              ["not_activated", "Ikke aktiveret"],
            ] as [string, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Card>

      {devices.length === 0 ? (
        <Card className="p-10 text-center">
          <Cpu className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium mb-1">Ingen enheder endnu</div>
          <p className="text-sm text-muted-foreground mb-4">
            Registrer den første sensor, gateway eller vejrstation for at begynde at samle data.
          </p>
          {projectId && (
            <button
              onClick={() => setWizardOpen(true)}
              className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Opret enhed
            </button>
          )}
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-4 py-3">Enhed</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Batteri</th>
                  <th className="px-4 py-3">Signal</th>
                  <th className="px-4 py-3">Sidste kontakt</th>
                  <th className="px-4 py-3">Firmware</th>
                  <th className="px-4 py-3">Interval</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((d) => {
                  const status: DeviceStatus = deriveDeviceStatus(d);
                  return (
                    <tr key={d.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.manufacturer ?? "—"} {d.model ?? ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">{d.device_type}</td>
                      <td className="px-4 py-3">
                        <DeviceStatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3">
                        <BatteryIndicator level={d.battery_level ?? 0} />
                      </td>
                      <td className="px-4 py-3">
                        <SignalStrengthIndicator level={d.signal_strength ?? 0} />
                      </td>
                      <td className="px-4 py-3 text-xs">{formatWhen(d.last_seen_at)}</td>
                      <td className="px-4 py-3 text-xs">
                        <Chip>{d.firmware_version ?? "—"}</Chip>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {d.expected_interval_minutes ? `${d.expected_interval_minutes} min` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Section title="Om denne visning" subtitle="Fase B — første version af enhedsregistret">
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Enheder oprettes nu direkte i databasen med RLS efter projektmedlemsskab.</p>
          <p>Status beregnes ud fra <code>last_seen_at</code> og <code>expected_interval_minutes</code>. Målehistorik, batterikurve og vedligeholdelseslog kommer i næste iteration.</p>
        </div>
      </Section>

      {projectId && (
        <DeviceWizard
          open={wizardOpen}
          projectId={projectId}
          onClose={() => setWizardOpen(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["monitoring-devices", projectId] })}
        />
      )}
    </main>
  );
}
