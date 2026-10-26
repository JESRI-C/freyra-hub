import { beforeEach, describe, expect, it, vi } from "vitest";
import { newReportContent } from "@/lib/report-document";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock }));
import { getReportRevisions, saveReportDocument } from "../report-document-service";
const content = newReportContent("Bykær", "Haderslev", "Scope", "Kunde");
const input = {
  organizationId: "org-a",
  projectId: "project-a",
  reportId: null,
  expectedVersion: 0,
  status: "draft" as const,
  content,
};
describe("report persistence", () => {
  beforeEach(() => vi.resetAllMocks());
  it("saves exact scope and content and requires a returned persistent id", async () => {
    mock.rpc.mockResolvedValue({
      data: { id: "revision", report_id: "report", version: 1, status: "draft", content },
      error: null,
    });
    const result = await saveReportDocument(input);
    expect(result.report_id).toBe("report");
    expect(mock.rpc).toHaveBeenCalledWith(
      "save_report_revision",
      expect.objectContaining({
        _organization_id: "org-a",
        _project_id: "project-a",
        _expected_version: 0,
        _content: content,
      }),
    );
  });
  it("does not synthesize a saved id when the database fails", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(saveReportDocument(input)).rejects.toThrow("permission denied");
    mock.rpc.mockResolvedValue({ data: {}, error: null });
    await expect(saveReportDocument(input)).rejects.toThrow("ingen gemt rapportversion");
  });
  it("rejects a report outside the active project before fetching its content", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mock.from.mockReturnValue(query);
    await expect(getReportRevisions("org-b", "project-b", "report-a")).rejects.toThrow(
      "tilhører ikke",
    );
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-b");
    expect(query.eq).toHaveBeenCalledWith("project_id", "project-b");
  });
  it("reads persisted versions on a new request rather than browser storage", async () => {
    const stored = { id: "rev", report_id: "r", version: 2, status: "draft", content };
    const scope = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "r" }, error: null }),
    };
    const revisions = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [stored], error: null }),
    };
    mock.from.mockImplementation((table: string) =>
      table === "report_documents" ? scope : revisions,
    );
    expect((await getReportRevisions("o", "p", "r"))[0].content).toEqual(content);
    expect((await getReportRevisions("o", "p", "r"))[0].version).toBe(2);
    expect(revisions.order).toHaveBeenCalledTimes(2);
  });
});
