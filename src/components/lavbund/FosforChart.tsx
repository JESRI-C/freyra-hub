/**
 * FosforChart — fosfortab FØR/EFTER pr. kilde (vandløb, grøfter) som grupperet
 * søjlediagram med afrundede dataender, 2px flade-mellemrum og hover-tooltip.
 * Palette valideret: amber (FØR) + emerald (EFTER) består CVD/kontrast-check.
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const FOER_AMBER = "#b45309"; // valideret
const EFTER_GROEN = "#059669"; // valideret

export interface FosforData {
  vandloebFoerKgAar: number;
  vandloebEfterKgAar: number;
  groefterFoerKgAar: number;
  groefterEfterKgAar: number;
}

export function FosforChart({ data, height = 240 }: { data: FosforData; height?: number }) {
  const rows = [
    { kilde: "Vandløb", FØR: data.vandloebFoerKgAar, EFTER: data.vandloebEfterKgAar },
    { kilde: "Grøfter", FØR: data.groefterFoerKgAar, EFTER: data.groefterEfterKgAar },
  ];
  const fmt = (v: number | string) =>
    `${Number(v).toLocaleString("da-DK", { maximumFractionDigits: 1 })} kg P/år`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barGap={2}>
          <CartesianGrid strokeDasharray="2 4" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="kilde" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ strokeOpacity: 0.25 }} />
          <YAxis
            tickFormatter={(v: number) => v.toLocaleString("da-DK")}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={46}
            label={{ value: "kg P/år", angle: -90, position: "insideLeft", fontSize: 11, offset: 8 }}
          />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
            formatter={(value: number | string, name: string) => [fmt(value), name]}
            contentStyle={{ borderRadius: 10, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={9} />
          <Bar dataKey="FØR" fill={FOER_AMBER} radius={[4, 4, 0, 0]} maxBarSize={44} />
          <Bar dataKey="EFTER" fill={EFTER_GROEN} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
