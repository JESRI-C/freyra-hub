import type { DroneImageVisualDraft } from "./drone-image-inspection";

export interface DanishDroneVisualPresentation {
  qualityLimitation: string;
  uncertainty: string;
  features: Array<{ appearance: string; uncertainty: string }>;
}

const QUALITY = {
  usable:
    "AI har markeret billedet som egnet til en foreløbig billedgennemgang. Faglig gennemgang kræves.",
  limited:
    "AI har markeret begrænset udsyn eller billedkvalitet. Faglig gennemgang og eventuelt supplerende dokumentation kræves.",
  unusable: "Billedet kan ikke vurderes pålideligt med AI. Faglig gennemgang kræves.",
} as const;

const ISSUES = {
  blur: "sløring",
  shadow: "skygge",
  glare: "genskin",
  vegetation_occlusion: "vegetation, der skjuler udsynet",
  low_detail: "få synlige detaljer",
  partial_view: "ufuldstændigt udsyn",
  unknown: "uafklaret billedbegrænsning",
} as const;

const VISIBILITY = {
  visible: "AI har markeret vandløbet som synligt; det kræver faglig bekræftelse.",
  partly_visible:
    "AI har markeret vandløbet som delvist synligt. Skjulte forhold kan ikke vurderes.",
  not_visible:
    "AI har ikke identificeret et synligt vandløb. Det dokumenterer ikke, at vandløbet mangler.",
  uncertain: "Vandløbets synlighed er uafklaret og kræver faglig gennemgang.",
} as const;

const FEATURES = {
  vegetation_cover: {
    appearance: "Ubekræftet AI-forslag: mulig vegetation.",
    uncertainty: "Vegetationens art og betydning kræver faglig afklaring.",
  },
  possible_obstruction: {
    appearance: "Ubekræftet AI-forslag: muligt objekt, der kræver identifikation.",
    uncertainty: "Objektets funktion og betydning for vandløbet er uafklaret.",
  },
  bank_surface_change: {
    appearance: "Ubekræftet AI-forslag: mulig forskel i bredfladens udseende.",
    uncertainty: "Årsag og eventuel ændring over tid er uafklaret.",
  },
  artificial_structure: {
    appearance: "Ubekræftet AI-forslag: muligt anlæg.",
    uncertainty: "Anlæggets identitet, funktion og tilstand kræver faglig afklaring.",
  },
  surface_water: {
    appearance: "Ubekræftet AI-forslag: muligt synligt overfladevand.",
    uncertainty: "Vandets dybde, bevægelse og årsag kan ikke udledes heraf.",
  },
} as const;

/**
 * Frozen Danish presentation used by municipal report v3. Wording changes need
 * a new report generator version; retain this projection for historical replay.
 * This only presents validated categories. It neither translates model prose nor
 * changes the saved visual draft, provenance, confidence or supporting evidence.
 */
export function describeDroneVisualInDanish(
  visual: DroneImageVisualDraft,
): DanishDroneVisualPresentation {
  const quality = visual.quality.assessment;
  const issues = visual.quality.issues.map((issue) => ISSUES[issue]);
  return {
    qualityLimitation: [
      QUALITY[quality],
      ...(issues.length ? [`Mulige begrænsninger markeret af AI: ${issues.join(", ")}.`] : []),
    ].join(" "),
    uncertainty: [
      VISIBILITY[quality === "unusable" ? "uncertain" : visual.watercourseVisibility],
      "AI-forslag er ubekræftede. Fotoet dokumenterer ikke alene stedmatch eller naturtilstand.",
    ].join(" "),
    features:
      quality === "unusable"
        ? []
        : visual.features.map((feature) => ({
            appearance: FEATURES[feature.kind].appearance,
            uncertainty: [
              FEATURES[feature.kind].uncertainty,
              feature.region
                ? "AI har angivet et billedområde; det dokumenterer ingen placering på jorden."
                : "Der er ikke angivet et billedområde.",
              ...(quality === "limited" ? ["Billedkvaliteten er markeret som begrænset."] : []),
            ].join(" "),
          })),
  };
}
