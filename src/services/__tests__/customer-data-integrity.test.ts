import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_INDICATORS, SEED_PROJECTS } from "@/test/fixtures/platform-seed";

const mocks = vi.hoisted(() => {
  const reportResult = vi.fn();
  const reportInsert = vi.fn(() => ({ select: () => ({ single: reportResult }) }));
  return {
    configured: true,
    from: vi.fn(() => ({ insert: reportInsert })),
    reportInsert,
    reportResult,
    logAuditEvent: vi.fn(),
    queries: {
      fetchProjects: vi.fn(),
      fetchProjectBySlug: vi.fn(),
      fetchProjectById: vi.fn(),
      fetchSitesByProject: vi.fn(),
      fetchDataSourcesByProject: vi.fn(),
      insertProject: vi.fn(),
      updateProject: vi.fn(),
      fetchIndicatorsByProject: vi.fn(),
      fetchIndicator: vi.fn(),
      upsertIndicator: vi.fn(),
      fetchMeasurementsForIndicator: vi.fn(),
      insertMeasurement: vi.fn(),
      updateIndicatorConfig: vi.fn(),
      updateReport: vi.fn(),
      fetchReportsByProject: vi.fn(),
      fetchAllReports: vi.fn(),
    },
  };
});

vi.mock("@/lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return mocks.configured;
  },
  get supabase() {
    return mocks.configured ? { from: mocks.from } : null;
  },
}));
vi.mock("@/lib/supabase/queries", () => mocks.queries);
vi.mock("@/services/audit-service", () => ({
  logAuditEvent: mocks.logAuditEvent,
  getAuditEventsByProject: vi.fn(),
}));
vi.mock("@/services/actions-service", () => ({ createAction: vi.fn() }));

const project = SEED_PROJECTS[0];
const indicator = SEED_INDICATORS[0];

async function loadReaders() {
  const [projects, indicators, reports] = await Promise.all([
    import("../projects-service"),
    import("../indicators-service"),
    import("../reports-service"),
  ]);
  return [
    {
      name: "projects",
      query: mocks.queries.fetchProjects,
      read: () => projects.getProjects(project.organization_id ?? undefined),
      empty: [],
    },
    {
      name: "project by slug",
      query: mocks.queries.fetchProjectBySlug,
      read: () => projects.getProjectBySlug(project.slug!),
      empty: null,
    },
    {
      name: "project by id",
      query: mocks.queries.fetchProjectById,
      read: () => projects.getProjectById(project.id),
      empty: null,
    },
    {
      name: "sites",
      query: mocks.queries.fetchSitesByProject,
      read: () => projects.getSitesByProject(project.id),
      empty: [],
    },
    {
      name: "data sources",
      query: mocks.queries.fetchDataSourcesByProject,
      read: () => projects.getDataSourcesByProject(project.id),
      empty: [],
    },
    {
      name: "indicators",
      query: mocks.queries.fetchIndicatorsByProject,
      read: () => indicators.getIndicatorsByProject(indicator.project_id!),
      empty: [],
    },
    {
      name: "indicator",
      query: mocks.queries.fetchIndicator,
      read: () => indicators.getIndicator(indicator.project_id!, indicator.key),
      empty: null,
    },
    {
      name: "measurements",
      query: mocks.queries.fetchMeasurementsForIndicator,
      read: () => indicators.getMeasurements(indicator, "all"),
      empty: [],
    },
    {
      name: "project reports",
      query: mocks.queries.fetchReportsByProject,
      read: () => reports.getReportsByProject(project.id),
      empty: [],
    },
    {
      name: "all reports",
      query: mocks.queries.fetchAllReports,
      read: () => reports.getAllReports(),
      empty: [],
    },
  ];
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_APP_DATA_MODE", "customer");
  mocks.configured = true;
  for (const query of Object.values(mocks.queries)) query.mockReset();
  mocks.from.mockClear();
  mocks.reportInsert.mockClear();
  mocks.reportResult.mockReset();
  mocks.logAuditEvent.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("customer data integrity", () => {
  it("creates only the requested project and its audit event", async () => {
    const { createProject } = await import("../projects-service");
    const input = { name: "Bykær Bæk", slug: "bykaer-baek", organization_id: "customer-org" };
    const created = { id: "customer-project", slug: input.slug };
    mocks.queries.insertProject.mockResolvedValue(created);

    await expect(createProject(input)).resolves.toEqual(created);

    expect(mocks.queries.insertProject).toHaveBeenCalledExactlyOnceWith({
      ...input,
      status: "planning",
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledOnce();
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: created.id, event_type: "project_created" }),
    );
    // No starter sites, indicators, online data sources or actions are inserted.
    expect(mocks.from).not.toHaveBeenCalled();
    for (const [name, query] of Object.entries(mocks.queries)) {
      if (name !== "insertProject") expect(query).not.toHaveBeenCalled();
    }
  });

  it("propagates source failures from every configured reader, including a missing table", async () => {
    const readers = await loadReaders();
    for (const code of ["PGRST205", "42501"]) {
      for (const reader of readers) {
        const error = { code, message: `${reader.name} source unavailable` };
        reader.query.mockRejectedValueOnce(error);
        await expect(reader.read(), reader.name).rejects.toBe(error);
      }
    }
  });

  it("preserves empty lists and absent rows rather than inventing a baseline or chart", async () => {
    for (const reader of await loadReaders()) {
      reader.query.mockResolvedValueOnce(reader.empty);
      await expect(reader.read(), reader.name).resolves.toEqual(reader.empty);
    }
    expect(mocks.queries.fetchMeasurementsForIndicator).toHaveBeenCalledExactlyOnceWith(
      indicator.id,
      undefined,
    );
  });

  it("fails closed when customer mode has no configured database", async () => {
    mocks.configured = false;
    for (const reader of await loadReaders()) {
      await expect(reader.read(), reader.name).rejects.toThrow();
      expect(reader.query).not.toHaveBeenCalled();
    }
  });

  it("rejects the former offline sample mode without a database", async () => {
    mocks.configured = false;
    vi.stubEnv("VITE_APP_DATA_MODE", "demo");
    for (const reader of await loadReaders()) {
      await expect(reader.read(), reader.name).rejects.toThrow();
      expect(reader.query).not.toHaveBeenCalled();
    }
  });

  it("uses the database even when a configured application requests demo", async () => {
    vi.stubEnv("VITE_APP_DATA_MODE", "demo");
    for (const reader of await loadReaders()) {
      reader.query.mockResolvedValueOnce(reader.empty);
      await expect(reader.read(), reader.name).resolves.toEqual(reader.empty);
      expect(reader.query, reader.name).toHaveBeenCalledOnce();
    }
  });
});

const reportInput = {
  type: "Vandløb",
  organization: "Haderslev Kommune",
  period: "2026",
  modules: ["drone"],
  audience: "Kommune",
  tone: "Faglig",
  language: "da",
  detailLevel: "standard",
  formats: ["pdf"],
};

describe("report creation confirmation", () => {
  it.each(["customer", "demo"])(
    "does not invent a report id without a database in %s mode",
    async (mode) => {
      mocks.configured = false;
      vi.stubEnv("VITE_APP_DATA_MODE", mode);
      const { createReport } = await import("../reports-service");
      await expect(createReport(reportInput)).rejects.toThrow();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    },
  );

  it("requires the database to confirm a report id before logging creation", async () => {
    const { createReport } = await import("../reports-service");
    mocks.reportResult.mockResolvedValue({ data: null, error: null });
    await expect(createReport(reportInput)).rejects.toThrow("bekræftede ikke");
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("preserves the database creation error and does not log a successful report", async () => {
    const { createReport } = await import("../reports-service");
    const error = { code: "PGRST205", message: "Report source unavailable" };
    mocks.reportResult.mockResolvedValue({ data: null, error });
    await expect(createReport(reportInput)).rejects.toBe(error);
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("returns the confirmed report id", async () => {
    const { createReport } = await import("../reports-service");
    mocks.reportResult.mockResolvedValue({ data: { id: "persisted-report" }, error: null });
    await expect(createReport(reportInput)).resolves.toEqual({ id: "persisted-report" });
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("reports");
    expect(mocks.logAuditEvent).toHaveBeenCalledOnce();
  });
});
