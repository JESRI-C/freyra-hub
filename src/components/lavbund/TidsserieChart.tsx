/**
 * TidsserieChart — månedsmiddel af dybde til vandspejl som interaktivt
 * area-chart. Y-aksen er VENDT (hydrologi-konvention: vådere = højere på
 * kortet, terræn øverst). Referencelinje ved 0,50 m markerer Våd eng-grænsen.
 * Palette valideret (lysstyrke/chroma/CVD/kontrast) mod lys flade.
 */
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

const SERIE_BLAA = "#2563eb"; // valideret
const GRAENSE_GROEN = "#059669"; // valideret

export interface TidsseriePunkt {
  maaned: string; // "2026-03"
  dybde: number; // m under terræn
}

function fmtMaaned(m: string): string {
  const [aar, md] = m.split("-");
  const navne = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  return `${navne[Number(md) - 1] ?? md} ${aar?.slice(2)}`;
}

export function TidsserieChart({
  serie,
  height = 260,
  etableringMaaned,
}: {
  serie: TidsseriePunkt[];
  height?: number;
  /** "YYYY-MM" — måneder før markeres som baseline (førtilstand). */
  etableringMaaned?: string;
}) {
  if (serie.length === 0) {
    return <div className="text-sm text-muted-foreground p-6">Ingen målinger endnu.</div>;
  }
  const maxD = Math.max(1.25, ...serie.map((s) => s.dybde)) * 1.1;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={serie} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="dybdeFyld" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIE_BLAA} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIE_BLAA} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis
            dataKey="maaned"
            tickFormatter={fmtMaaned}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ strokeOpacity: 0.25 }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            reversed
            domain={[0, Number(maxD.toFixed(2))]}
            tickFormatter={(v: number) => `${v.toFixed(2)} m`}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={58}
          />
          <Tooltip
            cursor={{ stroke: SERIE_BLAA, strokeOpacity: 0.35, strokeWidth: 1 }}
            formatter={(value: number | string) => [
              `${Number(value).toLocaleString("da-DK", { maximumFractionDigits: 2 })} m under terræn`,
              "Månedsmiddel",
            ]}
            labelFormatter={(label: string) => fmtMaaned(label)}
            contentStyle={{ borderRadius: 10, fontSize: 12 }}
          />
          {etableringMaaned && serie.some((s2) => s2.maaned < etableringMaaned) && (
            <ReferenceArea
              x1={serie[0].maaned}
              x2={etableringMaaned}
              fill="#b45309"
              fillOpacity={0.07}
              label={{ value: "Baseline (før)", position: "insideTopLeft", fontSize: 10, fill: "#b45309" }}
            />
          )}
          {etableringMaaned && (
            <ReferenceLine
              x={etableringMaaned}
              stroke="#b45309"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: "Etablering", position: "top", fontSize: 10, fill: "#b45309" }}
            />
          )}
          <ReferenceLine
            y={0.5}
            stroke={GRAENSE_GROEN}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{
              value: "Våd eng ≤ 0,50 m",
              position: "insideTopRight",
              fontSize: 11,
              fill: GRAENSE_GROEN,
            }}
          />
          <Area
            type="monotone"
            dataKey="dybde"
            stroke={SERIE_BLAA}
            strokeWidth={2}
            fill="url(#dybdeFyld)"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
