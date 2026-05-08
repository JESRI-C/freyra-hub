import type { RiskLevel } from "@/lib/decisions-data";

export function RiskMatrix({ points }: { points: { name: string; probability: number; impact: number; level: RiskLevel }[] }) {
  const colors: Record<RiskLevel, string> = {
    Lav: "var(--success)",
    Medium: "var(--warning)",
    Høj: "var(--destructive)",
    Kritisk: "var(--destructive)",
  };
  return (
    <div className="relative aspect-[4/3] w-full">
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 rounded-xl overflow-hidden">
        {[
          "bg-success/10","bg-success/15","bg-warning/15",
          "bg-success/15","bg-warning/15","bg-destructive/15",
          "bg-warning/15","bg-destructive/15","bg-destructive/25",
        ].map((c, i) => <div key={i} className={c} />)}
      </div>
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="border border-border/40" />
        ))}
      </div>
      {points.map((p) => (
        <div
          key={p.name}
          className="absolute -translate-x-1/2 -translate-y-1/2 group"
          style={{ left: `${p.probability * 100}%`, top: `${(1 - p.impact) * 100}%` }}
        >
          <div className="h-3 w-3 rounded-full ring-2 ring-card shadow" style={{ background: colors[p.level] }} />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs bg-card border rounded px-1.5 py-0.5 shadow opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {p.name}
          </div>
        </div>
      ))}
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">Sandsynlighed →</div>
      <div className="absolute -left-2 top-1/2 -translate-x-full -translate-y-1/2 -rotate-90 text-[10px] text-muted-foreground">Konsekvens →</div>
    </div>
  );
}
