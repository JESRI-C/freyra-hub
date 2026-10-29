import { beforeEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  assert: vi.fn(),
  rpc: vi.fn(),
  filters: [] as unknown[][],
  rows: [] as unknown[],
  template: null as unknown,
  error: null as null | { code: string },
}));
vi.mock("@/services/project-workspace-service", () => ({ assertProjectScope: state.assert }));
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
        single: async () => ({ data: state.template, error: state.error }),
      };
      return q;
    },
  },
}));
import {
  listFieldJobTemplates,
  listFieldJobVersions,
  saveFieldJobTemplate,
  saveFieldJobVersion,
} from "../field-job-cards-service";
import { FIELD_JOB_STARTER_TEMPLATES } from "@/lib/field-job-cards";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { projectId: id(1), organizationId: id(2) };
const template = {
  id: id(3),
  template_id: id(4),
  project_id: scope.projectId,
  organization_id: scope.organizationId,
  version: 1,
  definition: FIELD_JOB_STARTER_TEMPLATES[3],
  request_id: id(5),
  created_by: id(6),
  created_at: "2026-10-29T08:00:00Z",
};
const record = {
  id: id(7),
  action_id: id(8),
  project_id: scope.projectId,
  organization_id: scope.organizationId,
  version: 1,
  template_version_id: template.id,
  values: { animal_count: 0 },
  status: "draft",
  correction_reason: "",
  request_id: id(9),
  created_by: id(6),
  created_at: template.created_at,
};
describe("project scoped job card persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.filters = [];
    state.rows = [];
    state.template = template;
    state.error = null;
    state.rpc.mockResolvedValue({ data: [record], error: null });
  });
  it("scopes template and history reads to project and organisation", async () => {
    state.rows = [template];
    await listFieldJobTemplates(scope);
    expect(state.assert).toHaveBeenCalledWith(scope);
    expect(state.filters).toContainEqual(["project_id", scope.projectId]);
    expect(state.filters).toContainEqual(["organization_id", scope.organizationId]);
    state.rows = [record];
    await listFieldJobVersions(scope, record.action_id);
    expect(state.filters).toContainEqual(["action_id", record.action_id]);
  });
  it("rejects foreign records even if a transport returns them", async () => {
    state.rows = [{ ...template, project_id: id(99) }];
    await expect(listFieldJobTemplates(scope)).rejects.toThrow("anden sag");
  });
  it("does not hide a capped template archive", async () => {
    state.rows = Array(1001).fill(template);
    await expect(listFieldJobTemplates(scope)).rejects.toThrow("afgrænset");
  });
  it("writes exact expected version, stable request and pinned template", async () => {
    const input = {
      actionId: record.action_id,
      templateVersionId: template.id,
      values: {},
      status: "draft" as const,
      correctionReason: "",
      expectedVersion: 0,
      requestId: record.request_id,
    };
    state.rpc.mockResolvedValue({ data: [{ ...record, values: {} }], error: null });
    await saveFieldJobVersion(scope, input);
    expect(state.rpc).toHaveBeenCalledWith(
      "save_field_job_version",
      expect.objectContaining({
        p_project_id: scope.projectId,
        p_organization_id: scope.organizationId,
        p_expected_version: 0,
        p_template_version_id: template.id,
        p_request_id: record.request_id,
      }),
    );
  });
  it("rejects invalid answers before writing", async () => {
    await expect(
      saveFieldJobVersion(scope, {
        actionId: record.action_id,
        templateVersionId: template.id,
        values: { unknown: "value" },
        status: "draft",
        correctionReason: "",
        expectedVersion: 0,
        requestId: record.request_id,
      }),
    ).rejects.toThrow("Ukendt");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("requires correction reasons on later versions", async () => {
    await expect(
      saveFieldJobVersion(scope, {
        actionId: record.action_id,
        templateVersionId: template.id,
        values: {},
        status: "draft",
        correctionReason: "",
        expectedVersion: 1,
        requestId: record.request_id,
      }),
    ).rejects.toThrow("årsagen");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("reports conflicts and does not call a failed save successful", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    await expect(
      saveFieldJobTemplate(scope, {
        templateId: template.template_id,
        definition: template.definition,
        expectedVersion: 0,
        requestId: template.request_id,
      }),
    ).rejects.toThrow("Genindlæs");
  });
  it("checks returned receipt identity", async () => {
    state.rpc.mockResolvedValue({ data: [{ ...template, request_id: id(99) }], error: null });
    await expect(
      saveFieldJobTemplate(scope, {
        templateId: template.template_id,
        definition: template.definition,
        expectedVersion: 0,
        requestId: template.request_id,
      }),
    ).rejects.toThrow("matcher ikke");
  });
  it("surfaces missing migration as an unavailable feature", async () => {
    state.error = { code: "42P01" };
    await expect(listFieldJobTemplates(scope)).rejects.toThrow("endnu ikke installeret");
  });
});
