import { useMemo } from "react";

export function ScenarioComparison({
  scenarios, selectedIds,
}: {
  scenarios: { id: string; name: string; metrics: Record<string, number> }[];
  selectedIds: string[];
}) {
  const labels: { key: string; label: string; max: number; invert?: boolean }[] = [
    { key: "esg", label: "ESG-score", max: 100 },
    { key: "co2", label: "CO₂e (t)", max: 1500, invert: true },
    { key: "bio", label: "Biodiversitetsindeks", max: 1 },
    { key: "water", label: "Vandkvalitet", max: 100 },
    { key: "data", label: "Datadækning", max: 100 },
    { key: "risk", label: "Risikoniveau", max: 100, invert: true },
  ];
  const visible = useMemo(() => scenarios.filter((s) => selectedIds.includes(s.id)), [scenarios, selectedIds]);
  const palette = ["var(--primary)", "var(--leaf)", "var(--warning)", "var(--destructive)", "var(--muted-foreground)"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        {visible.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />
            {s.name}
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {labels.map((l) => (
          <div key={l.key}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">{l.label}</span>
              <span className="text-muted-foreground">{l.invert ? "lavere = bedre" : "højere = bedre"}</span>
            </div>
            <div className="space-y-1.5">
              {visible.map((s, i) => {
                const v = s.metrics[l.key];
                const pct = Math.min((v / l.max) * 100, 100);
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="text-xs w-44 truncate text-muted-foreground">{s.name}</div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: palette[i % palette.length] }} />
                    </div>
                    <div className="text-xs w-16 text-right tabular-nums font-medium">
                      {l.key === "bio" ? v.toFixed(2) : v}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
