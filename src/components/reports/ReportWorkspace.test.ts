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
vi.mock("@/lib/work-order-evidence.functions", () => ({
  getProjectWorkOrderEvidenceOriginal: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    hash,
    search,
  }: {
    children: string;
    hash?: string;
    search?: { task?: string; work?: string };
  }) =>
    createElement(
      "a",
      { "data-hash": hash, "data-task": search?.task, "data-work": search?.work },
      children,
    ),
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
vi.mock("@/components/project/WorkOrderFollowUps", () => ({
  WorkOrderFollowUps: ({
    actorId,
    scope,
    actionId,
    canShift,
  }: {
    actorId: string;
    scope: { organizationId: string; projectId: string };
    actionId: string;
    canShift?: boolean;
  }) =>
    createElement("p", {
      "data-follow-ups": [actorId, scope.organizationId, scope.projectId, actionId].join("/"),
      "data-can-shift": String(!!canShift),
    }),
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

import {
  newReportContent,
  ReportContentSchema,
  validateReportRevision,
} from "@/lib/report-document";
import {
  loadReportSources,
  loadReviewedReportObservations,
  saveReportDocument,
} from "@/services/report-document-service";
import { buildReportImages } from "@/services/report-assets";
import { downloadReportFile } from "@/lib/report-export";
import { ReportWorkspace, reportSearch } from "./ReportWorkspace";

let root: Root;
let host: HTMLDivElement;
const firstSection = () => host.querySelector("textarea[aria-label]")?.getAttribute("aria-label");
async function render(mode: "new" | "builder" | "preview" | "readiness" | "approval") {
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
  it("imports only cited observation photos, preserving the prior revision, the method and other sections' registration sources", async () => {
    const original = newReportContent("Projekt A", "Organisation A", "Område", "Kunde");
    const field = {
      id: "field:old",
      title: "Feltregistrering",
      kind: "Felt",
      capturedAt: null,
      checksum: "a".repeat(64),
      position: null,
      method: "Visuel",
      version: "1",
    };
    const oldPhoto = { ...field, id: "media:selected", title: "Tidligere titel" };
    original.sources = [field, oldPhoto];
    original.sections[0].sourceIds = [field.id];
    original.sections[0].text = "Andre registreringer";
    original.sections[0].reviewed = true;
    original.sections[1].sourceIds = [oldPhoto.id];
    original.sections[1].reviewed = true;
    const latest: ReportRevision = {
      id: "revision-a",
      report_id: "report-a",
      version: 1,
      status: "draft",
      created_at: "2026-11-17T10:00:00Z",
      created_by: "user-a",
      content: original,
    };
    state.revisions = [latest];
    state.search = { report: "report-a", version: 1 };
    const previous = structuredClone(latest);
    await render("builder");
    const click = async (label: string) =>
      act(async () =>
        [...host.querySelectorAll("button")]
          .find((button) => button.textContent === label)!
          .click(),
      );
    const pick = "Indlæs godkendte observationer";
    const used = { ...field, id: "media:selected", title: "DJI_0239.JPG" };
    const observation = {
      comparison: null,
      screening: true,
      sourceIds: [used.id],
      text: "Bykær Bæk · station 100–250 m. Artsforslag.",
    };
    vi.mocked(loadReviewedReportObservations).mockResolvedValueOnce([observation]);
    vi.mocked(loadReportSources).mockResolvedValueOnce([
      used,
      { ...field, id: "media:unused", checksum: null },
    ]);
    await click(pick);
    vi.mocked(loadReviewedReportObservations).mockResolvedValueOnce([]);
    vi.mocked(loadReportSources).mockResolvedValueOnce([]);
    await click(pick);
    vi.mocked(loadReviewedReportObservations).mockResolvedValueOnce([observation]);
    vi.mocked(loadReportSources).mockResolvedValueOnce([]);
    await click(pick);
    expect(host.textContent).toContain("kildefotos til observationerne kunne ikke hentes");
    vi.mocked(saveReportDocument).mockResolvedValueOnce({ ...latest, version: 2 });
    await click("Gem kladde som ny version");
    const saved = vi.mocked(saveReportDocument).mock.lastCall![0].content;
    expect(saved.sources.map((source) => source.id)).toEqual([field.id, used.id]);
    expect(saved.sections[0]).toEqual(previous.content.sections[0]);
    expect(saved.sections[1].reviewed).toBe(false);
    expect(saved.sections.find(({ id }) => id === "section-4")).toMatchObject({
      sourceIds: [used.id],
      text: observation.text,
      basis: "screening",
      reviewed: false,
    });
    expect(latest).toEqual(previous);
    const { reportLines } =
      await vi.importActual<typeof import("@/lib/report-export")>("@/lib/report-export");
    expect(reportLines({ ...latest, version: 2, content: saved }).join("\n")).toContain(
      observation.text,
    );
  });
  it("saves a visually chosen map viewport on a new revision and restores automatic overview on request", async () => {
    const content = newReportContent("Projekt A", "Organisation A", "Scope", "Kunde");
    const revision: ReportRevision = { id: "map-revision", report_id: "map-report", version: 1, status: "draft",
      created_at: "2026-11-17T12:00:00Z", created_by: "user-a", content };
    state.revisions = [revision];
    state.search = { report: revision.report_id, version: revision.version };
    await render("builder");
    const button = (name: string) => [...host.querySelectorAll("button")].find(b => b.textContent === name)!;
    await act(async () => button("Vælg kortudsnit").click());
    const map = host.querySelector<SVGElement>('svg[aria-label^="Kortudsnit"]')!;
    expect(map.querySelectorAll("image").length).toBeGreaterThan(0);
    await act(async () => { map.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true})); });
    await act(async () => button("Zoom ind").click());
    await act(async () => button("Brug dette kortudsnit").click());
    vi.mocked(saveReportDocument).mockResolvedValueOnce({ ...revision, version: 2 });
    await act(async () => button("Gem kladde som ny version").click());
    const saved = vi.mocked(saveReportDocument).mock.lastCall![0].content.mapViewport;
    expect(saved?.center[0]).toBeGreaterThan(0);
    expect(saved?.zoom).toBe(3);
    expect(revision.content.mapViewport).toBeUndefined();
    await act(async () => button("Rediger kortudsnit").click());
    await act(async () => button("Brug automatisk oversigt").click());
    expect(button("Vælg kortudsnit")).toBeTruthy();
  });
  it("saves only the selected watercourse reference alongside the practitioner's editable text", async () => {
    const content = newReportContent("Projekt A", "Organisation A", "Scope", "Kunde");
    const section = content.sections[2];
    section.text = "Tidligere feltbesøg er omtalt i projektjournalen.";
    section.reviewed = true;
    const revision: ReportRevision = {
      id: "method-revision",
      report_id: "method-report",
      version: 1,
      status: "draft",
      created_at: "2026-11-17T12:00:00Z",
      created_by: "user-a",
      content,
    };
    state.revisions = [revision];
    state.search = { report: revision.report_id, version: revision.version };
    await render("builder");
    const picker = [...host.querySelectorAll("fieldset")].find(
      (fieldset) => fieldset.querySelector("legend")?.textContent === "Metodebibliotek for vandløb",
    )!;
    const select = picker.querySelector("select")!;
    const editor = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Datagrundlag og metode"]',
    )!;
    expect(select.value).toBe("");
    expect([...select.options].slice(1).map((option) => option.textContent)).toEqual([
      expect.stringMatching(/V05 .*version 3\.0/),
      expect.stringMatching(/V07 .*version 2\.7/),
      expect.stringMatching(/V17 .*version 3\.0/),
      expect.stringMatching(/V18 .*version 8\.3/),
    ]);
    await act(async () => {
      select.value = select.options[3].value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const url = picker.querySelector("a")!.href;
    expect(url).toBe(
      "https://ecos.au.dk/fileadmin/ecos/Fagdatacentre/Ferskvand/V17_Revision_version3.0_final.pdf",
    );
    expect(editor.value).toBe(section.text);
    await act(async () => picker.querySelector("button")!.click());
    expect(picker.querySelector("button")!.disabled).toBe(true);
    expect(editor.value).toContain(section.text);
    expect(editor.value).toContain("TA V17, version 3.0");
    expect(editor.value).toContain(url);
    expect(editor.value).toContain("Skråfotos alene");
    expect(editor.value).not.toContain("TA V05");
    vi.mocked(saveReportDocument).mockResolvedValueOnce({ ...revision, version: 2 });
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Gem kladde som ny version")!
        .click(),
    );
    const saved = vi.mocked(saveReportDocument).mock.lastCall![0].content;
    expect(saved.sections[2]).toEqual({ ...section, text: editor.value, reviewed: false });
    expect(saved.sources).toEqual([]);
    expect(section.text).toBe("Tidligere feltbesøg er omtalt i projektjournalen.");
    const { buildDocx, reportLines } =
      await vi.importActual<typeof import("@/lib/report-export")>("@/lib/report-export");
    const frozen = { ...revision, version: 2, content: saved };
    expect(reportLines(frozen)).toContain(editor.value);
    expect(new TextDecoder().decode(buildDocx(frozen))).toContain(url);
  });
  it("requires explicit selection of the scoped habitat protocol and preserves the baseline's missing evidence", async () => {
    state.search = { template: "nature_baseline" };
    await render("new");
    expect(host.textContent).not.toContain("Metodebibliotek for vandløb");
    const picker = [...host.querySelectorAll("fieldset")].find((fieldset) =>
      fieldset.querySelector("legend")?.textContent?.includes("lysåben habitatnatur"),
    )!;
    const select = picker.querySelector("select")!;
    const editor = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Baselinedato og registreringsmetode"]',
    )!;
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe("");
    await act(async () => {
      select.value = select.options[1].value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(picker.textContent).toContain("inden for habitatområderne");
    expect(picker.textContent).toContain("dokumentationsfeltet");
    expect(editor.value).toBe("");
    await act(async () => picker.querySelector("button")!.click());
    expect(editor.value).toContain("TA N03, version 1");
    expect(editor.value).toContain("afventer grundlaget for en N03-vurdering faglig gennemgang");
    expect(editor.value).toContain(picker.querySelector("a")!.href);
    expect(
      host.querySelector<HTMLSelectElement>(
        'select[aria-label="Grundlag for Baselinedato og registreringsmetode"]',
      )!.value,
    ).toBe("not_measured");
    state.search = { template: "biodiversity" };
    await render("new");
    expect(host.textContent).not.toContain("Metodebibliotek for lysåben habitatnatur");
  });
  it("links an unknown source issue to its section and lets the editor remove the stale reference", async () => {
    const content = newReportContent("Projekt A", "Organisation A", "Scope", "Kunde");
    const section = content.sections[0];
    section.sourceIds = ["stale-source"];
    state.search = { report: "report-a", version: 1 };
    state.revisions = [
      {
        id: "revision-a",
        report_id: "report-a",
        version: 1,
        status: "draft",
        created_at: "2026-11-17T12:00:00Z",
        created_by: "user-a",
        content,
      },
    ];
    await render("readiness");
    const hash = `rapport-afsnit-${section.id}`;
    expect(
      [...host.querySelectorAll(`[data-hash="${hash}"]`)].some((link) =>
        link.textContent?.includes("stale-source"),
      ),
    ).toBe(true);

    await render("builder");
    expect(host.querySelector(`#${hash}`)?.textContent).toBe(section.title);
    const remove = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Fjern ukendte kildehenvisninger fra afsnittet",
    );
    expect(remove).toBeDefined();
    await act(async () => remove!.click());
    expect(host.contains(remove!)).toBe(false);
  });
  it("submits a correction request against the version selected for approval", async () => {
    const content = newReportContent("Projekt A", "Organisation A", "Scope", "Kunde");
    content.workflowSnapshot = {
      schema: "freyra.workflow-report/v1",
      generatorVersion: "workflow-report/v1",
      organizationId: "org-a",
      projectId: "project-a",
      dataBasis: "real",
      inputs: [],
      baselines: [],
      plans: [],
      rounds: [],
      limitations: [],
      review: null,
    };
    const revision: ReportRevision = {
      id: "revision-a",
      report_id: "report-a",
      version: 1,
      status: "review",
      created_at: "2026-11-17T12:00:00Z",
      created_by: "user-a",
      content,
    };
    state.search = { report: revision.report_id, version: revision.version };
    state.revisions = [revision];
    vi.mocked(saveReportDocument).mockResolvedValueOnce({ ...revision, version: 2 });
    await render("approval");
    const reason = host.querySelector("textarea")!;
    const request = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Gem anmodning om rettelser",
    )!;
    expect(request.disabled).toBe(true);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        reason,
        "Tilføj kortkilden.",
      );
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(request.disabled).toBe(false);
    await act(async () => request.click());
    expect(saveReportDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: "report-a",
        expectedVersion: 1,
        status: "review",
        content: expect.objectContaining({
          workflowSnapshot: expect.objectContaining({
            review: expect.objectContaining({
              decision: "changes_requested",
              reason: "Tilføj kortkilden.",
            }),
          }),
        }),
      }),
    );
  });
  it("returns a baseline section to its author and approves the corrected resubmission on the same report", async () => {
    const content = newReportContent("Projekt A", "Organisation A", "Scope", "Kunde");
    const source = {
      id: "media:41124d67-cc13-40b7-b12b-fea47882ac49",
      title: "Feltfoto",
      kind: "foto",
      capturedAt: null,
      checksum: "a".repeat(64),
      position: null,
      method: "Foto",
      version: "1",
    };
    content.sources = [source];
    content.sections.forEach((section) =>
      Object.assign(section, {
        text: "Projektets observation.",
        sourceIds: [source.id],
        basis: "observed",
        reviewed: true,
      }),
    );
    content.sections[0].text = "";
    const first: ReportRevision = {
      id: "revision-1",
      report_id: "report-a",
      version: 1,
      status: "draft",
      content,
      created_at: "2026-11-17T10:00:00Z",
      created_by: "user-a",
    };
    state.revisions = [first];
    const openLatest = async (mode: "approval" | "builder") => {
      state.search = { report: first.report_id, version: state.revisions[0].version };
      await render(mode);
    };
    const button = (label: string) =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;
    const enterText = async (field: HTMLTextAreaElement, value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
          field,
          value,
        );
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    const save = vi.mocked(saveReportDocument);
    save.mockImplementation(async (input) => {
      expect(input.reportId).toBe(first.report_id);
      expect(input.expectedVersion).toBe(state.revisions[0].version);
      validateReportRevision(input.content, input.status);
      const version = input.expectedVersion + 1;
      const saved = {
        ...first,
        id: "revision-" + version,
        status: input.status,
        version,
        content: ReportContentSchema.parse(input.content),
      };
      state.revisions = [saved, ...state.revisions];
      return saved;
    });
    try {
      await openLatest("approval");
      expect(button("Godkend som ny version").disabled).toBe(true);
      await act(async () => button("Registrér til gennemgang").click());
      await openLatest("approval");
      const section = host.querySelector("fieldset select") as HTMLSelectElement;
      await act(async () => {
        section.value = "section-1";
        section.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(button("Send tilbage til rettelse").disabled).toBe(true);
      await enterText(host.querySelector("textarea")!, "Beskriv hvad feltfotoet viser.");
      await act(async () => button("Send tilbage til rettelse").click());
      const returned = state.revisions[0];
      expect(returned.content.requestedCorrection).toEqual({
        reviewedVersion: 2,
        sectionId: "section-1",
        reason: "Beskriv hvad feltfotoet viser.",
      });
      expect(returned.content.sections[0].reviewed).toBe(false);
      await openLatest("approval");
      expect(button("Registrér til gennemgang").disabled).toBe(true);
      await openLatest("builder");
      expect(host.textContent).toContain("Beskriv hvad feltfotoet viser.");
      await enterText(
        host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Konklusion og anbefalinger"]')!,
        "Feltfotoet viser en vegetationsbræmme.",
      );
      const reReview = [...host.querySelectorAll("label")].find((label) =>
        label.textContent?.includes("Jeg har fagligt gennemgået afsnittet"),
      );
      await act(async () => reReview!.querySelector("input")!.click());
      await act(async () => button("Gem kladde som ny version").click());
      await openLatest("approval");
      expect(button("Godkend som ny version").disabled).toBe(true);
      expect(button("Registrér til gennemgang").disabled).toBe(false);
      await act(async () => button("Registrér til gennemgang").click());
      await openLatest("approval");
      expect(button("Godkend som ny version").disabled).toBe(false);
      await act(async () => button("Godkend som ny version").click());
      expect(state.revisions.map((r) => [r.version, r.status])).toEqual([
        [6, "approved"],
        [5, "review"],
        [4, "draft"],
        [3, "draft"],
        [2, "review"],
        [1, "draft"],
      ]);
      expect(state.revisions[0].content.requestedCorrection).toBeUndefined();
      expect(state.revisions[0].content.sections[0].text).toBe(
        "Feltfotoet viser en vegetationsbræmme.",
      );
      expect(returned.content.sections[0].text).toBe("");
      expect(first.content.sections[0].reviewed).toBe(true);
    } finally {
      save.mockReset();
    }
  });
  it("renders the saved revision's map on direct PDF export and reuses it for DOCX", async () => {
    const revision: ReportRevision = {
      id: "map-revision",
      report_id: "map-report",
      version: 3,
      status: "approved",
      created_at: "2026-11-17T12:00:00Z",
      created_by: "user-a",
      content: newReportContent("Projekt A", "Organisation A", "Scope", "Kunde"),
    };
    state.search = { report: revision.report_id, version: revision.version };
    state.revisions = [revision];
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL() {
          return "blob:map";
        }
        static revokeObjectURL() {}
      },
    );
    const images = [
      {
        id: "map",
        caption: "Kortbilag",
        format: "jpeg" as const,
        bytes: Uint8Array.of(1),
        width: 1,
        height: 1,
      },
    ];
    vi.mocked(buildReportImages).mockClear().mockResolvedValueOnce(images);
    vi.mocked(downloadReportFile)
      .mockClear()
      .mockResolvedValue({ filename: "rapport.pdf", checksum: "test" } as never);

    await render("preview");
    for (const format of ["PDF", "DOCX"]) {
      const button = [...host.querySelectorAll("button")].find((b) => b.textContent === format)!;
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
      expect(downloadReportFile).toHaveBeenLastCalledWith(revision, format.toLowerCase(), images);
    }
    expect(buildReportImages).toHaveBeenCalledExactlyOnceWith(revision);
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
  it("preserves edits made while the source register is loading", async () => {
    let finish!: (sources: []) => void;
    vi.mocked(loadReportSources).mockReturnValueOnce(
      new Promise<[]>((resolve) => {
        finish = resolve;
      }),
    );
    await render("new");
    const load = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Indlæs projektets kilderegister",
    );
    await act(async () => load!.click());
    await editOrder();
    await act(async () => finish([]));
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
  it("shows the approved basis, links to the task and enables direct PDF download", async () => {
    state.search = { report: "report-a", version: 1 };
    state.revisions = [
      {
        id: "revision-a",
        report_id: "report-a",
        version: 1,
        status: "draft",
        created_at: "2026-10-26T00:00:00Z",
        created_by: "user-a",
        content: {
          ...newReportContent("Projekt A", "Organisation A", "Udførelse", "Projektleder"),
          workOrderApproval: {
            actionId: "task-a",
            reviewId: "review-a",
            submissionId: "submission-a",
            submissionVersion: 3,
            basisHash: "a".repeat(64),
          },
        },
      },
    ];
    await render("preview");
    expect(host.textContent).toContain("Rapportkladde · Version 1");
    expect(host.textContent).toContain("Godkendt afleveringsversion 3");
    expect(host.textContent).toContain("Registreringstype ikke gemt i rapportversionen");
    expect(host.querySelector('[data-task="task-a"][data-work="submission"]')).not.toBeNull();
    expect(
      host.querySelector(
        '[data-follow-ups="user-a/org-a/project-a/task-a"][data-can-shift="false"]',
      ),
    ).not.toBeNull();
    const pdf = [...host.querySelectorAll("button")].find((b) => b.textContent === "PDF");
    expect(pdf?.disabled).toBe(false);
    expect(host.textContent).not.toContain("Vis kort og fotoatlas før PDF/DOCX-eksport");
    state.auth.currentOrg.role = "viewer";
    await render("preview");
    expect(host.querySelector("[data-follow-ups]")).toBeNull();
    expect(host.querySelector('[data-task="task-a"][data-work="submission"]')).not.toBeNull();
  });
  it.each([
    ["synthetic", "Syntetiske prøvedata"],
    ["demo", "Demonstrationsdata"],
    ["real", "Udførelsesregistrering: Faktisk arbejde"],
  ] as const)(
    "shows the frozen %s classification separately from an approved packet",
    async (executionDataBasis, label) => {
      state.search = { report: "report-a", version: 1 };
      state.revisions = [
        {
          id: "revision-a",
          report_id: "report-a",
          version: 1,
          status: "draft",
          created_at: "2026-11-04T08:00:00Z",
          created_by: "user-a",
          content: {
            ...newReportContent("TEST", "TEST", "Udførelse", "TEST"),
            workOrderApproval: {
              actionId: "task-a",
              submissionId: "submission-a",
              submissionVersion: 1,
              reviewId: "review-a",
              basisHash: "a".repeat(64),
              executionRevisionId: "00000000-0000-4000-8000-000000000004",
              executionDataBasis,
            },
          },
        },
      ];
      await render("preview");
      const notice = host.querySelector('[aria-label="Udførelsens datagrundlag"]');
      expect(notice?.textContent).toContain(label);
      expect(notice?.textContent).toContain("natureffekt");
      expect(host.textContent).toContain("Godkendt afleveringsversion 1");
    },
  );
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
