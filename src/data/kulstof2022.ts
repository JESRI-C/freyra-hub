// Kulstof2022-lavbundskortet — det autoritative nationale kort over kulstofrig
// lavbundsjord som tilskudsordningerne administreres efter (Aarhus Universitet/
// Miljøministeriet, publiceret via MiljøGIS).
//
// WMS-endpointet kan variere mellem MiljøGIS-udgivelser; det konfigureres
// derfor via env og fejler gracefully (kortet vises uændret hvis laget ikke
// svarer). Verificér endpointet i preview og justér env ved behov.
export const KULSTOF2022_WMS = {
  url:
    (import.meta.env["VITE_KULSTOF2022_WMS_URL"] as string | undefined) ??
    "https://miljoegis3.mim.dk/wms?servicename=miljoegis-klimalavbund",
  layers:
    (import.meta.env["VITE_KULSTOF2022_WMS_LAYER"] as string | undefined) ??
    "theme-klimalavbund_kulstof2022",
  opacity: 0.55,
  attribution: "© Miljøministeriet / Aarhus Universitet — Kulstof2022",
  label: "Kulstof 2022 (lavbundskort)",
  description: "Autoritativt kort over kulstofrig lavbundsjord (6-12 % og >12 % C)",
} as const;
