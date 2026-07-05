// Export service — genererer CSV / GeoJSON / JSON i browseren og trigger download.

export type ExportFormat = "csv" | "geojson" | "json";

export interface ExportRow {
  [key: string]: unknown;
}

export interface GeoRow extends ExportRow {
  latitude?: number | null;
  longitude?: number | null;
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  );
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n");
}

export function toGeoJson(rows: GeoRow[]): string {
  const features = rows
    .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number")
    .map((r) => {
      const { latitude, longitude, ...props } = r;
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
        properties: props,
      };
    });
  return JSON.stringify({ type: "FeatureCollection", features }, null, 2);
}

export function downloadExport(rows: ExportRow[], format: ExportFormat, filename: string): void {
  let content: string;
  let mime: string;
  switch (format) {
    case "csv":
      content = toCsv(rows);
      mime = "text/csv;charset=utf-8";
      break;
    case "geojson":
      content = toGeoJson(rows as GeoRow[]);
      mime = "application/geo+json";
      break;
    case "json":
    default:
      content = JSON.stringify(rows, null, 2);
      mime = "application/json";
      break;
  }
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
