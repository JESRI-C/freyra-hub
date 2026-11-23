import { beforeAll, describe, expect, it, vi } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import {
  createInspectionPhotoBatch,
  inspectionPhotoBatchKey,
  readInspectionPhotoBatch,
  reopenInspectionPhotoBatch,
  runInspectionPhotoBatch,
  writeInspectionPhotoBatch,
  type InspectionPhotoBatchApi,
  type InspectionPhotoBatchReceipt,
} from "../inspection-photo-batch";
import { makeMediaUiFixture } from "./survey-round-media-ui.fixtures";

let fixture: Awaited<ReturnType<typeof makeMediaUiFixture>>;
beforeAll(async () => {
  fixture = await makeMediaUiFixture();
});
const uuid = (family: string, index: number) =>
  `${family}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function harness(count = 2) {
  const scope = { actorId: fixture.row.created_by, round: structuredClone(fixture.round) };
  const candidates = Array.from({ length: count }, (_, i) => ({
    ...fixture.candidate,
    mediaId: uuid("a1", i + 1),
    fileName: `DJI_${i + 1}.JPG`,
  }));
  let requests = 0;
  const batch = createInspectionPhotoBatch(scope, candidates, () => uuid("a3", ++requests));
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, text: string) => {
      values.set(key, text);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  writeInspectionPhotoBatch(storage, scope, batch, null);
  const saved = new Map<string, SurveyRoundMediaVersion>();
  const calls: string[] = [];
  let current = true;
  const assertCurrent = () => {
    if (!current) throw new Error("Synthetic scope changed");
  };
  const progress: InspectionPhotoBatchReceipt[] = [];
  async function savedFor(receipt: InspectionPhotoBatchReceipt["entries"][number]["receipt"]) {
    const version = structuredClone(fixture.version);
    version.id = uuid(
      "a2",
      candidates.findIndex((item) => item.mediaId === receipt.input.mediaId) + 1,
    );
    version.mediaId = receipt.input.mediaId;
    version.requestId = receipt.input.requestId;
    version.createdBy = receipt.actorId;
    version.manifest.mediaId = receipt.input.mediaId;
    version.manifest.questionIds = [...receipt.input.questionIds];
    version.manifest.originalSha256 = receipt.originalSha256;
    version.manifest.originalValidationSha256 = receipt.originalValidationSha256;
    version.manifestSha256 = await baselineSha256(version.manifest);
    return version;
  }
  const api: InspectionPhotoBatchApi = {
    getAccess: vi.fn(async () => {
      calls.push("access");
      return { userId: scope.actorId, projectId: scope.round.projectId, canAssign: true };
    }),
    listBindings: vi.fn(async ({ data }) => {
      calls.push(`list:${data.mediaId}`);
      expect(data.projectId).toBe(scope.round.projectId);
      expect(data.roundVersionId).toBe(scope.round.id);
      expect(data.limit).toBe(2);
      return {
        items: saved.has(data.mediaId) ? [saved.get(data.mediaId)!] : [],
        nextBeforeVersion: null,
      };
    }),
    saveBinding: vi.fn(async ({ data }) => {
      calls.push(`write:${data.mediaId}`);
      expect(data.expectedCallerUserId).toBe(scope.actorId);
      const receipt = batch.entries.find(
        (entry) => entry.receipt.input.mediaId === data.mediaId,
      )!.receipt;
      expect(data.requestId).toBe(receipt.input.requestId);
      expect(data.questionIds).toEqual([...scope.round.manifest.questionIds].sort());
      const durable = readInspectionPhotoBatch(
        storage.getItem(inspectionPhotoBatchKey(scope)),
        scope,
      )!;
      expect(durable.entries.map((entry) => entry.receipt)).toEqual(
        batch.entries.map((entry) => entry.receipt),
      );
      const version = await savedFor(receipt);
      saved.set(data.mediaId, version);
      return version;
    }),
    getBinding: vi.fn(async ({ data }) => {
      calls.push(`read:${data.bindingId}`);
      return [...saved.values()].find((item) => item.id === data.bindingId) ?? null;
    }),
  };
  const run = (expectedBatch = batch) =>
    runInspectionPhotoBatch({
      scope,
      storage,
      api,
      expectedBatch,
      assertCurrent,
      onProgress: (next) => progress.push(structuredClone(next)),
    });
  const stored = () =>
    readInspectionPhotoBatch(storage.getItem(inspectionPhotoBatchKey(scope)), scope)!;
  return {
    scope,
    candidates,
    batch,
    storage,
    values,
    saved,
    savedFor,
    calls,
    api,
    run,
    stored,
    progress,
    stale: () => {
      current = false;
    },
  };
}

describe("explicit photo-batch receipts and serial exact assignment", () => {
  it("persists every original request before the first write and confirms each before the next", async () => {
    const h = harness(2);
    const result = await h.run();
    expect(result.entries.map((entry) => entry.status)).toEqual(["confirmed", "confirmed"]);
    expect(h.calls.map((call) => call.split(":")[0])).toEqual([
      "access",
      "list",
      "access",
      "write",
      "read",
      "access",
      "list",
      "access",
      "write",
      "read",
    ]);
    expect(h.progress[0].entries.map((entry) => entry.status)).toEqual(["pending", "pending"]);
    expect(h.progress[1].entries.map((entry) => entry.status)).toEqual(["confirmed", "pending"]);
    expect(h.stored()).toEqual(result);
  });

  it("rejects zero, over 200, duplicate originals and duplicate request IDs", () => {
    const h = harness();
    expect(() => createInspectionPhotoBatch(h.scope, [])).toThrow();
    expect(() => createInspectionPhotoBatch(h.scope, Array(201).fill(h.candidates[0]))).toThrow();
    expect(() => createInspectionPhotoBatch(h.scope, [h.candidates[0], h.candidates[0]])).toThrow();
    expect(() => createInspectionPhotoBatch(h.scope, h.candidates, () => uuid("a3", 1))).toThrow();
  });

  it.each(["actor", "project", "round", "roundHash", "baselineHash", "planHash", "questions"])(
    "rejects a durable receipt after %s changes",
    (change) => {
      const h = harness(1),
        text = JSON.stringify(h.batch),
        scope = structuredClone(h.scope);
      if (change === "actor") scope.actorId = uuid("a9", 1);
      if (change === "project") scope.round.projectId = uuid("a9", 1);
      if (change === "round") scope.round.id = uuid("a9", 1);
      if (change === "roundHash") scope.round.manifestSha256 = "9".repeat(64);
      if (change === "baselineHash") scope.round.baselineSha256 = "9".repeat(64);
      if (change === "planHash") scope.round.planSha256 = "9".repeat(64);
      if (change === "questions") scope.round.manifest.questionIds.push("another-question");
      expect(() => readInspectionPhotoBatch(text, scope)).toThrow();
    },
  );

  it("resumes a committed write with a lost response using the same request, without a second write", async () => {
    const h = harness(1),
      save = h.api.saveBinding;
    h.api.saveBinding = vi.fn(async (input) => {
      await save(input);
      throw new Error("Synthetic response lost");
    });
    const requests = h.batch.entries.map((entry) => entry.receipt.input.requestId);
    await expect(h.run()).rejects.toThrow("response lost");
    expect(h.stored().entries[0].status).toBe("pending");
    expect(h.stored().entries.map((entry) => entry.receipt.input.requestId)).toEqual(requests);
    const resumed = await h.run();
    expect(resumed.entries[0].status).toBe("confirmed");
    expect(h.api.saveBinding).toHaveBeenCalledOnce();
    expect(h.api.getBinding).toHaveBeenCalledOnce();
  });

  it("retains the exact request when write succeeds but fresh readback fails", async () => {
    const h = harness(1),
      get = h.api.getBinding;
    h.api.getBinding = vi.fn(async () => null);
    await expect(h.run()).rejects.toThrow("læsebekræftelse");
    expect(h.stored().entries[0].receipt).toEqual(h.batch.entries[0].receipt);
    h.api.getBinding = get;
    expect((await h.run()).entries[0].status).toBe("confirmed");
    expect(h.api.saveBinding).toHaveBeenCalledOnce();
  });

  it("rechecks browser progress on reopen with the same IDs and only fresh reads", async () => {
    const h = harness(1);
    await h.run();
    const text = h.storage.getItem(inspectionPhotoBatchKey(h.scope));
    const reopened = reopenInspectionPhotoBatch(h.stored());
    expect(reopened.entries[0].status).toBe("pending");
    expect(reopened.entries[0].receipt).toEqual(h.batch.entries[0].receipt);
    writeInspectionPhotoBatch(h.storage, h.scope, reopened, text);
    await h.run();
    expect(h.api.saveBinding).toHaveBeenCalledOnce();
    expect(h.api.getBinding).toHaveBeenCalledTimes(2);
  });

  it("rechecks shared confirmed progress after waiting for another window instead of skipping it", async () => {
    const h = harness(1);
    await h.run();
    expect(h.stored().entries[0].status).toBe("confirmed");
    await h.run(h.batch);
    expect(h.api.getAccess).toHaveBeenCalledTimes(3);
    expect(h.api.getBinding).toHaveBeenCalledTimes(2);
    expect(h.api.saveBinding).toHaveBeenCalledOnce();
    expect(h.progress.at(-2)!.entries[0].status).toBe("pending");
    expect(h.progress.at(-1)!.entries[0].status).toBe("confirmed");
  });

  it("does not silently execute another window's changed photo requests on lock acquisition", async () => {
    const h = harness(1);
    const other = createInspectionPhotoBatch(h.scope, h.candidates, () => uuid("a8", 1));
    h.values.set(inspectionPhotoBatchKey(h.scope), JSON.stringify(other));
    await expect(h.run()).rejects.toThrow("valgte fotos");
    expect(h.api.getAccess).not.toHaveBeenCalled();
    expect(h.api.saveBinding).not.toHaveBeenCalled();
    expect(h.stored()).toEqual(other);
  });

  it.each(["actor", "project", "role"])(
    "checks fresh %s immediately before writing",
    async (change) => {
      const h = harness(1),
        access = h.api.getAccess;
      let count = 0;
      h.api.getAccess = vi.fn(async (input) => {
        const result = await access(input);
        if (++count === 2) {
          if (change === "actor") result.userId = uuid("a9", 1);
          if (change === "project") result.projectId = uuid("a9", 1);
          if (change === "role") result.canAssign = false;
        }
        return result;
      });
      await expect(h.run()).rejects.toThrow("aktuelle adgang");
      expect(h.api.saveBinding).not.toHaveBeenCalled();
      expect(h.stored().entries[0].status).toBe("pending");
    },
  );

  it("checks changed access again for the second photo, retaining the first confirmed result", async () => {
    const h = harness(2),
      access = h.api.getAccess;
    let count = 0;
    h.api.getAccess = vi.fn(async (input) => ({
      ...(await access(input)),
      canAssign: ++count < 4,
    }));
    await expect(h.run()).rejects.toThrow("aktuelle adgang");
    expect(h.api.saveBinding).toHaveBeenCalledOnce();
    expect(h.stored().entries.map((entry) => entry.status)).toEqual(["confirmed", "pending"]);
  });

  it.each(["access", "list", "writeAccess", "write", "read"])(
    "stops after %s if the actor/round changes or component unmounts",
    async (stage) => {
      const h = harness(2);
      if (stage === "access" || stage === "writeAccess") {
        const original = h.api.getAccess;
        let calls = 0;
        h.api.getAccess = vi.fn(async (input) => {
          const result = await original(input);
          if (++calls === (stage === "access" ? 1 : 2)) h.stale();
          return result;
        });
      }
      if (stage === "list") {
        const original = h.api.listBindings;
        h.api.listBindings = vi.fn(async (input) => {
          const result = await original(input);
          h.stale();
          return result;
        });
      }
      if (stage === "write") {
        const original = h.api.saveBinding;
        h.api.saveBinding = vi.fn(async (input) => {
          const result = await original(input);
          h.stale();
          return result;
        });
      }
      if (stage === "read") {
        const original = h.api.getBinding;
        h.api.getBinding = vi.fn(async (input) => {
          const result = await original(input);
          h.stale();
          return result;
        });
      }
      await expect(h.run()).rejects.toThrow("scope changed");
      expect(h.stored().entries.every((entry) => entry.status === "pending")).toBe(true);
      expect(h.api.saveBinding).toHaveBeenCalledTimes(
        stage === "write" || stage === "read" ? 1 : 0,
      );
      expect(h.api.getBinding).toHaveBeenCalledTimes(stage === "read" ? 1 : 0);
    },
  );

  it("shows an existing different-question binding as a conflict and stops before the next photo", async () => {
    const h = harness(2),
      existing = await h.savedFor(h.batch.entries[0].receipt);
    existing.requestId = uuid("a9", 1);
    existing.manifest.questionIds = [h.scope.round.manifest.questionIds[0]];
    existing.manifestSha256 = await baselineSha256(existing.manifest);
    const original = structuredClone(existing);
    h.saved.set(existing.mediaId, existing);
    const stopped = await h.run();
    expect(stopped.entries.map((entry) => entry.status)).toEqual(["conflict", "pending"]);
    expect(stopped.entries[0].message).toContain("bevares uændret");
    expect(h.api.saveBinding).not.toHaveBeenCalled();
    expect(h.saved.get(existing.mediaId)).toEqual(original);
    const resumed = await h.run(stopped);
    expect(resumed.entries.map((entry) => entry.status)).toEqual(["conflict", "confirmed"]);
    expect(h.api.saveBinding).toHaveBeenCalledOnce();
    expect(h.saved.get(existing.mediaId)).toEqual(original);
  });

  it.each(["actor", "request", "original", "question", "hash"])(
    "does not confirm a fresh response with a mismatching %s",
    async (change) => {
      const h = harness(1),
        get = h.api.getBinding;
      h.api.getBinding = vi.fn(async (input) => {
        const version = structuredClone((await get(input))!);
        if (change === "actor") version.createdBy = uuid("a9", 1);
        if (change === "request") version.requestId = uuid("a9", 1);
        if (change === "original") version.manifest.originalSha256 = "9".repeat(64);
        if (change === "question") version.manifest.questionIds = ["wrong-question"];
        if (change === "hash") version.manifestSha256 = "9".repeat(64);
        return version;
      });
      await expect(h.run()).rejects.toThrow();
      expect(h.stored().entries[0].status).toBe("pending");
      expect(h.stored().entries[0].receipt).toEqual(h.batch.entries[0].receipt);
    },
  );

  it("refuses to overwrite a batch changed by another window during authorization", async () => {
    const h = harness(1),
      access = h.api.getAccess;
    let count = 0;
    const other = createInspectionPhotoBatch(h.scope, h.candidates, () => uuid("a8", 1));
    const otherText = JSON.stringify(other);
    h.api.getAccess = vi.fn(async (input) => {
      const result = await access(input);
      if (++count === 2) h.values.set(inspectionPhotoBatchKey(h.scope), otherText);
      return result;
    });
    await expect(h.run()).rejects.toThrow("andet vindue");
    expect(h.api.saveBinding).not.toHaveBeenCalled();
    expect(h.storage.getItem(inspectionPhotoBatchKey(h.scope))).toBe(otherText);
  });

  it("fails closed when durable storage cannot confirm the full batch", () => {
    const h = harness(1);
    h.values.clear();
    const broken = { ...h.storage, setItem: () => {} };
    expect(() => writeInspectionPhotoBatch(broken, h.scope, h.batch, null)).toThrow();
    expect(h.api.saveBinding).not.toHaveBeenCalled();
  });
});
