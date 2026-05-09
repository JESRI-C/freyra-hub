import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { DataQualityBar, ConfidenceScore } from "@/components/decisions/Primitives";
import { DataSourceStatus } from "@/components/decisions/DataSourceStatus";
import { DATA_SOURCES, DATA_GAPS } from "@/lib/decisions-data";
import { AlertTriangle, Sparkles, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/decisions/data-quality")({
  head: () => ({ meta: [{ title: "Datakvalitet — DecisionsIQ" }] }),
  component: Page,
});

function Page() {
  const score = 79;
  const breakdown = [
    { label: "Dækning", value: 74 },
    { label: "Friskhed", value: 86 },
    { label: "Verifikation", value: 82 },
    { label: "Komplethed", value: 71 },
    { label: "Konsistens", value: 84 },
  ];

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="Datakvalitet"
        description="Hvor pålidelig er dit data — og hvor stærkt er beslutningsgrundlaget?"
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="p-6 text-center">
          <div className="text-sm font-medium text-muted-foreground">Samlet kvalitetsscore</div>
          <div className="text-5xl font-semibold mt-3 tabular-nums">{score}</div>
          <div className="text-xs text-muted-foreground">af 100</div>
          <div className="mt-3">
            <Pill tone={score >= 80 ? "success" : "warning"}>
              {score >= 80 ? "Stærk" : "Acceptabel"}
            </Pill>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-5">
          <div className="text-sm font-medium mb-4">Komponenter</div>
          <div className="grid sm:grid-cols-2 gap-4">
            {breakdown.map((b) => (
              <DataQualityBar key={b.label} label={b.label} value={b.value} />
            ))}
          </div>
        </Card>
      </div>

      {/* Sources */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Datakilder
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {DATA_SOURCES.map((s) => (
            <DataSourceStatus key={s.name} source={s} />
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Datahuller" subtitle="Vigtige manglende inputs" />
          <ul className="px-5 pb-5 space-y-2.5">
            {DATA_GAPS.map((g) => (
              <li key={g} className="flex items-start gap-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5 shrink-0" />
                {g}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-leaf/15 text-primary grid place-items-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium">AI-konfidens i analysen</div>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Med nuværende dækning og friskhed vurderes konfidensen til{" "}
                <ConfidenceScore value={0.82} />. De største bidragsydere til usikkerhed er
                felt-dækning i område B og forsinket Sentinel-2-synk. Lukkes disse to gaps, kan
                konfidensen stige til ca. 0,91.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Forbedringsplan" subtitle="Konkrete skridt til at hæve datakvaliteten" />
        <ul className="divide-y">
          {[
            "Aktivér Sentinel-2 i Smart Connect og definér AOI",
            "Udrul felt-app til 6 medarbejdere + træning",
            "Validér og opdatér emissionsfaktor-bibliotek (DEFRA 2026)",
            "Tilkobl IoT-gateway for sensor-batch i nordzone",
            "Tilføj tredjepartsverifikation for biodiversitetsdata",
          ].map((s, i) => (
            <li key={i} className="px-5 py-3 flex items-center gap-3 text-sm">
              <span className="h-6 w-6 rounded-full bg-leaf/20 text-primary grid place-items-center text-xs font-semibold">
                {i + 1}
              </span>
              <span className="flex-1">{s}</span>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
