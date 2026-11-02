import { describe, expect, it, vi } from "vitest";
import {
  getWorkOrderSubmissionContext,
  listWorkOrderSubmissions,
  saveWorkOrderSubmission,
} from "../work-order-submission-service";
import { SubmissionVersionSchema } from "@/lib/work-order-submission";
import { actor, context, id, input, scope, submission } from "./work-order-submission-fixture";
const client = (data: unknown, code?: string) => ({
  rpc: vi
    .fn()
    .mockResolvedValue({ data, error: code ? { code, message: "private detail" } : null }),
});
describe("immutable work order submission service", () => {
  it("validates complete frozen sources while preserving zero, false and an unknown planned date", () => {
    const row = SubmissionVersionSchema.parse(submission());
    expect(row.snapshot.evidence[0].observation_snapshot.values).toMatchObject({
      count: 0,
      checked: false,
    });
    expect(row.snapshot.plan.plan.plannedStart).toBeNull();
  });
  it("uses the middleware actor and requires the exact scope in a preflight response", async () => {
    expect(await getWorkOrderSubmissionContext(client(context()), actor, scope)).toEqual(context());
    await expect(
      getWorkOrderSubmissionContext(client({ ...context(), user_id: id(5) }), actor, scope),
    ).rejects.toMatchObject({ code: "access" });
    await expect(
      getWorkOrderSubmissionContext(client({ ...context(), project_id: id(9) }), actor, scope),
    ).rejects.toMatchObject({ code: "access" });
  });
  it("never sends a caller-supplied packet or file path", async () => {
    const c = client([submission()]);
    await saveWorkOrderSubmission(c, actor, input);
    expect(c.rpc).toHaveBeenCalledWith("save_work_order_submission", {
      p_action_id: scope.actionId,
      p_organization_id: scope.organizationId,
      p_project_id: scope.projectId,
      p_expected_version: 0,
      p_basis_hash: input.basisHash,
      p_note: input.note,
      p_request_id: input.requestId,
    });
    await expect(
      saveWorkOrderSubmission(c, actor, { ...input, snapshot: {} }),
    ).rejects.toMatchObject({ code: "validation" });
  });
  it.each(["created_by", "request_id", "basis_hash", "note"] as const)(
    "rejects a mismatched %s receipt",
    async (field) => {
      const row = {
        ...submission(),
        [field]: field === "basis_hash" ? "b".repeat(64) : field === "note" ? "Other note" : id(99),
      };
      await expect(saveWorkOrderSubmission(client([row]), actor, input)).rejects.toMatchObject({
        code: "unavailable",
      });
    },
  );
  it("rejects internally inconsistent or foreign frozen sources", () => {
    const wrong = submission();
    wrong.snapshot.execution.binding.action_id = id(99);
    expect(SubmissionVersionSchema.safeParse(wrong).success).toBe(false);
    const incomplete = submission();
    incomplete.snapshot.evidence[0].observation_snapshot.values.checked = null;
    expect(SubmissionVersionSchema.safeParse(incomplete).success).toBe(false);
  });
  it.each([
    ["PT409", "conflict"],
    ["42501", "access"],
    ["22023", "validation"],
    ["XX000", "unavailable"],
  ])("maps %s without exposing private SQL details", async (code, expected) => {
    await expect(saveWorkOrderSubmission(client(null, code), actor, input)).rejects.toMatchObject({
      code: expected,
    });
  });
  it("checks the actor before touching the database", async () => {
    const c = client([submission()]);
    await expect(saveWorkOrderSubmission(c, id(3), input)).rejects.toMatchObject({
      code: "access",
    });
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("validates descending bounded history including the lookahead row", async () => {
    const page = { ...scope, beforeVersion: 3, pageSize: 1 };
    expect(
      await listWorkOrderSubmissions(client([submission(2), submission(1)]), actor, page),
    ).toMatchObject({ nextBeforeVersion: 2, items: [{ version: 2 }] });
    await expect(
      listWorkOrderSubmissions(client([submission(1), submission(2)]), actor, page),
    ).rejects.toMatchObject({ code: "unavailable" });
    const foreign = submission(1);
    foreign.project_id = id(99);
    await expect(
      listWorkOrderSubmissions(client([submission(2), foreign]), actor, page),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
