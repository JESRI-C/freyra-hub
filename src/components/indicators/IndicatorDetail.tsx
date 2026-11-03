import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  getMeasurements,
  recordMeasurement,
  formatIndicatorValue,
  indicatorStatusColor,
  type Period,
} from "@/services/indicators-service";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Settings2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { IndicatorConfigDialog } from "./IndicatorConfigDialog";
import type { Indicator } from "@/lib/supabase/types";

export function IndicatorDetail({
  indicator,
  readOnly = false,
  open,
  onOpenChange,
}: {
  indicator: Indicator | null;
  readOnly?: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [period, setPeriod] = useState<Period>("90d");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const qc = useQueryClient();

  const {
    data: measurements = [],
    refetch,
    error: measurementsError,
  } = useQuery({
    queryKey: ["indicator-measurements", indicator?.id, period],
    queryFn: () => (indicator ? getMeasurements(indicator, period) : Promise.resolve([])),
    enabled: !!indicator && open,
  });

  if (!indicator) return null;

  const chartData = measurements.map((m) => ({
    t: new Date(m.measured_at).getTime(),
    label: new Date(m.measured_at).toLocaleDateString("da-DK", { day: "2-digit", month: "short" }),
    value: Number(m.value),
  }));
  const first = measurements[0];
  const last = measurements.at(-1);
  const comparable =
    first &&
    last &&
    first.measured_at !== last.measured_at &&
    !!first.source?.trim() &&
    first.source === last.source &&
    !!first.method?.trim() &&
    first.method === last.method &&
    !!first.unit?.trim() &&
    first.unit === last.unit;
  const change = comparable ? Number(last.value) - Number(first.value) : null;

  async function handleAdd() {
    if (!indicator) return;
    const v = Number(newValue);
    if (Number.isNaN(v)) {
      toast.error("Ugyldig værdi");
      return;
    }
    setSaving(true);
    try {
      await recordMeasurement({
        indicator,
        value: v,
        source: "manual",
        method: "manuel indtastning",
        confidence_score: 1,
      });
      toast.success("Måling registreret");
      setNewValue("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["project-workspace"] });
      qc.invalidateQueries({ queryKey: ["indicators"] });
      qc.invalidateQueries({ queryKey: ["project-workspace"] });
      qc.invalidateQueries({ queryKey: ["open-actions"] });
      qc.invalidateQueries({ queryKey: ["project-workspace"] });
      qc.invalidateQueries({ queryKey: ["audit-events"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme måling");
    } finally {
      setSaving(false);
    }
  }

  const TrendIcon =
    indicator.trend === "up" ? TrendingUp : indicator.trend === "down" ? TrendingDown : Minus;
  const trendColor =
    indicator.trend === "up"
      ? "text-emerald-600"
      : indicator.trend === "down"
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle>{indicator.label}</SheetTitle>
                <SheetDescription>
                  {indicator.category ?? "Indikator"}
                  {indicator.description ? ` · ${indicator.description}` : ""}
                </SheetDescription>
              </div>
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                  <Settings2 className="h-4 w-4 mr-1.5" /> Konfigurér
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Header stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Aktuel værdi</div>
                <div
                  className={`text-2xl font-bold tabular-nums ${indicatorStatusColor(indicator)}`}
                >
                  {formatIndicatorValue(indicator)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Trend</div>
                <div className={`text-2xl font-bold flex items-center gap-1 ${trendColor}`}>
                  <TrendIcon className="h-5 w-5" />
                  <span className="capitalize text-base font-medium">
                    {indicator.trend ?? "flad"}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Målinger</div>
                <div className="text-2xl font-bold tabular-nums">{measurements.length}</div>
              </div>
            </div>

            {/* Period switcher */}
            <div
              role="group"
              aria-label="Måleperiode"
              className="flex w-fit flex-wrap gap-1 rounded-lg border p-1"
            >
              {(["30d", "90d", "12m", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={period === p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs rounded-md ${
                    period === p
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p === "all" ? "Alle" : p}
                </button>
              ))}
            </div>

            {!measurementsError && first && last && (
              <section
                aria-label="Udvikling i perioden"
                className="space-y-1 rounded-lg border p-3 text-sm"
              >
                <h3 className="font-medium">Udvikling i perioden</h3>
                {change !== null && Number.isFinite(change) ? (
                  <>
                    <p>
                      Fra {first.value} til {last.value}
                      {last.unit ? ` ${last.unit}` : ""} · ændring{" "}
                      {new Intl.NumberFormat("da-DK", {
                        signDisplay: "exceptZero",
                        maximumFractionDigits: 6,
                      }).format(change)}
                      .
                    </p>
                    <p className="text-muted-foreground">
                      Ændringen gælder de registrerede værdier. Vurder indsatsens effekt ud fra det
                      faglige grundlag.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {measurements.length < 2
                      ? "Der skal være mindst to registreringer i perioden for at vise en ændring."
                      : "En sammenligning kræver forskellige måletidspunkter og samme dokumenterede kilde, metode og enhed."}
                  </p>
                )}
              </section>
            )}

            {/* Chart */}
            <div className="h-72 rounded-lg border p-3">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Ingen målinger i valgt periode
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--background))",
                      }}
                      formatter={(v: number) => [`${v}${indicator.unit ?? ""}`, indicator.label]}
                    />
                    {indicator.threshold_warning != null && (
                      <ReferenceLine
                        y={indicator.threshold_warning}
                        stroke="#f59e0b"
                        strokeDasharray="4 3"
                        label={{
                          value: "Advarsel",
                          fontSize: 10,
                          fill: "#f59e0b",
                          position: "right",
                        }}
                      />
                    )}
                    {indicator.threshold_critical != null && (
                      <ReferenceLine
                        y={indicator.threshold_critical}
                        stroke="#dc2626"
                        strokeDasharray="4 3"
                        label={{
                          value: "Kritisk",
                          fontSize: 10,
                          fill: "#dc2626",
                          position: "right",
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Add measurement */}
            {measurementsError && (
              <p role="alert">Målinger kunne ikke indlæses: {measurementsError.message}</p>
            )}
            {!readOnly && (
              <div className="rounded-lg border p-3 space-y-2">
                <Label className="text-sm">Registrér ny måling</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="any"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={`Værdi${indicator.unit ? ` (${indicator.unit})` : ""}`}
                    disabled={!isSupabaseConfigured}
                  />
                  <Button
                    onClick={handleAdd}
                    disabled={saving || !newValue || !isSupabaseConfigured}
                  >
                    {saving ? "Gemmer…" : "Tilføj"}
                  </Button>
                </div>
                {!isSupabaseConfigured && (
                  <p className="text-xs text-muted-foreground">Kræver tilkoblet database.</p>
                )}
              </div>
            )}

            {/* Recent measurements table */}
            {measurements.length > 0 && (
              <div className="rounded-lg border">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                  Seneste målinger
                </div>
                <div className="divide-y max-h-56 overflow-y-auto">
                  {[...measurements]
                    .reverse()
                    .slice(0, 20)
                    .map((m) => (
                      <div key={m.id} className="space-y-1 break-words px-3 py-2 text-sm">
                        <span className="mr-2 text-muted-foreground">
                          {new Date(m.measured_at).toLocaleString("da-DK")}
                        </span>
                        <span className="font-medium tabular-nums">
                          {m.value}
                          {m.unit ? ` ${m.unit}` : ""}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Kilde: {m.source?.trim() || "Ukendt"} · Metode:{" "}
                          {m.method?.trim() || "Ukendt"}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <IndicatorConfigDialog
        indicator={indicator}
        open={configOpen}
        onOpenChange={setConfigOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["project-workspace"] });
          qc.invalidateQueries({ queryKey: ["indicators"] });
          qc.invalidateQueries({ queryKey: ["project-workspace"] });
          qc.invalidateQueries({ queryKey: ["indicator-measurements"] });
        }}
      />
    </>
  );
}
