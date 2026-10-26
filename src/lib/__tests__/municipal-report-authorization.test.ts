import { describe, expect, it, vi } from "vitest";
import {
  executeGetMunicipalReport,
  executeSaveMunicipalReport,
  type MunicipalReportDependencies,
} from "../municipal-report.functions";
import { ProjectAccessDeniedError } from "../project-nature-access.server";
import { makeMunicipalReportFixture } from "@/services/monitoring/__tests__/municipal-report.fixtures";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  municipalReportCanonicalText,
  type MunicipalReportManifest,
} from "@/services/monitoring/municipal-report";
const CLIENT = {} as never,
  ID = "d1000000-0000-4000-8000-000000000001",
  REQUEST = "d2000000-0000-4000-8000-000000000001";
async function setup(canPersist = true) {
  const fixture = await makeMunicipalReportFixture(),
    actorId = fixture.baseline.createdBy,
    projectId = fixture.baseline.projectId;
  async function row(manifest: MunicipalReportManifest = fixture.manifest) {
    return {
      id: ID,
      project_id: projectId,
      version_no: 1,
      baseline_id: manifest.pins.baseline.id,
      baseline_sha256: manifest.pins.baseline.sha256,
      plan_id: manifest.pins.plan.id,
      plan_sha256: manifest.pins.plan.sha256,
      round_version_id: manifest.pins.round.id,
      round_sha256: manifest.pins.round.sha256,
      generator_version: manifest.generatorVersion,
      status: manifest.status,
      report_eligible: false,
      professionally_reviewed: false,
      municipal_scope_approved: false,
      generated_at: manifest.generatedAt,
      manifest,
      manifest_text: municipalReportCanonicalText(manifest),
      manifest_sha256: await baselineSha256(manifest),
      created_at: "2026-10-15T09:00:01.000Z",
      created_by: actorId,
      request_id: REQUEST,
    };
  }
  const overrides = {
    authorize: vi
      .fn()
      .mockResolvedValue({ canPersist, role: canPersist ? "editor" : "viewer", centroid: null }),
    loadRequest: vi.fn().mockResolvedValue(null),
    loadReport: vi.fn().mockResolvedValue(await row()),
    loadInputs: vi
      .fn<MunicipalReportDependencies["loadInputs"]>()
      .mockImplementation(async (_client, _project, _round, generatedAt) => ({
        ...fixture.input,
        generatedAt,
      })),
    getWriter: vi.fn().mockResolvedValue(CLIENT),
    persist: vi
      .fn<MunicipalReportDependencies["persist"]>()
      .mockImplementation(async (_writer, _project, _actor, _request, manifest) => row(manifest)),
    now: () => fixture.manifest.generatedAt,
  } satisfies MunicipalReportDependencies;
  const envelope = {
    projectId,
    roundVersionId: fixture.round.id,
    requestId: REQUEST,
    expectedCallerUserId: actorId,
  };
  return { fixture, actorId, projectId, overrides, row, envelope };
}
describe("caller-bound saved municipal reports", () => {
  it("rejects account switches before all private reads and writer creation", async () => {
    const f = await setup();
    await expect(executeSaveMunicipalReport(f.envelope, ID, CLIENT, f.overrides)).rejects.toThrow(
      "Login er ændret",
    );
    for (const operation of [
      f.overrides.authorize,
      f.overrides.loadRequest,
      f.overrides.loadInputs,
      f.overrides.getWriter,
      f.overrides.persist,
    ])
      expect(operation).not.toHaveBeenCalled();
  });
  it("denies foreign access before reading or compiling any report", async () => {
    const f = await setup();
    f.overrides.authorize.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(
      executeGetMunicipalReport(
        { projectId: f.projectId, reportVersionId: ID },
        f.actorId,
        CLIENT,
        f.overrides,
      ),
    ).rejects.toThrow("Forbidden");
    expect(f.overrides.loadReport).not.toHaveBeenCalled();
    expect(f.overrides.loadInputs).not.toHaveBeenCalled();
  });
  it("allows a viewer to replay the exact frozen report but never create one", async () => {
    const f = await setup(false);
    await expect(
      executeSaveMunicipalReport(f.envelope, f.actorId, CLIENT, f.overrides),
    ).rejects.toThrow("læseadgang");
    expect(f.overrides.loadRequest).not.toHaveBeenCalled();
    expect(f.overrides.getWriter).not.toHaveBeenCalled();
    const saved = await executeGetMunicipalReport(
      { projectId: f.projectId, reportVersionId: ID },
      f.actorId,
      CLIENT,
      f.overrides,
    );
    expect(saved?.id).toBe(ID);
    expect(f.overrides.loadInputs).toHaveBeenCalledWith(
      CLIENT,
      f.projectId,
      f.fixture.round.id,
      f.fixture.manifest.generatedAt,
      f.fixture.manifest,
    );
  });
  it("derives the entire draft on the server before creating a privileged writer", async () => {
    const f = await setup();
    const result = await executeSaveMunicipalReport(f.envelope, f.actorId, CLIENT, f.overrides);
    expect(result.manifest).toEqual(f.fixture.manifest);
    expect(result.reportEligible).toBe(false);
    expect(f.overrides.loadInputs.mock.invocationCallOrder[0]).toBeLessThan(
      f.overrides.getWriter.mock.invocationCallOrder[0],
    );
    expect(f.overrides.persist).toHaveBeenCalledWith(
      CLIENT,
      f.projectId,
      f.actorId,
      REQUEST,
      f.fixture.manifest,
    );
    expect(f.overrides.authorize).toHaveBeenCalledTimes(3);
  });
  it("replays an existing request before reading a new current selection or creating a writer", async () => {
    const f = await setup();
    f.overrides.loadRequest.mockResolvedValue(await f.row());
    const saved = await executeSaveMunicipalReport(f.envelope, f.actorId, CLIENT, f.overrides);
    expect(saved.id).toBe(ID);
    expect(f.overrides.getWriter).not.toHaveBeenCalled();
    expect(f.overrides.persist).not.toHaveBeenCalled();
    expect(f.overrides.loadInputs).toHaveBeenCalledTimes(1);
    expect(f.overrides.loadInputs.mock.calls[0][4]).toEqual(f.fixture.manifest);
  });
  it("rejects a request receipt for a different selected round", async () => {
    const f = await setup();
    f.overrides.loadRequest.mockResolvedValue(await f.row());
    await expect(
      executeSaveMunicipalReport(
        { ...f.envelope, roundVersionId: ID },
        f.actorId,
        CLIENT,
        f.overrides,
      ),
    ).rejects.toThrow("anden rapport");
    expect(f.overrides.getWriter).not.toHaveBeenCalled();
  });
  it("rechecks contributor access after compiling and before loading the writer", async () => {
    const f = await setup();
    f.overrides.authorize
      .mockResolvedValueOnce({ canPersist: true, role: "editor", centroid: null })
      .mockResolvedValue({ canPersist: false, role: "viewer", centroid: null });
    await expect(
      executeSaveMunicipalReport(f.envelope, f.actorId, CLIENT, f.overrides),
    ).rejects.toThrow("ændret");
    expect(f.overrides.getWriter).not.toHaveBeenCalled();
    expect(f.overrides.persist).not.toHaveBeenCalled();
  });
  it("rejects tampered report prose even when its row hash has been recomputed", async () => {
    const f = await setup(),
      changed = structuredClone(f.fixture.manifest);
    changed.executiveSummary.push("En opdigtet konklusion.");
    f.overrides.loadReport.mockResolvedValue(await f.row(changed));
    await expect(
      executeGetMunicipalReport(
        { projectId: f.projectId, reportVersionId: ID },
        f.actorId,
        CLIENT,
        f.overrides,
      ),
    ).rejects.toThrow("præcise gemte input");
  });
  it("keeps the winning stored timestamp during identical concurrent receipt replay", async () => {
    const f = await setup(),
      earlier = structuredClone(f.fixture.manifest);
    earlier.generatedAt = "2026-10-15T08:59:59.000Z";
    f.overrides.persist.mockResolvedValue(await f.row(earlier));
    const saved = await executeSaveMunicipalReport(f.envelope, f.actorId, CLIENT, f.overrides);
    expect(saved.manifest.generatedAt).toBe(earlier.generatedAt);
  });
});
