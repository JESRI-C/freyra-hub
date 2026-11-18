import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";

vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: false, supabase: null }));
vi.mock("@/services/audit-service", () => ({ logAuditEvent: vi.fn() }));

import { generateProjectReport } from "../documents-service";
import type { Project, Site, Action, Indicator } from "@/lib/supabase/types";

// Synthetic fixtures only — not real project data.
const project: Project = {
  id: "00000000-0000-0000-0000-000000000001",
  organization_id: null,
  name: "Syntetisk testprojekt med et ret langt navn til ombrydning",
  slug: "t",
  project_type: "Biodiversitet",
  location_name: "Testlokation",
  municipality: null,
  country: "Denmark",
  status: "active",
  start_date: "2026-01-01",
  end_date: null,
  description: "Syntetisk beskrivelse. ".repeat(30),
  created_at: "2026-01-01T00:00:00Z",
  geometry_polygon: null,
  geometry_centroid_lat: null,
  geometry_centroid_lng: null,
  geometry_area_ha: 12.5,
  geometry_source: "tegnet",
};
const empty: Project = {
  ...project,
  name: "Tomt projekt",
  description: null,
  geometry_area_ha: null,
  geometry_source: null,
  location_name: null,
  start_date: null,
};
const sites = Array.from({ length: 20 }, (_, i) => ({
  id: `s${i}`,
  project_id: "p",
  name: `Site ${i} ${"med lang betegnelse ".repeat(i % 3)}`,
  site_type: "eng",
  area_ha: i + 0.5,
  geometry_geojson: null,
  baseline_status: null,
  created_at: "",
})) as Site[];
const indicators = Array.from({ length: 25 }, (_, i) => ({
  id: `i${i}`,
  project_id: "p",
  key: `k${i}`,
  label: `Indikator ${i}`,
  category: null,
  value: i % 4 ? i * 1.5 : null,
  unit: "%",
  trend: null,
  status: (["ok", "warning", "critical", null] as const)[i % 4],
  updated_at: "2026-03-01T00:00:00Z",
})) as Indicator[];
const actions = Array.from({ length: 45 }, (_, i) => ({
  id: `a${i}`,
  project_id: "p",
  title: `Handling ${i}: ${"meget lang beskrivende titel der skal ombrydes korrekt ".repeat(1 + (i % 3))}`,
  description: null,
  priority: "Høj",
  status: ["I gang", "Planlagt", "Færdig"][i % 3],
  due_date: "2026-06-01",
  owner: "Testperson",
  created_at: "",
})) as Action[];

async function pages(b: Blob) {
  const t = Buffer.from(await b.arrayBuffer()).toString("latin1");
  return (t.match(/\/Type \/Page[^s]/g) || []).length;
}

describe("generateProjectReport PDF layout", () => {
  for (const reportType of ["status", "indicator", "authority"] as const) {
    it(`${reportType}: empty input gives one page, large input paginates`, async () => {
      const e = await generateProjectReport({
        project: empty,
        sites: [],
        actions: [],
        indicators: [],
        reportType,
      });
      const f = await generateProjectReport({ project, sites, actions, indicators, reportType });
      if (process.env.PDF_OUT) {
        mkdirSync(process.env.PDF_OUT, { recursive: true });
        writeFileSync(
          `${process.env.PDF_OUT}/${reportType}-empty.pdf`,
          Buffer.from(await e.blob.arrayBuffer()),
        );
        writeFileSync(
          `${process.env.PDF_OUT}/${reportType}-full.pdf`,
          Buffer.from(await f.blob.arrayBuffer()),
        );
      }
      expect(e.documentId).toBeNull();
      expect(await pages(e.blob)).toBe(1);
      expect(await pages(f.blob)).toBeGreaterThan(1);
      expect(f.fileName.endsWith("-v1.pdf")).toBe(true);
    });
  }
});
