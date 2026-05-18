import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { RiskBadge } from "@/components/decisions/Primitives";
import { RiskMatrix } from "@/components/decisions/RiskMatrix";
import {
  RISK_CATEGORIES,
  RISK_MATRIX_POINTS,
  RISK_TIMELINE,
  MITIGATIONS,
} from "@/lib/decisions-data";
import { ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/decisions/risk")({
  head: () => ({ meta: [{ title: "Risikoanalyse — DecisionsIQ" }] }),
  component: Page,
});

function Page() {
  const overall = 58;
  const level =
    overall >= 75 ? "Kritisk" : overall >= 60 ? "Høj" : overall >= 40 ? "Medium" : "Lav";
  const c = 2 * Math.PI * 56;

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="Risikoanalyse"
        description="Samlet risikobillede på tværs af klima, natur, data og compliance."
      />

      {/* Overall risk */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="p-6 flex flex-col items-center text-center">
          <div className="text-sm font-medium text-muted-foreground">Samlet risikoscore</div>
          <div className="relative mt-4">
            <svg width="160" height="160" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="56" fill="none" stroke="var(--muted)" strokeWidth="14" />
              <circle
                cx="70"
                cy="70"
                r="56"
                fill="none"
                stroke={
                  overall >= 60
                    ? "var(--destructive)"
                    : overall >= 40
                      ? "var(--warning)"
                      : "var(--success)"
                }
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${(overall / 100) * c} ${c}`}
                transform="rotate(-90 70 70)"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div>
                <div className="text-3xl font-semibold tabular-nums">{overall}</div>
                <div className="text-xs text-muted-foreground">af 100</div>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <RiskBadge level={level as never} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            Risikoniveauet er <strong>medium</strong>. Datakvalitet og vandkvalitet er drivere;
            biodiversitet og compliance udvikler sig positivt. AI'en anbefaler fokus på de tre
            højest scorende risici.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Risikomatrix"
            subtitle="Sandsynlighed vs. konsekvens — hover for navn"
          />
          <div className="px-8 py-4 pb-10">
            <RiskMatrix points={RISK_MATRIX_POINTS} />
          </div>
        </Card>
      </div>

      {/* Categories */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Risikokategorier
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {RISK_CATEGORIES.map((r) => {
            const down = r.trend.startsWith("−") || r.trend.startsWith("-");
            return (
              <Card key={r.name} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 rounded-xl bg-destructive/10 text-destructive grid place-items-center">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <RiskBadge level={r.level} />
                </div>
                <div className="mt-3 font-medium text-sm">{r.name}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="text-2xl font-semibold tabular-nums">{r.score}</div>
                  <div
                    className={`text-xs inline-flex items-center gap-0.5 ${down ? "text-success" : "text-destructive"}`}
                  >
                    {down ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : (
                      <TrendingUp className="h-3 w-3" />
                    )}
                    {r.trend}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  {r.explanation}
                </p>
                <div className="mt-3 text-xs rounded-lg bg-leaf/10 text-primary px-3 py-2">
                  {r.action}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Risiko-tidslinje" subtitle="Seneste hændelser og anomalier" />
          <ul className="divide-y">
            {RISK_TIMELINE.map((e, i) => (
              <li key={i} className="px-5 py-3 flex items-center gap-3">
                <div className="text-xs text-muted-foreground w-16">{e.date}</div>
                <div className="flex-1 text-sm">{e.event}</div>
                <RiskBadge level={e.level} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Mitigation-plan"
            subtitle="Anbefalede handlinger med forventet effekt"
          />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr>
                <th className="px-5 py-2">Handling</th>
                <th className="py-2">Ejer</th>
                <th className="py-2">Deadline</th>
                <th className="py-2">Effekt</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {MITIGATIONS.map((m, i) => (
                <tr key={i}>
                  <td className="px-5 py-3">{m.action}</td>
                  <td className="text-muted-foreground">{m.owner}</td>
                  <td className="text-muted-foreground">{m.deadline}</td>
                  <td className="text-success">{m.effect}</td>
                  <td>
                    <Pill
                      tone={
                        m.status === "Igangsat"
                          ? "info"
                          : m.status === "Planlagt"
                            ? "warning"
                            : "default"
                      }
                    >
                      {m.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </main>
  );
}
