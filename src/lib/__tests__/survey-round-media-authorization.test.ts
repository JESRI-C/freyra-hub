import { describe, expect, it, vi } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { ACTOR_ID, PROJECT_ID } from "@/services/baseline/__tests__/public-baseline.fixtures";
import {
  makeRoundMediaFixture,
  BINDING_ID,
} from "@/services/baseline/__tests__/survey-round-media.fixtures";
import {
  executeSaveSurveyRoundMediaForCaller,
  executeGetSurveyRoundMedia,
  executeListSurveyRoundMedia,
  executeGetSurveyRoundMediaOriginalUrl,
  executeGetSurveyRoundMediaAccess,
  executeListSurveyRoundMediaCandidates,
  type SurveyRoundMediaDependencies,
} from "@/lib/survey-round-media.functions";
const CLIENT = {} as never;
function historicalReadClient(f: Awaited<ReturnType<typeof fixture>>, lifecycleStatus: string) {
  const upload = {
    id: f.media.source_upload_id,
    project_id: PROJECT_ID,
    uploaded_by: ACTOR_ID,
    file_name: "original.jpg",
    original_file_name: "original.jpg",
    file_size: f.media.file_size_bytes,
    mime_type: "image/jpeg",
    upload_type: "drone_photo",
    storage_path: f.media.file_path,
    intent_request_id: "a6000000-0000-4000-8000-000000000001",
    received_at: f.validation.original.receivedAt,
    status: lifecycleStatus,
    original_validation: f.validation,
    original_validation_sha256: f.media.original_validation_sha256,
  };
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const client = {
    from: vi.fn((table: string) => {
      const read = { table, filters: [] as Array<[string, unknown]> };
      reads.push(read);
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          read.filters.push([column, value]);
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data: table === "project_media" ? f.media : table === "uploads" ? upload : null,
          error: null,
        })),
      };
      return query;
    }),
  };
  return { client: client as never, upload, reads };
}
async function fixture(role = "editor") {
  const f = await makeRoundMediaFixture(true);
  const deps = {
    authorize: vi.fn().mockResolvedValue({
      role,
      canPersist: [
        "editor",
        "admin",
        "project_manager",
        "organization_owner",
        "organization_admin",
      ].includes(role),
      centroid: null,
    }),
    loadRound: vi.fn().mockResolvedValue(f.round),
    loadOriginal: vi.fn().mockResolvedValue({ media: f.media, validation: f.validation }),
    loadBinding: vi.fn().mockResolvedValue(f.bindingRow),
    listBindings: vi.fn().mockResolvedValue([f.bindingRow]),
    listCandidates: vi.fn().mockResolvedValue([f.media]),
    getWriter: vi.fn().mockResolvedValue(CLIENT),
    prepare: vi.fn().mockResolvedValue(undefined),
    persist: vi
      .fn<SurveyRoundMediaDependencies["persist"]>()
      .mockImplementation(async (_writer, input, actorId, manifest) => ({
        ...f.bindingRow,
        request_id: input.requestId,
        created_by: actorId,
        manifest,
        manifest_sha256: await baselineSha256(manifest),
      })),
    sign: vi.fn().mockResolvedValue({
      projectId: PROJECT_ID,
      mediaId: f.media.id,
      signedUrl: "https://test.invalid/transient?token=test",
      expiresInSeconds: 60,
      originalSha256: f.media.original_sha256,
      reportEligible: false,
      georeferenced: false,
    }),
  } satisfies SurveyRoundMediaDependencies;
  return {
    ...f,
    deps,
    envelope: { ...f.bindingInput, expectedCallerUserId: ACTOR_ID },
  };
}
describe("current caller-bound draft photo assignments", () => {
  it.each(["archived", "processing", "ready"])(
    "default original loader preserves historical provenance at lifecycle %s",
    async (status) => {
      const f = await fixture("viewer"),
        { client, reads } = historicalReadClient(f, status);
      const { loadOriginal: _mockedLoader, ...overrides } = f.deps;
      const result = await executeGetSurveyRoundMedia(
        { projectId: PROJECT_ID, bindingId: BINDING_ID },
        ACTOR_ID,
        client,
        overrides,
      );
      const page = await executeListSurveyRoundMedia(
        { projectId: PROJECT_ID },
        ACTOR_ID,
        client,
        overrides,
      );
      expect(result?.manifestSha256).toBe(f.bindingRow.manifest_sha256);
      expect(page.items[0].manifest).toEqual(f.bindingManifest);
      expect(reads.map((read) => read.table)).toEqual([
        "project_media",
        "uploads",
        "project_media",
        "uploads",
      ]);
      for (const read of reads) expect(read.filters).toContainEqual(["project_id", PROJECT_ID]);
      expect(f.deps.getWriter).not.toHaveBeenCalled();
      expect(f.deps.prepare).not.toHaveBeenCalled();
      expect(f.deps.sign).not.toHaveBeenCalled();
    },
  );
  it("default historical parser neither consumes nor fabricates an upload lifecycle status", async () => {
    const f = await fixture("viewer"),
      { client, upload } = historicalReadClient(f, "archived");
    Object.defineProperty(upload, "status", {
      get() {
        throw new Error("Lifecycle must not participate in immutable replay");
      },
    });
    const { loadOriginal: _mockedLoader, ...overrides } = f.deps;
    expect(
      (
        await executeGetSurveyRoundMedia(
          { projectId: PROJECT_ID, bindingId: BINDING_ID },
          ACTOR_ID,
          client,
          overrides,
        )
      )?.id,
    ).toBe(BINDING_ID);
  });
  it("default historical loader still rejects changed immutable upload provenance", async () => {
    const f = await fixture("viewer"),
      { client, upload } = historicalReadClient(f, "archived");
    upload.storage_path = "foreign/changed.jpg";
    const { loadOriginal: _mockedLoader, ...overrides } = f.deps;
    await expect(
      executeGetSurveyRoundMedia(
        { projectId: PROJECT_ID, bindingId: BINDING_ID },
        ACTOR_ID,
        client,
        overrides,
      ),
    ).rejects.toThrow("uploadbinding");
  });
  it("default save preparation still denies unavailable current original after historical lifecycle advance", async () => {
    const f = await fixture(),
      { client } = historicalReadClient(f, "archived");
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "Current canonical upload archived" } });
    const { loadOriginal: _mockedLoader, prepare: _mockedPrepare, ...overrides } = f.deps;
    overrides.getWriter.mockResolvedValue({ rpc } as never);
    await expect(
      executeSaveSurveyRoundMediaForCaller(f.envelope, ACTOR_ID, client, overrides),
    ).rejects.toThrow("aktuelle filversion");
    expect(rpc).toHaveBeenCalledWith("prepare_project_media_original_read", {
      p_project_id: PROJECT_ID,
      p_media_id: f.media.id,
      p_actor_id: ACTOR_ID,
    });
    expect(overrides.persist).not.toHaveBeenCalled();
  });
  it("historical default loader may read archived provenance while a separate current signer denies", async () => {
    const f = await fixture("viewer"),
      { client } = historicalReadClient(f, "archived");
    f.deps.sign.mockRejectedValue(new Error("Current original unavailable"));
    const { loadOriginal: _mockedLoader, ...overrides } = f.deps;
    expect(
      (
        await executeGetSurveyRoundMedia(
          { projectId: PROJECT_ID, bindingId: BINDING_ID },
          ACTOR_ID,
          client,
          overrides,
        )
      )?.id,
    ).toBe(BINDING_ID);
    await expect(
      executeGetSurveyRoundMediaOriginalUrl(
        { projectId: PROJECT_ID, bindingId: BINDING_ID },
        ACTOR_ID,
        client,
        overrides,
      ),
    ).rejects.toThrow("Current original unavailable");
  });
  it.each([
    "editor",
    "field",
    "admin",
    "project_manager",
    "organization_owner",
    "organization_admin",
  ])("allows %s draft assignment only", async (role) => {
    const f = await fixture(role),
      result = await executeSaveSurveyRoundMediaForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps);
    expect(result.createdBy).toBe(ACTOR_ID);
    expect(result.manifest.status).toBe("draft_assignment");
    expect(result.manifest).not.toHaveProperty("expectedCallerUserId");
    expect(f.deps.persist).toHaveBeenCalledWith(CLIENT, f.bindingInput, ACTOR_ID, result.manifest);
    expect(f.deps.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      f.deps.loadRound.mock.invocationCallOrder[0],
    );
    expect(f.deps.loadOriginal.mock.invocationCallOrder[0]).toBeLessThan(
      f.deps.getWriter.mock.invocationCallOrder[0],
    );
    expect(f.deps.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      f.deps.persist.mock.invocationCallOrder[0],
    );
  });
  it.each(["viewer", "external"])(
    "denies %s before private input reads or privileged writer",
    async (role) => {
      const f = await fixture(role);
      await expect(
        executeSaveSurveyRoundMediaForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
      ).rejects.toThrow("rettighed");
      expect(f.deps.loadRound).not.toHaveBeenCalled();
      expect(f.deps.getWriter).not.toHaveBeenCalled();
    },
  );
  it("denies switched account before authorization or private reads", async () => {
    const f = await fixture();
    await expect(
      executeSaveSurveyRoundMediaForCaller(
        f.envelope,
        "ffffffff-0000-4000-8000-000000000001",
        CLIENT,
        f.deps,
      ),
    ).rejects.toThrow("Login er ændret");
    expect(f.deps.authorize).not.toHaveBeenCalled();
    expect(f.deps.getWriter).not.toHaveBeenCalled();
  });
  it.each([undefined, "broken"])("requires valid compare-only expected caller %j", async (hint) => {
    const f = await fixture();
    await expect(
      executeSaveSurveyRoundMediaForCaller(
        { ...f.envelope, expectedCallerUserId: hint } as never,
        ACTOR_ID,
        CLIENT,
        f.deps,
      ),
    ).rejects.toThrow();
    expect(f.deps.authorize).not.toHaveBeenCalled();
  });
  it("denies absent current membership before any privileged lookup", async () => {
    const f = await fixture();
    f.deps.authorize.mockRejectedValue(new Error("Project access denied"));
    await expect(
      executeSaveSurveyRoundMediaForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
    ).rejects.toThrow("access denied");
    expect(f.deps.loadRound).not.toHaveBeenCalled();
    expect(f.deps.prepare).not.toHaveBeenCalled();
  });
  it("denies an unavailable/changed current Storage object and never persists", async () => {
    const f = await fixture();
    f.deps.prepare.mockRejectedValue(new Error("Storage changed"));
    await expect(
      executeSaveSurveyRoundMediaForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
    ).rejects.toThrow("Storage changed");
    expect(f.deps.persist).not.toHaveBeenCalled();
  });
  it("rechecks current Storage and current SQL actor on every exact retry", async () => {
    const f = await fixture();
    const first = await executeSaveSurveyRoundMediaForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps);
    const again = await executeSaveSurveyRoundMediaForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps);
    expect(first.id).toBe(again.id);
    expect(f.deps.prepare).toHaveBeenCalledTimes(2);
    expect(f.deps.persist).toHaveBeenCalledTimes(2);
  });
  it.each(["created_by", "request_id", "project_id"])(
    "rejects a writer receipt with altered %s",
    async (field) => {
      const f = await fixture();
      f.deps.persist.mockResolvedValue({
        ...f.bindingRow,
        [field]: "ffffffff-0000-4000-8000-000000000001",
      });
      await expect(
        executeSaveSurveyRoundMediaForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
      ).rejects.toThrow();
    },
  );
  it("reads historical bindings as viewer without writer, Storage or signed URL", async () => {
    const f = await fixture("viewer"),
      network = vi.fn(() => {
        throw new Error("No network");
      });
    vi.stubGlobal("fetch", network);
    try {
      const value = await executeGetSurveyRoundMedia(
        { projectId: PROJECT_ID, bindingId: BINDING_ID },
        ACTOR_ID,
        CLIENT,
        f.deps,
      );
      expect(value?.manifest).toEqual(f.bindingManifest);
      expect(f.deps.getWriter).not.toHaveBeenCalled();
      expect(f.deps.prepare).not.toHaveBeenCalled();
      expect(f.deps.sign).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps historical provenance readable when separate current file signing fails", async () => {
    const f = await fixture("viewer");
    f.deps.sign.mockRejectedValue(new Error("Current object unavailable"));
    expect(
      (
        await executeGetSurveyRoundMedia(
          { projectId: PROJECT_ID, bindingId: BINDING_ID },
          ACTOR_ID,
          CLIENT,
          f.deps,
        )
      )?.id,
    ).toBe(BINDING_ID);
    await expect(
      executeGetSurveyRoundMediaOriginalUrl(
        { projectId: PROJECT_ID, bindingId: BINDING_ID },
        ACTOR_ID,
        CLIENT,
        f.deps,
      ),
    ).rejects.toThrow("Current object unavailable");
  });
  it("uses the existing current authorized signer only after exact saved binding replay", async () => {
    const f = await fixture("viewer"),
      result = await executeGetSurveyRoundMediaOriginalUrl(
        { projectId: PROJECT_ID, bindingId: BINDING_ID },
        ACTOR_ID,
        CLIENT,
        f.deps,
      );
    expect(f.deps.sign).toHaveBeenCalledWith(CLIENT, ACTOR_ID, PROJECT_ID, f.media.id);
    expect(f.deps.loadOriginal.mock.invocationCallOrder[0]).toBeLessThan(
      f.deps.sign.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      bindingId: BINDING_ID,
      bindingSha256: f.bindingRow.manifest_sha256,
      currentStorageVersionChecked: true,
      reportEligible: false,
    });
    expect(f.bindingRow.manifest).not.toHaveProperty("signedUrl");
  });
  it("rejects an incorrectly bound signer response", async () => {
    const f = await fixture();
    f.deps.sign.mockResolvedValue({
      ...(await f.deps.sign()),
      originalSha256: "f".repeat(64),
    });
    await expect(
      executeGetSurveyRoundMediaOriginalUrl(
        { projectId: PROJECT_ID, bindingId: BINDING_ID },
        ACTOR_ID,
        CLIENT,
        f.deps,
      ),
    ).rejects.toThrow("filversion");
  });
  it("lists only bounded replayed bindings with a stable project version cursor", async () => {
    const f = await fixture("viewer");
    const next = {
      ...f.bindingRow,
      id: "a4000000-0000-4000-8000-000000000002",
      version_no: 2,
    };
    f.deps.listBindings.mockResolvedValue([next, f.bindingRow]);
    const result = await executeListSurveyRoundMedia(
      { projectId: PROJECT_ID, limit: 1 },
      ACTOR_ID,
      CLIENT,
      f.deps,
    );
    expect(result.items[0].id).toBe(next.id);
    expect(result.nextBeforeVersion).toBe(2);
    expect(f.deps.getWriter).not.toHaveBeenCalled();
  });
  it.each([
    "wrong-project",
    "wrong-round",
    "wrong-media",
    "bad-cursor",
    "duplicates",
    "order",
    "over-limit",
  ])("rejects invalid list %s", async (kind) => {
    const f = await fixture();
    let rows: unknown[] = [f.bindingRow];
    const input = {
      projectId: PROJECT_ID,
      roundVersionId: f.round.id,
      mediaId: f.media.id,
      beforeVersion: 5,
      limit: 1,
    };
    if (kind === "wrong-project")
      rows = [{ ...f.bindingRow, project_id: "ffffffff-0000-4000-8000-000000000001" }];
    if (kind === "wrong-round")
      rows = [
        {
          ...f.bindingRow,
          round_version_id: "ffffffff-0000-4000-8000-000000000001",
        },
      ];
    if (kind === "wrong-media")
      rows = [{ ...f.bindingRow, media_id: "ffffffff-0000-4000-8000-000000000001" }];
    if (kind === "bad-cursor") input.beforeVersion = 1;
    if (kind === "duplicates") rows = [f.bindingRow, f.bindingRow];
    if (kind === "order")
      rows = [
        f.bindingRow,
        {
          ...f.bindingRow,
          id: "a4000000-0000-4000-8000-000000000002",
          version_no: 2,
        },
      ];
    if (kind === "over-limit") rows = [f.bindingRow, f.bindingRow, f.bindingRow];
    f.deps.listBindings.mockResolvedValue(rows);
    await expect(executeListSurveyRoundMedia(input, ACTOR_ID, CLIENT, f.deps)).rejects.toThrow();
  });
  it.each(["viewer", "field", "editor"])(
    "returns verified access for %s without private writer",
    async (role) => {
      const f = await fixture(role);
      expect(
        await executeGetSurveyRoundMediaAccess({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, f.deps),
      ).toEqual({
        projectId: PROJECT_ID,
        userId: ACTOR_ID,
        canAssign: role !== "viewer",
      });
      expect(f.deps.getWriter).not.toHaveBeenCalled();
    },
  );
  it("lists bounded canonical candidates without full paths, metadata or signing", async () => {
    const f = await fixture("viewer"),
      result = await executeListSurveyRoundMediaCandidates(
        { projectId: PROJECT_ID },
        ACTOR_ID,
        CLIENT,
        f.deps,
      );
    expect(result.items).toEqual([
      {
        mediaId: f.media.id,
        fileName: "original.jpg",
        originalSha256: f.media.original_sha256,
        originalValidationSha256: f.media.original_validation_sha256,
        originalValidationStatus: "review_required",
        sizeBytes: 137,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("intents/");
    expect(f.deps.getWriter).not.toHaveBeenCalled();
    expect(f.deps.sign).not.toHaveBeenCalled();
  });
  it.each(["foreign", "legacy", "cursor", "duplicate", "order", "unbounded"])(
    "rejects candidate list %s",
    async (kind) => {
      const f = await fixture();
      let rows = [f.media];
      const input = {
        projectId: PROJECT_ID,
        limit: 1,
        beforeId: "ffffffff-0000-4000-8000-000000000001",
      };
      if (kind === "foreign")
        rows = [{ ...f.media, project_id: "ffffffff-0000-4000-8000-000000000001" }];
      if (kind === "legacy") rows = [{ ...f.media, original_role: null as never }];
      if (kind === "cursor") input.beforeId = f.media.id;
      if (kind === "duplicate") rows = [f.media, f.media];
      if (kind === "order")
        rows = [f.media, { ...f.media, id: "a1000000-0000-4000-8000-000000000002" }];
      if (kind === "unbounded") rows = [f.media, f.media, f.media];
      f.deps.listCandidates.mockResolvedValue(rows);
      await expect(
        executeListSurveyRoundMediaCandidates(input, ACTOR_ID, CLIENT, f.deps),
      ).rejects.toThrow();
    },
  );
});
