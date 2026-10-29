import { beforeEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  scope: vi.fn(),
  rpc: vi.fn(),
  rows: [] as unknown[],
  filters: [] as unknown[],
  error: null as { code: string } | null,
}));
vi.mock("@/services/project-workspace-service", () => ({ assertProjectScope: state.scope }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc: state.rpc,
    from: () => {
      const q = {
        select: () => q,
        eq: (...args: unknown[]) => {
          state.filters.push(args);
          return q;
        },
        order: () => q,
        limit: async () => ({ data: state.rows, error: state.error }),
      };
      return q;
    },
  },
}));
import {
  getFieldPhotoPolicy,
  listFieldPhotoPositions,
  saveFieldPhotoPosition,
  saveFieldPhotoPolicy,
} from "../field-photo-position-service";
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const scope = { projectId: id(1), organizationId: id(2) };
const row = {
  id: id(3),
  project_id: scope.projectId,
  organization_id: scope.organizationId,
  media_id: id(4),
  version: 1,
  lat: 55,
  lng: 10,
  reason: "GPS correction",
  policy_version: 0,
  radius_m: 50,
  distance_m: 0,
  status: "within_limit",
  created_by: id(5),
  created_at: "2026-10-29T09:00:00Z",
  request_id: id(6),
};
const input = {
  mediaId: row.media_id,
  point: { lat: 55, lng: 10 },
  reason: row.reason,
  expectedVersion: 0,
  expectedPolicyVersion: 0,
  requestId: row.request_id,
};
describe("photo position persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rows = [];
    state.filters = [];
    state.error = null;
    state.rpc.mockResolvedValue({ data: [row], error: null });
  });
  it("uses default policy only when the successful query is empty", async () => {
    expect(await getFieldPhotoPolicy(scope)).toBeNull();
    state.error = { code: "42P01" };
    await expect(getFieldPhotoPolicy(scope)).rejects.toThrow("endnu ikke installeret");
  });
  it("scopes history to the exact media, project and organisation", async () => {
    state.rows = [row];
    expect(await listFieldPhotoPositions(scope, row.media_id)).toEqual([row]);
    expect(state.filters).toContainEqual(["project_id", scope.projectId]);
    expect(state.filters).toContainEqual(["organization_id", scope.organizationId]);
    expect(state.filters).toContainEqual(["media_id", row.media_id]);
  });
  it("passes exact expected policy/version and stable retry identity", async () => {
    await saveFieldPhotoPosition(scope, input);
    expect(state.rpc).toHaveBeenCalledWith(
      "save_field_photo_position",
      expect.objectContaining({
        p_expected_version: 0,
        p_expected_policy_version: 0,
        p_request_id: row.request_id,
        p_media_id: row.media_id,
      }),
    );
  });
  it("does not accept a foreign project receipt", async () => {
    state.rpc.mockResolvedValue({ data: [{ ...row, project_id: id(90) }], error: null });
    await expect(saveFieldPhotoPosition(scope, input)).rejects.toThrow("projektreference");
  });
  it("does not accept another photograph or request in the receipt", async () => {
    for (const patch of [{ media_id: id(91) }, { request_id: id(92) }]) {
      state.rpc.mockResolvedValue({ data: [{ ...row, ...patch }], error: null });
      await expect(saveFieldPhotoPosition(scope, input)).rejects.toThrow("matcher ikke");
    }
  });
  it("requires correction reasons and valid coordinates", async () => {
    for (const patch of [{ reason: " " }, { point: { lat: 95, lng: 10 } }])
      await expect(saveFieldPhotoPosition(scope, { ...input, ...patch })).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("surfaces policy conflicts instead of silently retrying a new write", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    await expect(saveFieldPhotoPosition(scope, input)).rejects.toThrow("Genindlæs");
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it("requires a bounded whole-metre policy and version", async () => {
    await expect(
      saveFieldPhotoPolicy(scope, {
        radiusM: 50.5,
        reason: "Wrong unit",
        expectedVersion: 0,
        requestId: id(7),
      }),
    ).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
