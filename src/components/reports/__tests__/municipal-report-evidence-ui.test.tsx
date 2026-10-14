import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Report, ProjectDocument } from "@/lib/supabase/types";
import type { ProjectReportPreview } from "@/lib/report-engine";

const state = vi.hoisted(() => ({
  docs: [] as ProjectDocument[],
  error: null as Error | null,
  mutation: null as { onSuccess?: (output: unknown) => void } | null,
  success: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.docs, error: state.error, isLoading: false, refetch: vi.fn() }),
  useMutation: (options: { onSuccess?: (output: unknown) => void }) => {
    state.mutation = options;
    return { isPending: false, mutate: vi.fn() };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/services/documents-service", () => ({
  listDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  generateProjectReport: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: state.success, error: vi.fn() } }));
import { ProjectReportRecords } from "@/components/reports/ProjectReportRecords";
import { ReportPreviewCard } from "@/components/project/ReportPreviewCard";
import { DocumentList } from "@/components/documents/DocumentList";
import { GenerateReportDialog } from "@/components/documents/GenerateReportDialog";

const report: Report = {
  id: "r-a",
  project_id: "project-a",
  title: "Faktisk registreret titel",
  summary: "Indsendt resumé",
  status: "approved",
  period_start: "2026-01-01",
  period_end: null,
  report_type: "legacy",
  created_at: "2026-01-02T00:00:00Z",
};
const preview: ProjectReportPreview = {
  title: "FORKERT Q4 2099",
  reportingPeriod: "Q4 2099",
  readinessScore: 100,
  projectSummary: "Registreret beskrivelse",
  keyFindings: ["FABRIKERET FUND"],
  openRisks: ["AFLEDT RISIKO"],
  indicatorSummary: [{ label: "Måling", value: 2, unit: "m", trend: "up", status: "approved" }],
  recommendedActions: ["[Høj] Registreret opgave"],
  evidenceSummary: ["Dokumentregistrering"],
  dataSourcesSummary: ["Registreret kilde"],
  auditSummary: [],
};
const doc: ProjectDocument = {
  id: "d-a",
  project_id: "project-a",
  site_id: null,
  action_id: null,
  title: "PDF-registrering",
  document_type: "status",
  status: "generated",
  storage_path: null,
  file_name: "draft.pdf",
  file_size: 100,
  mime_type: "application/pdf",
  version: 1,
  generated_from: "auto:project-report",
  metadata: null,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
beforeEach(() => {
  state.docs = [];
  state.error = null;
  state.mutation = null;
  state.success.mockClear();
});

describe("truthful project report surfaces", () => {
  it("preserves actual matching project records without implying stored status proves review or file", () => {
    const html = renderToStaticMarkup(
      <ProjectReportRecords
        projectId="project-a"
        reports={[
          report,
          { ...report, id: "r-b", project_id: "project-b", title: "Fremmed rapport" },
        ]}
      />,
    );
    expect(html).toContain("Faktisk registreret titel");
    expect(html).toContain("Indsendt resumé");
    expect(html).toContain("Registreret status: approved");
    expect(html).toContain("ukendt slut");
    expect(html).toContain("rapportfil er ikke verificeret");
    expect(html).not.toContain("Fremmed rapport");
    expect(html).not.toContain("Download");
  });
  it("shows an empty state without inventing reports", () => {
    const html = renderToStaticMarkup(<ProjectReportRecords projectId="project-a" reports={[]} />);
    expect(html).toContain("Ingen rapportregistreringer for dette projekt");
    expect(html).toContain("Start i Grundlag");
    expect(html).not.toContain("approved");
  });
  it("suppresses derived period, readiness, findings and risk claims while preserving current recorded inputs", () => {
    const html = renderToStaticMarkup(<ReportPreviewCard preview={preview} />);
    for (const claim of ["Q4 2099", "100%", "FABRIKERET FUND", "AFLEDT RISIKO", "Rapportklarhed"])
      expect(html).not.toContain(claim);
    for (const actual of [
      "Registreret beskrivelse",
      "Måling",
      "2m",
      "Registreret opgave",
      "ikke fastlagt",
      "Droneobservationer",
    ])
      expect(html).toContain(actual);
  });
  it("distinguishes metadata-only, opaque and actual http(s) references and rejects executable links", () => {
    state.docs = [
      doc,
      { ...doc, id: "opaque", storage_path: "private/project/draft.pdf" },
      { ...doc, id: "url", storage_path: "https://example.org/actual.pdf" },
      { ...doc, id: "unsafe", storage_path: "javascript:alert(1)" },
    ];
    const html = renderToStaticMarkup(<DocumentList projectId="project-a" />);
    expect(html).toContain("PDF-filen er ikke gemt til genhentning");
    expect(html).toContain('href="https://example.org/actual.pdf"');
    expect(html).toContain("filreference (ikke verificeret)");
    expect(html).not.toContain('href="private/');
    expect(html).not.toContain("javascript:");
  });
  it("does not turn a failed document read into an empty project", () => {
    state.error = new Error("read unavailable");
    const html = renderToStaticMarkup(<DocumentList projectId="project-a" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("kunne ikke hentes");
    expect(html).not.toContain("Ingen dokumentregistreringer");
  });
  it.each([null, "document-a"])(
    "browser download distinguishes registration from file archival (%s)",
    (documentId) => {
      renderToStaticMarkup(
        <GenerateReportDialog
          project={{ id: "project-a" } as never}
          sites={[]}
          actions={[]}
          indicators={[]}
        />,
      );
      const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
      vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } });
      const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic");
      const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      try {
        state.mutation!.onSuccess!({
          documentId,
          blob: new Blob(["synthetic"]),
          fileName: "draft.pdf",
        });
        expect(anchor.click).toHaveBeenCalledOnce();
        expect(state.success).toHaveBeenCalledWith(
          expect.stringContaining(
            documentId ? "Kun dokumentregistreringen er gemt" : "Hverken filen",
          ),
        );
        expect(state.success.mock.calls[0][0]).not.toContain("Rapport genereret og gemt");
      } finally {
        create.mockRestore();
        revoke.mockRestore();
        vi.unstubAllGlobals();
      }
    },
  );
});
