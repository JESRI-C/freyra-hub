import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ bound: vi.fn(), rpc: vi.fn(), canonical: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: mocks.canonical },
  createActorBoundSupabaseClient: mocks.bound,
}));
vi.mock("@/lib/supabase/queries", () => ({
  fetchAuditEventsByProject: vi.fn(),
  fetchAllAuditEvents: vi.fn(),
  insertAuditEvent: vi.fn(),
}));
vi.mock("@/data/platform-seed", () => ({ SEED_AUDIT_EVENTS: [] }));
import { logProjectExportRequest } from "../audit-service";
beforeEach(() => {
  mocks.bound.mockReset().mockReturnValue({ rpc: mocks.rpc });
  mocks.canonical.mockReset();
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: "8bbcd720-931b-4f7e-892f-0a4b091af180", error: null });
});
it("uses the initiating actor without accepting a client-supplied audit author", async () => {
  await logProjectExportRequest({
    actorId: "reader",
    projectId: "case",
    format: "csv",
    filename: "data.csv",
  });
  expect(mocks.bound).toHaveBeenCalledWith("reader");
  expect(mocks.canonical).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("record_project_data_export_request", {
    p_project_id: "case",
    p_format: "csv",
    p_filename: "data.csv",
    p_entity_type: null,
    p_entity_id: null,
  });
});
it.each([null, "", "not-a-receipt"])("does not accept malformed receipt %j", async (data) => {
  mocks.rpc.mockResolvedValue({ data, error: null });
  await expect(
    logProjectExportRequest({
      actorId: "reader",
      projectId: "case",
      format: "geojson",
      filename: "data.json",
    }),
  ).rejects.toThrow("kunne ikke registreres");
});
