// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  downloadCsv,
  downloadProjectCsv,
  downloadGeoJSON,
  recordProjectExportRequests,
} from "../export-service";
const mock = vi.hoisted(() => ({ audit: vi.fn(), exportAudit: vi.fn() }));
vi.mock("@/services/audit-service", () => ({
  logAuditEvent: mock.audit,
  logProjectExportRequest: mock.exportAudit,
}));
let click: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mock.audit.mockReset();
  mock.audit.mockResolvedValue(undefined);
  mock.exportAudit.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => "blob:csv"),
      revokeObjectURL: vi.fn(),
    }),
  );
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("records the selected project and saved billing reference before starting the download", async () => {
  let release!: () => void;
  mock.audit.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const pending = downloadProjectCsv("csv", "billing.csv", {
    projectId: "project-a",
    entityType: "project_approved_time_draft",
    entityId: "draft-a",
  });
  expect(click).not.toHaveBeenCalled();
  expect(mock.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: "project-a",
      entity_id: "draft-a",
      entity_type: "project_approved_time_draft",
      event_type: "data_export",
    }),
  );
  release();
  await pending;
  expect(click).toHaveBeenCalledTimes(1);
});
it("does not start a download when project audit authorization fails", async () => {
  mock.audit.mockRejectedValue(new Error("Access denied"));
  await expect(
    downloadProjectCsv("csv", "billing.csv", { projectId: "other-project" }),
  ).rejects.toThrow("Access denied");
  expect(click).not.toHaveBeenCalled();
});
it("does not manufacture an unscoped project audit event for a local CSV", () => {
  downloadCsv("csv", "local.csv");
  expect(click).toHaveBeenCalledTimes(1);
  expect(mock.audit).not.toHaveBeenCalled();
});
it("waits for the actual project and watercourse revision audit before GeoJSON download", async () => {
  let release!: () => void;
  mock.exportAudit.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const pending = downloadGeoJSON({ type: "FeatureCollection", features: [] }, "stream-v2", {
    projectId: "project-a",
    entityType: "watercourse_version",
    entityId: "revision-2",
  });
  expect(mock.exportAudit).toHaveBeenCalledWith({
    projectId: "project-a",
    entityType: "watercourse_version",
    entityId: "revision-2",
    format: "geojson",
    filename: "stream-v2-geodata.geojson",
  });
  expect(click).not.toHaveBeenCalled();
  release();
  await pending;
  expect(click).toHaveBeenCalledOnce();
});
it("does not release a GeoJSON file when the scoped request is denied", async () => {
  mock.exportAudit.mockRejectedValue(new Error("Access denied"));
  await expect(
    downloadGeoJSON({ type: "FeatureCollection", features: [] }, "other", {
      projectId: "other-project",
    }),
  ).rejects.toThrow("Access denied");
  expect(click).not.toHaveBeenCalled();
});
it("records each distinct data project, regardless of repeated rows or selected display columns", async () => {
  await recordProjectExportRequests(["project-a", "project-b", "project-a"], "jobs.xlsx", "xlsx");
  expect(mock.exportAudit.mock.calls.map((call) => call[0].projectId)).toEqual([
    "project-a",
    "project-b",
  ]);
  expect(mock.exportAudit).toHaveBeenCalledWith({
    projectId: "project-b",
    format: "xlsx",
    filename: "jobs.xlsx",
    entityType: "work_orders",
  });
});
it("rejects a cross-project export after any scope is denied", async () => {
  mock.exportAudit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Denied"));
  await expect(
    recordProjectExportRequests(["project-a", "project-b", "project-c"], "jobs.csv", "csv"),
  ).rejects.toThrow("Denied");
  expect(mock.exportAudit).toHaveBeenCalledTimes(2);
});
it("stops after an actor change aborts a pending audit", async () => {
  const controller = new AbortController();
  mock.exportAudit.mockImplementation(async () => {
    controller.abort();
  });
  await expect(
    recordProjectExportRequests(["project-a", "project-b"], "jobs.csv", "csv", controller.signal),
  ).rejects.toThrow();
  expect(mock.exportAudit).toHaveBeenCalledTimes(1);
});
