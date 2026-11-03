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
function render(lastMethod: string | null, readOnly = true, target?: Partial<Indicator>) {
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
    <IndicatorDetail
      indicator={{ ...indicator, ...target }}
      open
      readOnly={readOnly}
      onOpenChange={() => {}}
    />,
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

  it("offers source and method fields to an editor and hides the form from readers", () => {
    const editor = render(null, false);
    expect(editor).toContain(">Kilde</label>");
    expect(editor).toContain(">Målemetode</label>");
    expect(editor).toContain("Gem måling");
    expect(render(null)).not.toContain("Gem måling");
  });

  it("keeps a zero target and compares only measurements in its saved unit", () => {
    const target = { target_value: 0, target_direction: "at_most", target_unit: "stk." } as const;
    const html = render("Optælling", true, target);
    expect(html).toContain("Højst 0 stk.");
    expect(html).toContain("Værdien ligger uden for målet.");
    expect(render("Optælling", true, { ...target, target_unit: "ha" })).toContain(
      "Afventer en registrering i perioden med målets enhed.",
    );
  });
});
