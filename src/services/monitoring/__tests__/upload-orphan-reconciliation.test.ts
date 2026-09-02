import { describe, expect, it, vi } from "vitest";
import {
  MONITORING_UPLOAD_BUCKET,
  reconcileUploadIntentOrphans,
  sanitizeOrphanReconciliationError,
  type UploadOrphanReconciliationClient,
} from "@/services/monitoring/upload-orphan-reconciliation.server";

const UPLOAD_ONE = "11111111-1111-4111-8111-111111111111";
const UPLOAD_TWO = "22222222-2222-4222-8222-222222222222";
const UPLOAD_THREE = "55555555-5555-4555-8555-555555555555";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN_ONE = "33333333-3333-4333-8333-333333333333";
const TOKEN_TWO = "44444444-4444-4444-8444-444444444444";
const TOKEN_THREE = "66666666-6666-4666-8666-666666666666";
const PATH_ONE = `${USER_ID}/intents/${UPLOAD_ONE}/DJI_0001.JPG`;
const PATH_TWO = `${USER_ID}/intents/${UPLOAD_TWO}/DJI_0002.JPG`;

function setupClient(
  claims: unknown[],
  removeImplementation: (paths: string[]) => Promise<{ error: unknown | null }> = async () => ({
    error: null,
  }),
) {
  const remove = vi.fn(removeImplementation);
  const from = vi.fn(() => ({ remove }));
  const completions: Array<Record<string, unknown>> = [];
  const rpc = vi.fn(
    async (
      functionName: string,
      parameters: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string } | null }> => {
      if (functionName === "claim_upload_intent_orphans") {
        return { data: claims, error: null };
      }
      if (functionName === "complete_upload_intent_orphan_cleanup") {
        completions.push(parameters);
        return { data: [{ completed: true }], error: null };
      }
      throw new Error(`Unexpected RPC: ${functionName}`);
    },
  );
  const client = { rpc, storage: { from } } as UploadOrphanReconciliationClient;
  return { client, rpc, from, remove, completions };
}

describe("upload-intent orphan reconciliation", () => {
  it("returns a no-op result when no orphan work is available", async () => {
    const setup = setupClient([]);

    const result = await reconcileUploadIntentOrphans({ client: setup.client });

    expect(result).toEqual({ claimed: 0, deleted: 0, failed: 0, items: [] });
    expect(setup.from).not.toHaveBeenCalled();
    expect(setup.completions).toEqual([]);
  });

  it("deletes only each exact claimed Storage path and records sanitized failures", async () => {
    const setup = setupClient(
      [
        { upload_id: UPLOAD_ONE, storage_path: PATH_ONE, claim_token: TOKEN_ONE },
        { upload_id: UPLOAD_TWO, storage_path: PATH_TWO, claim_token: TOKEN_TWO },
      ],
      async ([path]) =>
        path === PATH_TWO
          ? {
              error: new Error(
                "delete failed Bearer live-token sb_secret_do-not-store https://storage.test/path?token=secret",
              ),
            }
          : { error: null },
    );

    const result = await reconcileUploadIntentOrphans({ client: setup.client });

    expect(setup.from).toHaveBeenCalledTimes(2);
    expect(setup.from).toHaveBeenNthCalledWith(1, MONITORING_UPLOAD_BUCKET);
    expect(setup.remove).toHaveBeenNthCalledWith(1, [PATH_ONE]);
    expect(setup.remove).toHaveBeenNthCalledWith(2, [PATH_TWO]);
    expect(setup.completions[0]).toEqual({
      p_upload_id: UPLOAD_ONE,
      p_claim_token: TOKEN_ONE,
      p_error: null,
    });
    expect(setup.completions[1]).toMatchObject({
      p_upload_id: UPLOAD_TWO,
      p_claim_token: TOKEN_TWO,
    });
    expect(setup.completions[1]?.p_error).not.toContain("live-token");
    expect(setup.completions[1]?.p_error).not.toContain("sb_secret_do-not-store");
    expect(setup.completions[1]?.p_error).not.toContain("storage.test");
    expect(result).toMatchObject({ claimed: 2, deleted: 1, failed: 1 });
    expect(result.items[1]).toMatchObject({ uploadId: UPLOAD_TWO, outcome: "failed" });
  });

  it("refuses malformed, mismatched or non-intent paths and continues safely", async () => {
    const unsafePath = `${USER_ID}/intents/${UPLOAD_ONE}/../another-object`;
    const mismatchedPath = `${USER_ID}/intents/${UPLOAD_ONE}/DJI_0003.JPG`;
    const setup = setupClient([
      { upload_id: UPLOAD_ONE, storage_path: unsafePath, claim_token: TOKEN_ONE },
      { upload_id: UPLOAD_THREE, storage_path: mismatchedPath, claim_token: TOKEN_THREE },
      { upload_id: UPLOAD_TWO, storage_path: PATH_TWO, claim_token: TOKEN_TWO },
    ]);

    const result = await reconcileUploadIntentOrphans({ client: setup.client });

    expect(setup.remove).toHaveBeenCalledOnce();
    expect(setup.remove).toHaveBeenCalledWith([PATH_TWO]);
    expect(setup.completions[0]).toEqual({
      p_upload_id: UPLOAD_ONE,
      p_claim_token: TOKEN_ONE,
      p_error: "Invalid exact intent storage path returned by database",
    });
    expect(setup.completions[1]).toEqual({
      p_upload_id: UPLOAD_THREE,
      p_claim_token: TOKEN_THREE,
      p_error: "Invalid exact intent storage path returned by database",
    });
    expect(setup.completions[2]).toEqual({
      p_upload_id: UPLOAD_TWO,
      p_claim_token: TOKEN_TWO,
      p_error: null,
    });
    expect(result).toMatchObject({ claimed: 3, deleted: 1, failed: 2 });
  });

  it("keeps processing after a completion acknowledgement fails", async () => {
    const setup = setupClient([
      { upload_id: UPLOAD_ONE, storage_path: PATH_ONE, claim_token: TOKEN_ONE },
      { upload_id: UPLOAD_TWO, storage_path: PATH_TWO, claim_token: TOKEN_TWO },
    ]);
    setup.rpc.mockImplementation(
      async (functionName: string, parameters: Record<string, unknown>) => {
        if (functionName === "claim_upload_intent_orphans") {
          return {
            data: [
              { upload_id: UPLOAD_ONE, storage_path: PATH_ONE, claim_token: TOKEN_ONE },
              { upload_id: UPLOAD_TWO, storage_path: PATH_TWO, claim_token: TOKEN_TWO },
            ],
            error: null,
          };
        }
        return parameters.p_upload_id === UPLOAD_ONE
          ? { data: null, error: { message: "database unavailable" } }
          : { data: [{ completed: true }], error: null };
      },
    );

    const result = await reconcileUploadIntentOrphans({ client: setup.client });

    expect(setup.remove).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ claimed: 2, deleted: 1, failed: 1 });
    expect(result.items).toEqual([
      {
        uploadId: UPLOAD_ONE,
        outcome: "failed",
        error: "Storage object deleted but completion acknowledgement failed",
      },
      { uploadId: UPLOAD_TWO, outcome: "deleted" },
    ]);
  });

  it("keeps processing when an unsafe-path failure acknowledgement throws", async () => {
    const unsafePath = `${USER_ID}/intents/${UPLOAD_ONE}/../another-object`;
    const setup = setupClient([
      { upload_id: UPLOAD_ONE, storage_path: unsafePath, claim_token: TOKEN_ONE },
      { upload_id: UPLOAD_TWO, storage_path: PATH_TWO, claim_token: TOKEN_TWO },
    ]);
    setup.rpc.mockImplementation(
      async (functionName: string, parameters: Record<string, unknown>) => {
        if (functionName === "claim_upload_intent_orphans") {
          return {
            data: [
              { upload_id: UPLOAD_ONE, storage_path: unsafePath, claim_token: TOKEN_ONE },
              { upload_id: UPLOAD_TWO, storage_path: PATH_TWO, claim_token: TOKEN_TWO },
            ],
            error: null,
          };
        }
        if (parameters.p_upload_id === UPLOAD_ONE) throw new Error("network unavailable");
        return { data: [{ completed: true }], error: null };
      },
    );

    const result = await reconcileUploadIntentOrphans({ client: setup.client });

    expect(setup.remove).toHaveBeenCalledOnce();
    expect(setup.remove).toHaveBeenCalledWith([PATH_TWO]);
    expect(result).toMatchObject({ claimed: 2, deleted: 1, failed: 1 });
    expect(result.items[0]?.error).toBe("Invalid path and failure acknowledgement failed");
  });

  it("bounds claim parameters and fails closed when claiming work fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Bearer secret should stay in the cause" },
    });
    const client = {
      rpc,
      storage: { from: vi.fn() },
    } as unknown as UploadOrphanReconciliationClient;

    const failure = reconcileUploadIntentOrphans({
      client,
      limit: 100_000,
      leaseSeconds: -20,
    });
    await expect(failure).rejects.toThrow("Upload orphan reconciliation could not claim work");
    await expect(failure).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledWith("claim_upload_intent_orphans", {
      p_limit: 100,
      p_lease_seconds: 30,
    });
    expect(client.storage.from).not.toHaveBeenCalled();
  });
});

describe("orphan reconciliation diagnostics", () => {
  it("redacts credentials and limits persisted error length", () => {
    const sanitized = sanitizeOrphanReconciliationError(
      `Bearer top-secret sb_publishable_public eyJheader.payload.signature https://example.test/?key=secret\n${"x".repeat(800)}`,
    );

    expect(sanitized).toHaveLength(500);
    expect(sanitized).not.toContain("top-secret");
    expect(sanitized).not.toContain("sb_publishable_public");
    expect(sanitized).not.toContain("eyJheader");
    expect(sanitized).not.toContain("example.test");
    expect(sanitized).not.toContain("\n");
  });
});
