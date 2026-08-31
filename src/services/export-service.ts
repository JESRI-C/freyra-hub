/**
 * Export Service
 * Bygger downloadbare dataudtræk fra projektets samlede datagrundlag:
 *
 *   - GeoJSON-download af canonical FeatureCollections fra geospatial-service
 *   - CSV: alle beregnede metrics + indikatorer (Excel-klar)
 *   - Rapportdatasæt: struktureret JSON til Report Engine
 */

import type { Project } from "@/lib/supabase/types";
import type { Zone } from "@/services/zones-service";
import { ZONE_TYPE_LABELS, type ZoneType } from "@/services/zones-service";
import type { AnalysisSummary } from "@/services/analysis-orchestrator";
import { getIndicatorsByProject } from "@/services/indicators-service";
import { logAuditEvent } from "@/services/audit-service";

// ─── CSV-udtræk ───────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const raw = String(v);
  const s = typeof v === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(";");
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(";")).join("\n");
  // BOM så Excel åbner æøå korrekt
  return "﻿" + header + "\n" + body;
}

/** Henter projektets indikatorer og bygger analysedata som CSV. */
export async function buildMetricsCsv(
  project: Project,
  analysis: AnalysisSummary | null,
): Promise<string> {
  const indicators = await getIndicatorsByProject(project.id);

  const rows: Array<Record<string, unknown>> = indicators.map((i) => ({
    kategori: i.category ?? "",
    nøgle: i.key,
    navn: i.label,
    værdi: i.value,
    enhed: i.unit ?? "",
    trend: i.trend ?? "",
    status: i.status ?? "",
    opdateret: i.updated_at,
    kilde: "indicators",
  }));

  if (analysis) {
    const a = analysis;
    const extra: Array<[string, string, unknown, string]> = [
      ["satellit", "NDVI (Sentinel-2)", a.ndviValue, ""],
      ["biodiversitet", "Biodiversitetsindeks", a.biodiversityScore, "point"],
      ["biodiversitet", "Klassifikation", a.biodiversityClass, ""],
      ["natur", "§3-overlap", a.p3OverlapHa, "ha"],
      ["biodiversitet", "Registrerede arter", a.speciesCount, "arter"],
      ["biodiversitet", "Rødlistede arter", a.redListedCount, "arter"],
      ["klima", "CO₂-binding (årlig)", a.annualCO2, "t/år"],
      ["klima", "CO₂-binding (30 år)", a.totalCO2_30yr, "t"],
      ["vand", "Vandkvalitetsrisiko", a.waterRisk, ""],
      ["vand", "Risikoscore", a.waterScore, "point"],
      ["vand", "Nærmeste vandløb", a.watercourseDistM, "m"],
    ];
    extra.forEach(([kategori, navn, værdi, enhed]) => {
      if (værdi !== null && værdi !== undefined) {
        rows.push({
          kategori,
          nøgle: "",
          navn,
          værdi,
          enhed,
          trend: "",
          status: "",
          opdateret: new Date().toISOString(),
          kilde: "analyse",
        });
      }
    });
  }

  return buildCsv(rows, [
    "kategori",
    "nøgle",
    "navn",
    "værdi",
    "enhed",
    "trend",
    "status",
    "opdateret",
    "kilde",
  ]);
}

/** Zoner som CSV. */
export function buildZonesCsv(zones: Zone[]): string {
  const rows = zones.map((z) => ({
    navn: z.name,
    type: ZONE_TYPE_LABELS[z.area_type as ZoneType] ?? z.area_type,
    areal_ha: z.area_ha,
    oprettet: z.created_at,
  }));
  return buildCsv(rows, ["navn", "type", "areal_ha", "oprettet"]);
}

// ─── Download-hjælper ─────────────────────────────────────────────────────────

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadGeoJSON(
  geojson: { type: "FeatureCollection"; features: readonly unknown[] },
  projectSlug: string,
): void {
  downloadFile(
    JSON.stringify(geojson, null, 2),
    `${projectSlug}-geodata.geojson`,
    "application/geo+json",
  );
  void logAuditEvent({
    event_type: "data_export",
    title: `GeoJSON eksporteret: ${projectSlug} (${geojson.features.length} features)`,
    actor: "Bruger",
    source: "manual",
  });
}

export function downloadCsv(csv: string, filename: string): void {
  downloadFile(csv, filename, "text/csv;charset=utf-8");
  void logAuditEvent({
    event_type: "data_export",
    title: `CSV eksporteret: ${filename}`,
    actor: "Bruger",
    source: "manual",
  });
}
