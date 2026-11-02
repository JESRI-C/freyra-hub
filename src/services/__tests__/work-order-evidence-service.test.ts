import { describe, expect, it, vi } from "vitest";
import {
  listWorkOrderEvidence,
  listWorkOrderEvidenceSources,
  saveWorkOrderEvidence,
} from "../work-order-evidence-service";
import { actor, id, input, scope, version } from "./work-order-evidence-fixture";
const client = (data: unknown, error: { code: string; message?: string } | null = null) => ({
  rpc: vi.fn().mockResolvedValue({ data, error }),
});
const page = { ...scope, afterId: null, pageSize: 1 };
describe("task evidence boundary", () => {
  it("reuses the exact request identity and immutable references", async () => {
    const c = client([version()]);
    expect(await saveWorkOrderEvidence(c, actor, input)).toEqual(version());
    expect(c.rpc).toHaveBeenCalledWith(
      "save_work_order_evidence",
      expect.objectContaining({
        p_request_id: input.requestId,
        p_expected_version: 0,
        p_observation_version_id: input.observationVersionId,
        p_upload_id: input.uploadId,
      }),
    );
    expect((await saveWorkOrderEvidence(c, actor, input)).id).toBe(version().id);
  });
  it.each([
    { ...input, expectedActorId: id(2) },
    { ...input, storagePath: "forged" },
    { ...input, expectedVersion: -1 },
    { ...input, reason: " " },
    { ...input, projectId: "invalid" },
  ])("rejects invalid/mismatched actor input before RPC", async (raw) => {
    const c = client([version()]);
    await expect(saveWorkOrderEvidence(c, actor, raw)).rejects.toHaveProperty(
      "code",
      expect.stringMatching(/access|validation/),
    );
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { project_id: id(22) },
    { action_id: id(32) },
    { created_by: id(2) },
    { version: 2 },
    { upload_id: id(52) },
    { request_id: id(82) },
    { reason: "changed" },
  ])("denies a mismatched save response", async (change) => {
    await expect(
      saveWorkOrderEvidence(client([{ ...version(), ...change }]), actor, input),
    ).rejects.toBeInstanceOf(Error);
  });
  it("validates lookahead scope as well as displayed rows", async () => {
    await expect(
      listWorkOrderEvidence(
        client([version(91), { ...version(92), action_id: id(32) }]),
        actor,
        page,
      ),
    ).rejects.toHaveProperty("code", "access");
  });
  it("paginates without skipping the lookahead", async () => {
    expect(await listWorkOrderEvidence(client([version(91), version(92)]), actor, page)).toEqual({
      items: [version(91)],
      nextAfterId: id(91),
    });
    expect(
      await listWorkOrderEvidence(client([version(92)]), actor, { ...page, afterId: id(91) }),
    ).toEqual({ items: [version(92)], nextAfterId: null });
  });
  it.each([
    [version(91), version(91)],
    [version(92), version(91)],
    [version(91), version(92), version(93)],
  ])("rejects malformed cursor ordering/cardinality", async (...rows) => {
    await expect(listWorkOrderEvidence(client(rows), actor, page)).rejects.toHaveProperty(
      "code",
      "unavailable",
    );
  });
  it("rejects a forged source kind even in lookahead", async () => {
    await expect(
      listWorkOrderEvidenceSources(
        client([
          { id: id(91), label: "Photo", version: null, sha256: "a".repeat(64) },
          { id: id(92), label: "Wrong", version: 1, sha256: null },
        ]),
        actor,
        { ...page, kind: "photo" },
      ),
    ).rejects.toHaveProperty("code", "unavailable");
  });
  it.each([
    ["42501", "access"],
    ["PT409", "conflict"],
    ["22023", "validation"],
    ["XX000", "unavailable"],
  ])("sanitizes RPC error %s", async (code, expected) => {
    const error = await saveWorkOrderEvidence(
      client(null, { code, message: "secret internal detail" }),
      actor,
      input,
    ).catch((e) => e);
    expect(error.code).toBe(expected);
    expect(error.message).not.toContain("secret");
  });
});
