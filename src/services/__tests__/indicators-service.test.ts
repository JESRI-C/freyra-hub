import { describe, it, expect } from "vitest";
import { evaluateStatus } from "../indicators-service";
import type { Indicator } from "@/lib/supabase/types";

const base: Indicator = {
  id: "i1",
  project_id: "p1",
  key: "moisture",
  label: "Jordfugt",
  category: null,
  value: null,
  unit: "%",
  trend: null,
  status: null,
  threshold_warning: 30,
  threshold_critical: 20,
  threshold_direction: "below",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("evaluateStatus", () => {
  it("returns ok when far from thresholds", () => {
    expect(evaluateStatus(base, 60)).toBe("ok");
  });
  it("returns warning at warning threshold (below)", () => {
    expect(evaluateStatus(base, 30)).toBe("warning");
    expect(evaluateStatus(base, 25)).toBe("warning");
  });
  it("returns critical at critical threshold (below)", () => {
    expect(evaluateStatus(base, 20)).toBe("critical");
    expect(evaluateStatus(base, 10)).toBe("critical");
  });
  it("respects above direction", () => {
    const above: Indicator = { ...base, threshold_direction: "above", threshold_warning: 50, threshold_critical: 80 };
    expect(evaluateStatus(above, 10)).toBe("ok");
    expect(evaluateStatus(above, 55)).toBe("warning");
    expect(evaluateStatus(above, 90)).toBe("critical");
  });
  it("returns ok when thresholds are null", () => {
    const none: Indicator = { ...base, threshold_warning: null, threshold_critical: null };
    expect(evaluateStatus(none, 5)).toBe("ok");
  });
});
