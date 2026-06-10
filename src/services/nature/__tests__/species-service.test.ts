import { describe, it, expect } from "vitest";
import { redListTone, confidenceLabel, RED_LIST_LABELS } from "../species-service";

describe("redListTone", () => {
  it("kritisk truede arter får danger", () => {
    expect(redListTone("CR")).toBe("danger");
    expect(redListTone("EN")).toBe("danger");
    expect(redListTone("RE")).toBe("danger");
  });

  it("sårbare/næsten truede får warning", () => {
    expect(redListTone("VU")).toBe("warning");
    expect(redListTone("NT")).toBe("warning");
  });

  it("ikke-truede og null får default", () => {
    expect(redListTone("LC")).toBe("default");
    expect(redListTone(null)).toBe("default");
  });
});

describe("confidenceLabel", () => {
  it("oversætter konfidens til dansk niveau", () => {
    expect(confidenceLabel(0.9)).toBe("Høj sikkerhed");
    expect(confidenceLabel(0.7)).toBe("Moderat sikkerhed");
    expect(confidenceLabel(0.45)).toBe("Lav sikkerhed");
    expect(confidenceLabel(0.2)).toBe("Usikker");
  });
});

describe("RED_LIST_LABELS", () => {
  it("dækker alle IUCN-kategorier med danske labels", () => {
    expect(RED_LIST_LABELS.CR).toBe("Kritisk truet");
    expect(RED_LIST_LABELS.LC).toBe("Ikke truet");
    expect(Object.keys(RED_LIST_LABELS)).toHaveLength(8);
  });
});
