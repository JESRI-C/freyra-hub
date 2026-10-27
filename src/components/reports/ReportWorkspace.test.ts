// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportRevision } from "@/lib/report-document";
import type { ReportTemplateId } from "@/lib/report-templates";

const state = vi.hoisted(() => ({
  auth: {
    currentOrg: { id: "org-a", name: "Organisation A", role: "owner" },
    currentProject: { id: "project-a", name: "Projekt A" },
    user: { id: "user-a" },
    session: null,
  },
  search: {} as { report?: string; version?: number; template?: ReportTemplateId },
  revisions: [] as ReportRevision[],
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => state.auth }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/report-draft.functions", () => ({ generateEvidenceReportDraft: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  useNavigate: () => vi.fn(),
  useRouterState: () => state.search,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey.length === 5 ? state.revisions : [],
    isLoading: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/components/ui-bits", () => ({
  Card: ({ children }: { children: unknown }) => children,
  PageHeader: () => null,
}));
vi.mock("@/services/report-document-service", () => ({
  getReportRevisions: vi.fn(),
  listReportDocuments: vi.fn(),
  loadReportSources: vi.fn(),
  loadReviewedReportObservations: vi.fn(),
  saveReportDocument: vi.fn(),
}));
vi.mock("@/services/report-assets", () => ({ buildReportImages: vi.fn() }));
vi.mock("@/lib/report-export", () => ({ downloadReportFile: vi.fn() }));

import { newReportContent } from "@/lib/report-document";
import { ReportWorkspace, reportSearch } from "./ReportWorkspace";

let root: Root;
let host: HTMLDivElement;
const firstSection = () => host.querySelector("textarea[aria-label]")?.getAttribute("aria-label");
async function render(mode: "new" | "builder") {
  await act(async () => root.render(createElement(ReportWorkspace, { mode })));
}
async function editOrder() {
  const down = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Flyt Konklusion og anbefalinger ned"]',
  );
  expect(down).not.toBeNull();
  await act(async () => down!.click());
  expect(firstSection()).toBe("Oversigtskort og dækning");
}

describe("real report editor draft hydration", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.auth = {
      currentOrg: { id: "org-a", name: "Organisation A", role: "owner" },
      currentProject: { id: "project-a", name: "Projekt A" },
      user: { id: "user-a" },
      session: null,
    };
    state.search = {};
    state.revisions = [];
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  it("opens a construction baseline using the selected project's existing report editor", async () => {
    state.search = reportSearch({ template: "construction_baseline" });
    await render("new");
    expect(host.querySelector("input")?.value).toBe("Projekt A - Naturbaseline for byggeprojekt");
    expect(firstSection()).toBe("Konklusion og anbefalinger");
    expect(host.textContent).toContain("Baselinedato og metode");
    expect(host.textContent).toContain("Myndighedsforhold og screening");
  });
  it("drops an unsupported template from a report URL", () => {
    expect(reportSearch({ template: "untrusted", report: "r", version: 2 })).toEqual({
      report: "r",
      version: 2,
      template: undefined,
    });
  });
  it("preserves a new draft when auth recreates the same organization and project", async () => {
    await render("new");
    await editOrder();
    state.auth = structuredClone(state.auth);
    await render("new");
    expect(firstSection()).toBe("Oversigtskort og dækning");
  });
  it("starts a fresh draft after selecting another project", async () => {
    await render("new");
    await editOrder();
    state.auth.currentProject = { id: "project-b", name: "Projekt B" };
    await render("new");
    expect(firstSection()).toBe("Konklusion og anbefalinger");
    expect(host.querySelector("input")?.value).toContain("Projekt B");
  });
  it("preserves edits when the same immutable revision is refetched", async () => {
    state.search = { report: "report-a", version: 1 };
    state.revisions = [
      {
        id: "revision-a",
        report_id: "report-a",
        version: 1,
        status: "draft",
        content: newReportContent("Projekt A", "Organisation A", "Baseline", "Kunde"),
        created_at: "2026-10-26T00:00:00Z",
        created_by: "user-a",
      },
    ];
    await render("builder");
    await editOrder();
    state.revisions = structuredClone(state.revisions);
    await render("builder");
    expect(firstSection()).toBe("Oversigtskort og dækning");
  });
  it("loads a deliberately selected different report revision", async () => {
    state.search = { report: "report-a", version: 1 };
    const content = newReportContent("Projekt A", "Organisation A", "Baseline", "Kunde");
    state.revisions = [
      {
        id: "revision-a",
        report_id: "report-a",
        version: 1,
        status: "draft",
        content,
        created_at: "2026-10-26T00:00:00Z",
        created_by: "user-a",
      },
    ];
    await render("builder");
    await editOrder();
    state.revisions.push({ ...state.revisions[0], id: "revision-b", version: 2 });
    state.search = { report: "report-a", version: 2 };
    await render("builder");
    expect(firstSection()).toBe("Konklusion og anbefalinger");
  });
});
