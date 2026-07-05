import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { indicatorStatusColor, formatIndicatorValue } from "@/services/indicators-service";
import type { Indicator } from "@/lib/supabase/types";

export function IndicatorCard({
  indicator,
  onClick,
}: {
  indicator: Indicator;
  onClick?: (indicator: Indicator) => void;
}) {
  const TrendIcon = () => {
    if (indicator.trend === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    if (indicator.trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const statusBg =
    indicator.status === "ok"
      ? "bg-emerald-50 border-emerald-200"
      : indicator.status === "warning"
        ? "bg-amber-50 border-amber-200"
        : indicator.status === "critical"
          ? "bg-red-50 border-red-200"
          : "bg-muted/40 border-border";

  const inner = (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-2 ${statusBg} ${
        onClick ? "hover:shadow-md hover:-translate-y-0.5 transition" : ""
      }`}
    >
      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        {indicator.category ?? "Indikator"}
      </div>
      <div className="text-sm font-semibold leading-snug">{indicator.label}</div>
      <div className="flex items-end justify-between mt-1">
        <span className={`text-2xl font-bold tabular-nums ${indicatorStatusColor(indicator)}`}>
          {formatIndicatorValue(indicator)}
        </span>
        <TrendIcon />
      </div>
      <div className="text-[10px] text-muted-foreground">
        Opdateret {new Date(indicator.updated_at).toLocaleDateString("da-DK")}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={() => onClick(indicator)} className="text-left w-full">
        {inner}
      </button>
    );
  }
  return inner;
}
