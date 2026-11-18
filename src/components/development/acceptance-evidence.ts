// Internal acceptance records are kept in the private workspace.
export const acceptanceEvidence = [
  {
    path: "evidence/device-map-export-2026-11-18.json",
    id: "acceptance-device-export",
    title: "Enheder i GeoJSON og CSV med eksportlog",
    result: {
      private: true,
      status: "Internt prøveresultat opbevares privat; ikke dokumentation for denne udgivelse.",
    },
  },
  {
    path: "evidence/project-device-views-2026-11-17.json",
    id: "acceptance-project-devices",
    title: "Enheder på tværs af projektkort og panel",
    result: {
      private: true,
      status: "Internt prøveresultat opbevares privat; ikke dokumentation for denne udgivelse.",
    },
  },
  {
    path: "evidence/map-devices-2026-11-17.json",
    id: "acceptance-map-devices",
    title: "Registrerede enheder og målte positioner",
    result: {
      private: true,
      status: "Internt prøveresultat opbevares privat; ikke dokumentation for denne udgivelse.",
    },
  },
  {
    path: "evidence/map-nature-boundary-2026-11-17.json",
    id: "acceptance-nature-boundary",
    title: "Projektgrænse og manglende naturdata",
    result: {
      private: true,
      status: "Internt prøveresultat opbevares privat; ikke dokumentation for denne udgivelse.",
    },
  },
  {
    path: "evidence/dalgas-fieldwork-2026-11-17.json",
    id: "acceptance-fieldwork",
    title: "Feltarbejde til godkendt rapport",
    result: {
      private: true,
      status: "Internt prøveresultat opbevares privat; ikke dokumentation for denne udgivelse.",
    },
  },
  {
    path: "evidence/offline-restart-2026-11-17.json",
    id: "acceptance-offline-restart",
    title: "Genstart uden net og efterfølgende synkronisering",
    result: {
      private: true,
      status: "Internt prøveresultat opbevares privat; ikke dokumentation for denne udgivelse.",
    },
  },
  {
    path: "evidence/scoped-export-acceptance-2026-11-17.json",
    id: "acceptance-exports",
    title: "Kortdata, CSV og Excel med adgangskontrol",
    result: {
      private: true,
      status: "Internt prøveresultat opbevares privat; ikke dokumentation for denne udgivelse.",
    },
  },
] as const;

export function evidenceForFeature(feature: Record<string, unknown>) {
  const paths = new Set(
    Object.entries(feature)
      .filter(([name]) => /^goFreyra.*Evidence$/.test(name))
      .flatMap(([, value]) =>
        typeof value === "string"
          ? [value]
          : Array.isArray(value)
            ? value.filter((path): path is string => typeof path === "string")
            : [],
      ),
  );
  return acceptanceEvidence.filter((record) => paths.has(record.path));
}
