import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  fetchProjectBySlug: vi.fn(),
  fetchProjectById: vi.fn(),
  fetchSitesByProject: vi.fn(),
  fetchDataSourcesByProject: vi.fn(),
  insertProject: vi.fn(),
  updateProject: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: true, supabase: null }));
vi.mock("@/lib/supabase/queries", () => db);
vi.mock("@/services/audit-service", () => ({
  logAuditEvent: vi.fn(),
  getAuditEventsByProject: vi.fn(),
}));
vi.mock("@/services/indicators-service", () => ({ getIndicatorsByProject: vi.fn() }));
vi.mock("@/services/reports-service", () => ({ getReportsByProject: vi.fn() }));
import {
  createProject,
  getProjects,
  getSitesByProject,
  getDataSourcesByProject,
} from "../projects-service";
beforeEach(() => vi.clearAllMocks());
describe("customer project data", () => {
  it("creates only the requested project, without fabricated areas or online sources", async () => {
    db.insertProject.mockResolvedValue({ id: "project", slug: "stream" });
    await expect(
      createProject({ name: "Stream", slug: "stream", organization_id: "org" }),
    ).resolves.toEqual({ id: "project", slug: "stream" });
    expect(db.insertProject).toHaveBeenCalledExactlyOnceWith({
      name: "Stream",
      slug: "stream",
      organization_id: "org",
      status: "planning",
    });
    expect(db.fetchSitesByProject).not.toHaveBeenCalled();
  });
  it("scopes the project list to the requested organization", async () => {
    db.fetchProjects.mockResolvedValue([]);
    await getProjects("org-b");
    expect(db.fetchProjects).toHaveBeenCalledWith("org-b");
  });
  it("propagates missing schema instead of returning demo results", async () => {
    const error = { code: "PGRST205", message: "missing relation" };
    db.fetchProjects.mockRejectedValue(error);
    db.fetchSitesByProject.mockRejectedValue(error);
    db.fetchDataSourcesByProject.mockRejectedValue(error);
    await expect(getProjects("org")).rejects.toEqual(error);
    await expect(getSitesByProject("project")).rejects.toEqual(error);
    await expect(getDataSourcesByProject("project")).rejects.toEqual(error);
  });
});
