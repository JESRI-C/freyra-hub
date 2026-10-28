import { describe, expect, it } from "vitest";
import { adjacentMunicipalStep, MUNICIPAL_CORE_STEP_IDS } from "../municipal-workflow";
describe("task-driven municipal navigation", () => {
  it("reaches delivery after comparison without planting", () => {
    expect(adjacentMunicipalStep("sammenligning", 1)).toBe("rapport");
    expect(MUNICIPAL_CORE_STEP_IDS).not.toContain("beplantning");
  });
  it("keeps historical optional planting links usable in both directions", () => {
    expect(adjacentMunicipalStep("beplantning", 1)).toBe("rapport");
    expect(adjacentMunicipalStep("beplantning", -1)).toBe("sammenligning");
  });
  it("keeps boundaries and unknown navigation explicit", () => {
    expect(adjacentMunicipalStep("billeder", -1)).toBeUndefined();
    expect(adjacentMunicipalStep("rapport", 1)).toBeUndefined();
    expect(adjacentMunicipalStep("unknown", 1)).toBeUndefined();
  });
});
