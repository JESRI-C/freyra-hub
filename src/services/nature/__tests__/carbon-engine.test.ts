import { describe, it, expect } from "vitest";
import { computeCarbonEstimate } from "../carbon-engine";
import type { SoilProfile } from "../geus-service";

function makeSoil(overrides: Partial<SoilProfile> = {}): SoilProfile {
  return {
    dominantClass: "sandy_clay",
    organicContent: 3,
    drainageClass: "moderate",
    infiltrationRate: "medium",
    carbonDensity: 35,
    soilLabel: "Leret sandjord",
    fetchedAt: new Date().toISOString(),
    mode: "live",
    ...overrides,
  };
}

describe("computeCarbonEstimate", () => {
  it("returnerer positiv årlig sekvestrering for naturprojekt", () => {
    const est = computeCarbonEstimate(7.3, "Biodiversitet", 0.68, makeSoil());
    expect(est.annualSequestration).toBeGreaterThan(0);
    expect(est.peakSequestration).toBeGreaterThanOrEqual(est.annualSequestration);
  });

  it("organisk jord booster CO₂-binding markant ift. sandjord", () => {
    const organic = computeCarbonEstimate(10, "Vådområde", 0.5, makeSoil({ dominantClass: "organic" }));
    const sand = computeCarbonEstimate(10, "Vådområde", 0.5, makeSoil({ dominantClass: "sand" }));
    expect(organic.annualSequestration).toBeGreaterThan(sand.annualSequestration * 2);
  });

  it("skalerer lineært med areal", () => {
    const small = computeCarbonEstimate(1, "Skovrejsning", 0.6, makeSoil());
    const large = computeCarbonEstimate(10, "Skovrejsning", 0.6, makeSoil());
    expect(large.annualSequestration / small.annualSequestration).toBeCloseTo(10, 0);
  });

  it("modent projekt sekvestrerer mere end nystartet", () => {
    const young = computeCarbonEstimate(7.3, "Skovrejsning", 0.6, makeSoil(), 0);
    const mature = computeCarbonEstimate(7.3, "Skovrejsning", 0.6, makeSoil(), 25);
    expect(mature.annualSequestration).toBeGreaterThan(young.annualSequestration);
  });

  it("genkender vådområde fra projekttype", () => {
    const est = computeCarbonEstimate(7.3, "Vådområder", null, makeSoil());
    expect(est.vegetationType).toBe("Genvådnet mose/eng");
  });

  it("confidence er high ved live jorddata + NDVI", () => {
    const est = computeCarbonEstimate(7.3, "Biodiversitet", 0.6, makeSoil({ mode: "live" }));
    expect(est.confidence).toBe("high");
  });

  it("breakdown-komponenter er alle ikke-negative", () => {
    const est = computeCarbonEstimate(7.3, "Biodiversitet", 0.6, makeSoil());
    expect(est.breakdown.aboveground).toBeGreaterThanOrEqual(0);
    expect(est.breakdown.belowground).toBeGreaterThanOrEqual(0);
    expect(est.breakdown.soilOrganic).toBeGreaterThanOrEqual(0);
  });
});
