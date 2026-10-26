import { describe, expect, it } from "vitest";
import { DroneImageVisualDraftSchema, type DroneImageVisualDraft } from "../drone-image-inspection";
import { describeDroneVisualInDanish } from "../drone-visual-presentation";

const visual = (): DroneImageVisualDraft => ({
  quality: {
    assessment: "limited",
    issues: ["shadow"],
    limitation: "The image has an English limitation.",
  },
  watercourseVisibility: "partly_visible",
  features: [
    {
      kind: "vegetation_cover",
      appearance: "Dense green vegetation beside a dark strip.",
      confidence: 0.7,
      uncertainty: "The stream is partly obscured.",
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    },
  ],
  overallUncertainty: "high",
});

function freezeTree(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  Object.values(value).forEach(freezeTree);
  Object.freeze(value);
}

describe("frozen Danish presentation of structured visual fields", () => {
  it("presents Danish categories without copying any model prose or confidence", () => {
    const source = visual();
    expect(DroneImageVisualDraftSchema.safeParse(source).success).toBe(true);
    const presentation = describeDroneVisualInDanish(source);
    expect(presentation).toEqual({
      qualityLimitation:
        "AI har markeret begrænset udsyn eller billedkvalitet. Faglig gennemgang og eventuelt supplerende dokumentation kræves. Mulige begrænsninger markeret af AI: skygge.",
      uncertainty:
        "AI har markeret vandløbet som delvist synligt. Skjulte forhold kan ikke vurderes. AI-forslag er ubekræftede. Fotoet dokumenterer ikke alene stedmatch eller naturtilstand.",
      features: [
        {
          appearance: "Ubekræftet AI-forslag: mulig vegetation.",
          uncertainty:
            "Vegetationens art og betydning kræver faglig afklaring. AI har angivet et billedområde; det dokumenterer ingen placering på jorden. Billedkvaliteten er markeret som begrænset.",
        },
      ],
    });
    const text = JSON.stringify(presentation);
    for (const raw of [
      source.quality.limitation,
      source.overallUncertainty,
      source.features[0].appearance,
      source.features[0].uncertainty,
      String(source.features[0].confidence),
    ])
      expect(text).not.toContain(raw);
    expect(text).not.toMatch(/\d|%|\b(?:ha|kg|cm)\b/);
  });

  it("leaves the exact source bytes intact and returns independent deterministic values", () => {
    const source = visual();
    const before = JSON.stringify(source);
    freezeTree(source);
    const first = describeDroneVisualInDanish(source);
    const second = describeDroneVisualInDanish(source);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.features[0]).not.toBe(second.features[0]);
    first.features[0].appearance = "Kun lokal visning ændret";
    expect(JSON.stringify(source)).toBe(before);
    expect(DroneImageVisualDraftSchema.parse(source)).toEqual(JSON.parse(before));
    expect(describeDroneVisualInDanish(source)).toEqual(second);
  });

  it("does not infer new findings or certainty from changed prose or model self-confidence", () => {
    const first = visual();
    const second = visual();
    second.quality.limitation = "A different English limitation.";
    second.overallUncertainty = "low";
    second.features[0].appearance = "An unrelated model description.";
    second.features[0].uncertainty = "A different uncertainty.";
    second.features[0].confidence = 0.01;
    expect(describeDroneVisualInDanish(first)).toEqual(describeDroneVisualInDanish(second));
  });

  it("makes unusable image quality explicit and never presents features for it", () => {
    const source = visual();
    source.quality = { assessment: "unusable", issues: [], limitation: "Cannot assess." };
    source.watercourseVisibility = "uncertain";
    source.features = [];
    expect(DroneImageVisualDraftSchema.safeParse(source).success).toBe(true);
    const presentation = describeDroneVisualInDanish(source);
    expect(presentation.qualityLimitation).toBe(
      "Billedet kan ikke vurderes pålideligt med AI. Faglig gennemgang kræves.",
    );
    expect(presentation.features).toEqual([]);
    expect(presentation.uncertainty).toContain("Vandløbets synlighed er uafklaret");
    // Defensive presentation also withholds features from inconsistent typed input.
    source.features = visual().features;
    source.watercourseVisibility = "visible";
    expect(describeDroneVisualInDanish(source)).toEqual(presentation);
  });

  it("retains the need for professional review for usable images without inventing issues", () => {
    const source = visual();
    source.quality.assessment = "usable";
    source.quality.issues = [];
    const result = describeDroneVisualInDanish(source);
    expect(result.qualityLimitation).toBe(
      "AI har markeret billedet som egnet til en foreløbig billedgennemgang. Faglig gennemgang kræves.",
    );
    expect(result.features[0].uncertainty).not.toContain(
      "Billedkvaliteten er markeret som begrænset",
    );
  });

  it("covers every allowed image-quality issue with Danish text", () => {
    const source = visual();
    source.quality.issues = [
      "blur",
      "shadow",
      "glare",
      "vegetation_occlusion",
      "low_detail",
      "partial_view",
      "unknown",
    ];
    expect(describeDroneVisualInDanish(source).qualityLimitation).toContain(
      "Mulige begrænsninger markeret af AI: sløring, skygge, genskin, vegetation, der skjuler udsynet, få synlige detaljer, ufuldstændigt udsyn, uafklaret billedbegrænsning.",
    );
  });

  it.each([
    ["visible", "AI har markeret vandløbet som synligt; det kræver faglig bekræftelse."],
    [
      "partly_visible",
      "AI har markeret vandløbet som delvist synligt. Skjulte forhold kan ikke vurderes.",
    ],
    [
      "not_visible",
      "AI har ikke identificeret et synligt vandløb. Det dokumenterer ikke, at vandløbet mangler.",
    ],
    ["uncertain", "Vandløbets synlighed er uafklaret og kræver faglig gennemgang."],
  ] as const)("keeps visibility %s as an unconfirmed AI category", (visibility, text) => {
    const source = visual();
    source.watercourseVisibility = visibility;
    expect(describeDroneVisualInDanish(source).uncertainty).toContain(text);
  });

  it.each([
    ["vegetation_cover", "mulig vegetation"],
    ["possible_obstruction", "muligt objekt, der kræver identifikation"],
    ["bank_surface_change", "mulig forskel i bredfladens udseende"],
    ["artificial_structure", "muligt anlæg"],
    ["surface_water", "muligt synligt overfladevand"],
  ] as const)(
    "keeps feature %s unconfirmed without geographic or measurement claims",
    (kind, text) => {
      const source = visual();
      source.features[0].kind = kind;
      source.features[0].region = null;
      const result = describeDroneVisualInDanish(source);
      expect(result.features).toHaveLength(1);
      expect(result.features[0].appearance).toBe(`Ubekræftet AI-forslag: ${text}.`);
      expect(result.features[0].uncertainty).toContain("Der er ikke angivet et billedområde.");
      expect(result.features[0].uncertainty).not.toContain("AI har angivet et billedområde");
    },
  );
});
