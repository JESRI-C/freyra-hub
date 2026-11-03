import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Indicator, IndicatorMeasurement } from "@/lib/supabase/types";
import { IndicatorDetail } from "./IndicatorDetail";

const data = vi.hoisted(() => ({ measurements: [] as IndicatorMeasurement[] }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: data.measurements }),
  useQueryClient: () => ({}),
}));
vi.mock("@/components/ui/sheet", () => {
  const wrapper = ({ children }: { children?: React.ReactNode }) => children;
  return {
    Sheet: wrapper,
    SheetContent: wrapper,
    SheetHeader: wrapper,
    SheetTitle: wrapper,
    SheetDescription: wrapper,
  };
});
vi.mock("recharts", () => ({
  ResponsiveContainer: () => null,
  LineChart: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  Line: () => null,
}));
vi.mock("./IndicatorConfigDialog", () => ({ IndicatorConfigDialog: () => null }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: false }));

const indicator = { id: "plants", label: "Optalte planter", unit: "stk." } as Indicator;
function render(lastMethod: string | null) {
  const first: IndicatorMeasurement = {
    id: "first",
    indicator_id: indicator.id,
    project_id: null,
    value: 0,
    unit: "stk.",
    measured_at: "2026-10-01T12:00:00Z",
    created_at: "2026-10-01T12:00:00Z",
    source: "Feltbesøg",
    method: "Optælling",
    confidence_score: null,
    metadata: null,
  };
  data.measurements = [
    first,
    { ...first, id: "last", value: 5, measured_at: "2026-10-10T12:00:00Z", method: lastMethod },
  ];
  return renderToStaticMarkup(
    <IndicatorDetail indicator={indicator} open readOnly onOpenChange={() => {}} />,
  );
}

describe("indicator measurements over time", () => {
  it("compares recorded zero with a later value and shows the basis", () => {
    const html = render("Optælling");
    expect(html).toContain("Fra 0 til 5 stk. · ændring +5.");
    expect(html).toContain("Vurder indsatsens effekt ud fra det faglige grundlag");
  });

  it("keeps the values visible without computing change when the method is unknown", () => {
    const html = render(null);
    expect(html).toContain("samme dokumenterede kilde, metode og enhed");
    expect(html).toContain("Metode: Ukendt");
    expect(html).not.toContain("ændring +5");
  });
});
