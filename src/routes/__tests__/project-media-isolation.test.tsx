// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  media: vi.fn(),
  preview: vi.fn(() => ({})),
  recommend: vi.fn(() => "Kontrollér grundlaget"),
  tab: "handlinger",
  task: "00000000-0000-4000-8000-000000000003",
}));
const project = {
  id: "00000000-0000-4000-8000-000000000001",
  organization_id: "00000000-0000-4000-8000-000000000002",
  slug: "pilot",
  name: "Pilot",
  municipality: "Haderslev",
  geometry_polygon: null,
  description: "Planlagt pleje",
};
function Editor({ name, task }: { name: string; task?: string }) {
  const [value, setValue] = useState("");
  return (
    <section aria-label={name} data-task={task}>
      <label>
        {name}
        <input aria-label={name} value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
    </section>
  );
}
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ slug: "pilot" }),
    useSearch: () => ({ tab: m.tab, task: m.task, work: "plan" }),
    useNavigate: () => vi.fn(),
  }),
  notFound: () => new Error("missing"),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "actor" }, currentOrg: { name: "Testorganisation" } }),
}));
vi.mock("@/lib/survey-round.functions", () => ({
  getSurveyRoundAccess: async () => ({ userId: "actor", canPersist: true }),
}));
vi.mock("@/lib/field-job-access.functions", () => ({
  getFieldJobAccess: async () => ({ userId: "actor", projectId: project.id, canContribute: true }),
}));
vi.mock("@/services/projects-service", () => ({
  getProjectBySlug: async () => project,
  getSitesByProject: async () => [],
  getDataSourcesByProject: async () => [],
}));
vi.mock("@/services/indicators-service", () => ({ getIndicatorsByProject: async () => [] }));
vi.mock("@/services/reports-service", () => ({ getReportsByProject: async () => [] }));
vi.mock("@/services/audit-service", () => ({
  getAuditEventsByProject: async () => [],
  auditEventIcon: () => "Activity",
}));
vi.mock("@/services/actions-service", () => ({
  getOpenActionsByProject: async () => [{ id: "legacy", title: "Åben legacyopgave" }],
  suggestSensorActions: () => [],
  actionPriorityTone: () => "default",
}));
vi.mock("@/services/evidence-service", () => ({ getEvidenceFilesByProject: async () => [] }));
vi.mock("@/services/observations-service", () => ({
  getObservationsByProject: async () => [],
  observationTypeLabel: () => "",
}));
vi.mock("@/services/monitoring/drone-upload-map-service", () => ({
  getDroneUploadMapOverview: async () => ({ points: [] }),
}));
vi.mock("@/services/project-media-service", () => ({ listProjectMedia: m.media }));
vi.mock("@/services/geo-service", () => ({
  resolveProjectGeometry: () => ({ hasValidGeometry: false, centroid: null }),
  validateProjectPolygon: () => ({ valid: false }),
}));
vi.mock("@/lib/report-engine", () => ({
  generateProjectReportPreview: m.preview,
  getRecommendedNextAction: m.recommend,
}));
vi.mock("@/components/project/ProjectHeader", () => ({
  ProjectHeader: ({ actionsCount, compact }: { actionsCount: number; compact?: boolean }) => (
    <header data-compact={compact}>Registrerede åbne handlinger: {actionsCount}</header>
  ),
}));
vi.mock("@/components/project/MunicipalCaseWorkspace", () => ({
  MunicipalCaseWorkspace: () => null,
  MUNICIPAL_STEPS: [{ id: "udfoerelse" }, { id: "baseline" }],
}));
vi.mock("@/components/project/DroneSurveyWorkspace", () => ({ DroneSurveyWorkspace: () => null }));
vi.mock("@/components/project/PublicBaselinePanel", () => ({ PublicBaselinePanel: () => null }));
vi.mock("@/components/project-workspace/ProjectMediaUploadPanel", () => ({
  ProjectMediaUploadPanel: () => null,
}));
vi.mock("@/components/project-workspace/ProjectPhotoAtlas", () => ({
  ProjectPhotoAtlas: () => null,
}));
vi.mock("@/components/project/ProjectWorkOrdersWorkspace", () => ({
  ProjectWorkOrdersWorkspace: ({ selectedActionId }: { selectedActionId?: string }) => (
    <Editor name="Arbejdsordrekladde" task={selectedActionId} />
  ),
}));
vi.mock("@/components/reports/WorkflowReportPanel", () => ({
  WorkflowReportPanel: () => <Editor name="Rapportvalg" />,
}));
vi.mock("@/components/reports/MunicipalReportPanel", () => ({
  MunicipalReportPanel: () => <Editor name="Kommunerapportkladde" />,
}));
vi.mock("@/components/project/WorkflowFollowupPanel", () => ({
  WorkflowFollowupPanel: () => null,
}));
vi.mock("@/components/project/DroneImageInspectionPanel", () => ({
  DroneImageInspectionPanel: () => null,
}));
vi.mock("@/components/reports/ProjectReportRecords", () => ({ ProjectReportRecords: () => null }));
vi.mock("@/components/project/ReportPreviewCard", () => ({
  ReportPreviewCard: () => <div>Kontrolleret projektpreview</div>,
}));
vi.mock("@/components/documents/GenerateReportDialog", () => ({
  GenerateReportDialog: () => <Editor name="PDF-kladdetype" />,
}));
vi.mock("@/components/documents/DocumentList", () => ({ DocumentList: () => null }));
vi.mock("@/services/documents-service", () => ({
  listDocuments: async () => [],
  computeDocumentationScore: () => ({}),
}));
import { Route } from "../app.projects.$slug";

let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <React.Suspense fallback={<p>Henter kernegrundlag</p>}>
          {React.createElement(Route.options.component as React.ComponentType)}
        </React.Suspense>
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function edit(name: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  m.tab = "handlinger";
  m.task = "00000000-0000-4000-8000-000000000003";
  m.media.mockResolvedValue({ data: [], error: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  for (const prefix of [
    "indicators",
    "reports",
    "audit",
    "actions",
    "evidence",
    "observations",
    "sites",
    "data-sources",
  ])
    cache.setQueryData(
      [prefix, project.id],
      prefix === "actions" ? [{ id: "legacy", title: "Åben legacyopgave" }] : [],
    );
  cache.setQueryData(["project-by-slug", "pilot"], project);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
describe("project route during signed media outage", () => {
  it("focuses only a selected job and returns to full project context without remounting visited drafts", async () => {
    await render();
    expect(host.querySelector("header[data-compact]")?.getAttribute("data-compact")).toBe("true");
    expect(host.querySelector('[aria-label="Formål og resultat"]')?.closest("details")?.open).toBe(
      false,
    );
    await edit("Arbejdsordrekladde", "Bevar valgt jobs kladde");
    const editor = host.querySelector('input[aria-label="Arbejdsordrekladde"]')!;
    m.tab = "rapporter";
    await render();
    expect(host.querySelector("header[data-compact]")?.getAttribute("data-compact")).toBe("false");
    m.tab = "handlinger";
    m.task = "";
    await render();
    expect(host.querySelector("header[data-compact]")?.getAttribute("data-compact")).toBe("false");
    expect(host.querySelector('input[aria-label="Arbejdsordrekladde"]')).toBe(editor);
    expect((editor as HTMLInputElement).value).toBe("Bevar valgt jobs kladde");
    expect(host.querySelector('[aria-label="Formål og resultat"]')?.closest("details")).toBeNull();
  });
  it("does not hold the task editor behind a pending media request or invent an empty report input", async () => {
    let finish!: (value: unknown) => void;
    m.media.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render();
    expect(host.querySelector('[aria-label="Arbejdsordrekladde"]')).not.toBeNull();
    expect(m.preview).not.toHaveBeenCalled();
    expect(m.recommend).not.toHaveBeenCalled();
    await act(async () => finish({ data: [], error: null }));
    await flush();
    expect(m.preview).toHaveBeenCalledWith(expect.objectContaining({ mediaItems: [] }));
  });
  it("opens the exact existing task and preserves its editor when the initial media request fails", async () => {
    m.media.mockResolvedValue({ data: null, error: "Private signing server unavailable" });
    await render();
    expect(m.media).toHaveBeenCalledWith(project.id);
    expect(host.querySelector('[aria-label="Arbejdsordrekladde"]')?.getAttribute("data-task")).toBe(
      m.task,
    );
    await edit("Arbejdsordrekladde", "Feltinstruktion under arbejde");
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="Arbejdsordrekladde"]')?.value,
    ).toBe("Feltinstruktion under arbejde");
    expect(host.textContent).toContain("Registrerede åbne handlinger: 1");
    expect(host.textContent).not.toContain("Værktøjet kunne ikke åbnes");
    expect(m.preview).not.toHaveBeenCalled();
    expect(m.recommend).not.toHaveBeenCalled();
  });
  it("retains visited report drafts through a background signing failure and resumes only on checked success", async () => {
    m.tab = "rapporter";
    m.media.mockResolvedValue({ data: [{ id: "photo", title: "Gemt foto" }], error: null });
    await render();
    await edit("Rapportvalg", "Min valgte rapport");
    await edit("Kommunerapportkladde", "Ugemt tekst");
    await edit("PDF-kladdetype", "Valgt type");
    expect(host.textContent).toContain("Kontrolleret projektpreview");
    m.tab = "handlinger";
    await render();
    await edit("Arbejdsordrekladde", "Min opgavekladde");
    m.preview.mockClear();
    m.recommend.mockClear();
    m.media.mockResolvedValue({ data: null, error: "Signing failed during refresh" });
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ["project-media", project.id] });
    });
    await flush();
    expect(m.preview).not.toHaveBeenCalled();
    expect(m.recommend).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="Arbejdsordrekladde"]')?.value,
    ).toBe("Min opgavekladde");
    m.tab = "rapporter";
    await render();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Rapportvalg"]')?.value).toBe(
      "Min valgte rapport",
    );
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="Kommunerapportkladde"]')?.value,
    ).toBe("Ugemt tekst");
    expect(host.querySelector<HTMLInputElement>('input[aria-label="PDF-kladdetype"]')?.value).toBe(
      "Valgt type",
    );
    expect(host.textContent).not.toContain("Kontrolleret projektpreview");
    expect(host.textContent).toContain("Mediegrundlaget er uafklaret");
    m.media.mockResolvedValue({ data: [], error: null });
    const retry = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Hent medier igen",
    )!;
    await act(async () => retry.click());
    await flush();
    expect(m.preview).toHaveBeenCalledWith(expect.objectContaining({ mediaItems: [] }));
    expect(host.textContent).toContain("Kontrolleret projektpreview");
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Rapportvalg"]')?.value).toBe(
      "Min valgte rapport",
    );
  });
});
