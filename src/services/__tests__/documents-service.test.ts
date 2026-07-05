import { describe, it, expect } from "vitest";
import { computeDocumentationScore } from "../documents-service";
import type { Project, Site, Action, Indicator, ProjectDocument } from "@/lib/supabase/types";

const project: Project = {
  id: "p1",
  organization_id: "o1",
  name: "Test",
  slug: "test",
  project_type: "Biodiversitet",
  location_name: null,
  municipality: null,
  country: "Denmark",
  status: "active",
  start_date: null,
  end_date: null,
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  geometry_polygon: null,
  geometry_centroid_lat: null,
  geometry_centroid_lng: null,
  geometry_area_ha: null,
  geometry_source: null,
};

describe("computeDocumentationScore", () => {
  it("scores 0 on an empty project", () => {
    const r = computeDocumentationScore({
      project,
      sites: [],
      actions: [],
      indicators: [],
      documents: [],
      evidenceCountByAction: {},
    });
    expect(r.score).toBe(0);
    expect(r.breakdown.every((b) => !b.ok)).toBe(true);
  });

  it("scores 100 when everything is populated", () => {
    const filled: Project = { ...project, description: "En længere beskrivelse af projektet.", geometry_area_ha: 5 };
    const site = { id: "s1", project_id: "p1", name: "Site", area_type: "meadow", area_ha: 1, created_at: "", geojson: null } as unknown as Site;
    const ind = { id: "i1", project_id: "p1", key: "k", label: "L", category: null, value: 1, unit: "%", trend: null, status: null, threshold_warning: 30, threshold_critical: 20, threshold_direction: "below", updated_at: "" } as Indicator;
    const doneAction = { id: "a1", project_id: "p1", title: "A", description: null, status: "Færdig", priority: "Medium", assigned_to: null, due_date: null, completed_at: "2026-02-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" } as unknown as Action;
    const openAction = { ...doneAction, id: "a2", status: "I gang", completed_at: null } as Action;
    const doc = { id: "d1", project_id: "p1", title: "R", file_url: null, doc_type: "status", version: 1, created_at: "" } as unknown as ProjectDocument;
    const r = computeDocumentationScore({
      project: filled,
      sites: [site],
      actions: [doneAction, openAction],
      indicators: [ind],
      documents: [doc],
      evidenceCountByAction: { a1: 2 },
    });
    expect(r.score).toBe(100);
  });

  it("penalises missing evidence on recent completed actions", () => {
    const done = { id: "a1", project_id: "p1", title: "A", status: "Færdig", priority: "Medium", completed_at: "2026-02-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" } as unknown as Action;
    const r = computeDocumentationScore({
      project,
      sites: [],
      actions: [done],
      indicators: [],
      documents: [],
      evidenceCountByAction: {},
    });
    const evidenceItem = r.breakdown.find((b) => b.label.startsWith("Foto"));
    expect(evidenceItem?.ok).toBe(false);
    expect(evidenceItem?.hint).toContain("mangler");
  });
});
