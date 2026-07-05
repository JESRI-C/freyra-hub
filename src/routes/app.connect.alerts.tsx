import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Clock,
  Sparkles,
  Send,
  ExternalLink,
  Plus,
} from "lucide-react";
import { Card, PageHeader, Bars } from "@/components/ui-bits";
import {
  ConnectionHealthCard,
  SeverityBadge,
  Drawer,
  Section,
  Chip,
} from "@/components/connect/Primitives";
import { ALERTS } from "@/lib/connect-data";
import { RuleDrawer } from "@/components/monitoring/RuleDrawer";
import { useConnectContext } from "@/lib/connect-context";
import { listAlertRules, toggleAlertRule } from "@/services/monitoring/alert-rules-service";

export const Route = createFileRoute("/app/connect/alerts")({
  component: Page,
});

function Page() {
  const { projectId } = useConnectContext();
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<(typeof ALERTS)[0] | null>(null);
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const filtered = filter === "all" ? ALERTS : ALERTS.filter((a) => a.severity === filter);

  const rulesQuery = useQuery({
    queryKey: ["alert-rules", projectId],
    queryFn: () => listAlertRules(projectId),
  });

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Alerts"
          description="Aktive alerts, hændelser og data-operations issues."
        />
        <button
          onClick={() => setRuleDrawerOpen(true)}
          className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5 shrink-0 mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Ny alarmregel
        </button>
      </div>

      <Section
        title="Aktive alarmregler"
        subtitle={rulesQuery.isLoading ? "Henter…" : `${rulesQuery.data?.length ?? 0} regler i backend`}
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-4 py-3">Navn</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Aktiv</th>
                  <th className="px-4 py-3">Oprettet</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(rulesQuery.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-xs"><Chip>{r.trigger_type}</Chip></td>
                    <td className="px-4 py-3 text-xs"><SeverityBadge severity={r.severity} /></td>
                    <td className="px-4 py-3 text-xs">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={r.is_active}
                          onChange={(e) => { void toggleAlertRule(r.id, e.target.checked).then(() => rulesQuery.refetch()); }}
                        />
                        {r.is_active ? "Aktiv" : "Inaktiv"}
                      </label>
                    </td>
                    <td className="px-4 py-3 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {!rulesQuery.isLoading && (rulesQuery.data ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">Ingen regler endnu — tryk "Ny alarmregel".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <RuleDrawer
        open={ruleDrawerOpen}
        onClose={() => setRuleDrawerOpen(false)}
        variant="alert"
        projectId={projectId}
        onCreated={() => rulesQuery.refetch()}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ConnectionHealthCard
          label="Aktive alerts"
          value="17"
          icon={<Bell className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Kritiske"
          value="3"
          tone="danger"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Medium"
          value="6"
          tone="warning"
          icon={<AlertCircle className="h-5 w-5" />}
        />
        <ConnectionHealthCard label="Lav" value="8" icon={<Info className="h-5 w-5" />} />
        <ConnectionHealthCard
          label="Løst denne uge"
          value="12"
          tone="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <ConnectionHealthCard label="Ø svartid" value="2 t" icon={<Clock className="h-5 w-5" />} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Severity:</span>
          {[
            ["all", "Alle"],
            ["critical", "Kritisk"],
            ["medium", "Medium"],
            ["low", "Lav"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`text-xs px-3 py-1.5 rounded-lg border ${filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Alert</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Kilde</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Først</th>
                <th className="px-4 py-3">Sidst</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-muted/40 cursor-pointer"
                  onClick={() => setSelected(a)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-[11px] text-muted-foreground">{a.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={a.severity} />
                  </td>
                  <td className="px-4 py-3 text-xs">{a.project}</td>
                  <td className="px-4 py-3 text-xs">{a.source}</td>
                  <td className="px-4 py-3 text-xs">
                    <Chip>{a.type}</Chip>
                  </td>
                  <td className="px-4 py-3 text-xs">{a.first}</td>
                  <td className="px-4 py-3 text-xs">{a.last}</td>
                  <td className="px-4 py-3 text-xs">
                    <Chip tone={a.status === "Åben" ? "muted" : "primary"}>{a.status}</Chip>
                  </td>
                  <td className="px-4 py-3 text-xs">{a.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Alerts over tid" subtitle="Sidste 7 dage by severity">
          <Bars
            data={[
              { label: "Man", value: 4 },
              { label: "Tir", value: 6 },
              { label: "Ons", value: 3 },
              { label: "Tor", value: 8 },
              { label: "Fre", value: 5 },
              { label: "Lør", value: 2 },
              { label: "Søn", value: 7 },
            ]}
          />
        </Section>

        <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Operationelle anbefalinger</div>
              <ul className="text-sm mt-2 space-y-1.5 text-foreground/90 list-disc pl-5">
                <li>
                  Indfør automatisk batteri-alert ved 25% for kameratraps for at reducere "Low
                  battery" alerts.
                </li>
                <li>
                  Aktivér token rotation på Airtable for at undgå tilbagevendende "Expiring token".
                </li>
                <li>
                  Tilføj duplikat-detektion på Scope 3 CSV-import for at undgå manuelle re-uploads.
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected?.id}
        footer={
          <>
            <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5">
              Marker som løst
            </button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5">Opret opgave</button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" /> Send til DecisionsIQ
            </button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Se datakilde
            </button>
          </>
        }
      >
        {selected && (
          <>
            <p className="text-sm">{selected.title}</p>
            <Section title="Hvorfor det er vigtigt">
              <p className="text-sm text-muted-foreground">
                {selected.severity === "critical"
                  ? "Påvirker direkte rapporteringsklarhed og kan blokere ESG Ledger entries."
                  : "Reducerer datakvalitet og kan udløse falske anbefalinger i DecisionsIQ."}
              </p>
            </Section>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KV label="Severity" v={<SeverityBadge severity={selected.severity} />} />
              <KV label="Type" v={selected.type} />
              <KV label="Først detekteret" v={selected.first} />
              <KV label="Sidst detekteret" v={selected.last} />
              <KV label="Projekt" v={selected.project} />
              <KV label="Kilde" v={selected.source} />
            </div>
            <Section title="Anbefalet handling">
              <p className="text-sm">{selected.action}</p>
            </Section>
            <Section title="Tidslinje">
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>{selected.first} — Alert udløst</li>
                <li>{selected.last} — Sidste forekomst</li>
                <li>Owner notificeret · {selected.owner}</li>
              </ul>
            </Section>
          </>
        )}
      </Drawer>
    </main>
  );
}

function KV({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{v}</div>
    </div>
  );
}
