import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Indicator } from "@/lib/supabase/types";
const state = vi.hoisted(() => ({
  insert: vi.fn(),
  audit: vi.fn(async () => {}),
  configured: false,
}));
vi.mock("@/lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
  supabase: {
    from: () => ({
      insert: (input: unknown) => {
        state.insert(input);
        return {
          select: () => ({
            single: async () => ({ data: { id: "synthetic-document" }, error: null }),
          }),
        };
      },
    }),
  },
}));
vi.mock("@/services/audit-service", () => ({ logAuditEvent: state.audit }));
import { generateProjectReport } from "@/services/documents-service";
const project = {
  id: "project-a",
  name: "Syntetisk projekt",
  project_type: "Vandløb",
  status: "active",
  geometry_area_ha: null,
  location_name: null,
  municipality: null,
} as Project;
beforeEach(() => {
  state.configured = false;
  state.insert.mockClear();
  state.audit.mockClear();
});
describe("actual generated project PDF draft", () => {
  it.each(["status", "indicator", "authority"] as const)(
    "embeds truthful unknowns in the actual %s PDF bytes",
    async (reportType) => {
      const out = await generateProjectReport({
        project,
        sites: [],
        actions: [],
        indicators: [],
        reportType,
      });
      const text = new TextDecoder("latin1").decode(await out.blob.arrayBuffer());
      expect(text).toMatch(/^%PDF-/);
      expect(text).toContain("Kladde:");
      expect(text).toContain("Rapporteringsperiode: ikke fastlagt.");
      expect(text).toContain("Fagligt review: ikke dokumenteret");
      expect(text).toContain("Droneobservationer og kilde-/fotoreferencer");
      expect(text).toContain("PDF-filen arkiveres ikke");
      expect(text).toContain("KLADDE - fagligt review ikke dokumenteret");
      for (const invented of ["Skalleb", "Emma Larsen", "Mikkel Holm", "82%", "91%", "Q2 2026"])
        expect(text).not.toContain(invented);
      expect(out.documentId).toBeNull();
      expect(state.insert).not.toHaveBeenCalled();
    },
  );
  it("keeps actual indicator input and the existing metadata-only persistence contract", async () => {
    state.configured = true;
    const out = await generateProjectReport({
      project,
      title: "Registreret titel",
      sites: [],
      actions: [],
      indicators: [
        {
          id: "indicator-a",
          project_id: "project-a",
          key: "synthetic",
          label: "Syntetisk indikator",
          category: null,
          value: 7,
          unit: "m",
          trend: null,
          status: null,
          updated_at: "2026-01-01T00:00:00Z",
        } satisfies Indicator,
      ],
      reportType: "status",
    });
    const text = new TextDecoder("latin1").decode(await out.blob.arrayBuffer());
    expect(text).toContain("Syntetisk indikator: 7 m");
    expect(text).toContain("Kladde: Registreret titel");
    expect(out.documentId).toBe("synthetic-document");
    expect(state.insert).toHaveBeenCalledOnce();
    expect(state.insert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        title: "Registreret titel",
        status: "generated",
        generated_from: "auto:project-report",
        version: 1,
      }),
    );
    expect(state.insert.mock.calls[0][0]).not.toHaveProperty("storage_path");
  });
});
