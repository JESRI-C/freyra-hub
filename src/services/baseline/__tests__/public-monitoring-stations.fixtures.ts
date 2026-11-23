import type { PublicMonitoringStationsInput } from "../public-monitoring-stations-source";
/** IDs/native points come from the seven public QA candidates. Labels are shortened/replaced;
 * owner/link/contact fields are omitted. This is a curated fixture, NOT the original raw page or municipal acceptance. */
export const PUBLIC_QA_CANDIDATE_EVIDENCE = {
  responseSha256: "3c1ee99cd87920b17c2ba0947f982b06faf7ef2f106d55f579caaa19da92394c",
  nativeBbox: [515756, 6132196, 517345, 6136401],
  municipalAcceptance: false,
  originalRawResponseNotStored: true,
  labelValuesCurated: true,
} as const;
export const MONITORING_INPUT: PublicMonitoringStationsInput = {
  polygon: {
    type: "Polygon",
    coordinates: [
      [
        [9.249033116, 55.336099018],
        [9.273036068, 55.336099018],
        [9.273036068, 55.373372295],
        [9.249033116, 55.373372295],
        [9.249033116, 55.336099018],
      ],
    ],
  },
  dateFrom: "2025-10-01",
  dateTo: "2025-10-31",
};
export const MONITORING_NATIVE_BBOX: [number, number, number, number] = [
  515756, 6132196, 517345, 6136401,
];
export const MONITORING_QA_FEATURES = [
  {
    type: "Feature",
    id: "steder.8ED16397-C1FB-457A-A58C-D3622EF19DAF",
    geometry: {
      type: "Point",
      coordinates: [515968, 6132694],
    },
    geometry_name: "Lokation",
    properties: {
      Stationsnummer: "38000292",
      Stationsnavn: "Barsbøl Bæk",
    },
  },
  {
    type: "Feature",
    id: "steder.035258BE-B261-401A-ABD1-1B767CC96466",
    geometry: {
      type: "Point",
      coordinates: [517070, 6134364],
    },
    geometry_name: "Lokation",
    properties: {
      Stationsnummer: "38000308",
      Stationsnavn: "Bykær Bæk",
    },
  },
  {
    type: "Feature",
    id: "steder.C9B65CB6-716B-41EF-BD4C-48EAC29C25F5",
    geometry: {
      type: "Point",
      coordinates: [516559, 6133281],
    },
    geometry_name: "Lokation",
    properties: {
      Stationsnummer: "38000309",
      Stationsnavn: "Bykær Bæk",
    },
  },
  {
    type: "Feature",
    id: "steder.F8A03BAB-CD85-42FB-9DE2-6712A4CF5B1C",
    geometry: {
      type: "Point",
      coordinates: [516226, 6132628],
    },
    geometry_name: "Lokation",
    properties: {
      Stationsnummer: "38000310",
      Stationsnavn: "Bykær Bæk",
    },
  },
  {
    type: "Feature",
    id: "steder.F16F8706-34D6-42FE-84D4-1DC9A2019CE0",
    geometry: {
      type: "Point",
      coordinates: [515879, 6132427],
    },
    geometry_name: "Lokation",
    properties: {
      Stationsnummer: "38000711",
      Stationsnavn: "Ørsted å",
    },
  },
  {
    type: "Feature",
    id: "steder.77B1DFDE-2F72-40DC-AC7E-D247978EB1DC",
    geometry: {
      type: "Point",
      coordinates: [515864.5744, 6132961.6294],
    },
    geometry_name: "Lokation",
    properties: {
      Stationsnummer: "38000854",
      Stationsnavn: "Teknisk QA sted 6",
    },
  },
  {
    type: "Feature",
    id: "steder.5458C4FF-A327-4C1D-91FE-B49DF2818918",
    geometry: {
      type: "Point",
      coordinates: [516170.8, 6135189.3],
    },
    geometry_name: "Lokation",
    properties: {
      Stationsnummer: "70001544",
      Stationsnavn: "Teknisk QA sted 7",
    },
  },
];
export function monitoringQaPage() {
  return {
    type: "FeatureCollection",
    features: structuredClone(MONITORING_QA_FEATURES),
    numberMatched: 7,
    numberReturned: 7,
    totalFeatures: 7,
    timeStamp: "2026-10-13T18:54:54.012Z",
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::25832" } },
  };
}
/** Generated rows for pagination/error tests only; never real local stations. */
export function syntheticMonitoringPage(total: number, startIndex = 0) {
  const size = Math.min(50, Math.max(0, total - startIndex));
  return {
    type: "FeatureCollection",
    features: Array.from({ length: size }, (_, offset) => {
      const n = startIndex + offset;
      return {
        type: "Feature",
        id: "steder.00000000-0000-4000-8000-" + String(n + 1).padStart(12, "0"),
        geometry_name: "Lokation",
        geometry: { type: "Point", coordinates: [516000 + (n % 100), 6134000] },
        properties: {
          Stationsnummer: String(80000000 + n),
          Stationsnavn: "Syntetisk QA sted " + n,
        },
      };
    }),
    numberMatched: total,
    numberReturned: size,
    totalFeatures: total,
    timeStamp: "2026-10-13T18:00:00Z",
    crs: total === 0 ? null : { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::25832" } },
  };
}
