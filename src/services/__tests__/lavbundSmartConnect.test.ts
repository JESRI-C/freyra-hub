import { describe, it, expect } from "vitest";
import {
  normalizeHoboPayload,
  normalizeDEMPayload,
} from "../lavbundSmartConnect";

describe("normalizeHoboPayload", () => {
  it("konverterer cm→m og markerer kilden", () => {
    const r = normalizeHoboPayload({
      serial: "s1",
      maalepunktId: "mp-1",
      samples: [
        { t: "2026-04-01T00:00:00Z", waterDepthCm: 8 },
        { t: "2026-04-02T00:00:00Z", waterDepthCm: 20 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.readings).toHaveLength(2);
    expect(r.readings[0].dybdeM).toBeCloseTo(0.08, 5);
    expect(r.readings[0].kilde).toBe("hobo_logger");
  });
  it("kasserer ugyldige samples og rapporterer fejl", () => {
    const r = normalizeHoboPayload({
      serial: "s1",
      maalepunktId: "mp-1",
      samples: [
        { t: "not-a-date", waterDepthCm: 8 },
        { t: "2026-04-02T00:00:00Z", waterDepthCm: Number.NaN },
        { t: "2026-04-03T00:00:00Z", waterDepthCm: 12 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.readings).toHaveLength(1);
    expect(r.fejl).toHaveLength(2);
  });
});

describe("normalizeDEMPayload", () => {
  it("beregner dybde som reference − DEM (klippet ved 0)", () => {
    const r = normalizeDEMPayload({
      maalepunktId: "mp-1",
      captureIso: "2026-05-01T12:00:00Z",
      demHeightM: 1.2,
      referenceHeightM: 1.5,
      source: "drone_dem",
    });
    expect(r.ok).toBe(true);
    expect(r.readings[0].dybdeM).toBeCloseTo(0.3, 5);
    expect(r.readings[0].kilde).toBe("drone_dem");
  });
  it("fejler på manglende ID", () => {
    const r = normalizeDEMPayload({
      maalepunktId: "",
      captureIso: "2026-05-01T12:00:00Z",
      demHeightM: 1,
      referenceHeightM: 1,
      source: "insar",
    });
    expect(r.ok).toBe(false);
    expect(r.readings).toHaveLength(0);
  });
});
