import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/survey-round-media.functions", () => ({ executeGetSurveyRoundMedia: vi.fn() }));
vi.mock("@/lib/verification-plan.functions", () => ({ executeGetVerificationPlan: vi.fn() }));
import {
  makeRoundNoteFixture,
  NOTE_ID,
} from "@/services/baseline/__tests__/survey-round-note.fixtures";
import { ACTOR_ID, PROJECT_ID } from "@/services/baseline/__tests__/public-baseline.fixtures";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  executeGetSurveyRoundNoteAccess,
  executeSaveSurveyRoundNoteForCaller,
  executeGetSurveyRoundNote,
  executeListSurveyRoundNotes,
  type SurveyRoundNoteDependencies,
} from "@/lib/survey-round-note.functions";
const CLIENT = {} as never;
async function fixture(role = "editor") {
  const f = await makeRoundNoteFixture();
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
    loadBinding: vi.fn().mockResolvedValue(f.binding),
    loadPlan: vi.fn().mockResolvedValue(f.plan),
    loadNote: vi.fn().mockResolvedValue(f.noteRow),
    listNotes: vi.fn().mockResolvedValue([f.noteRow]),
    getWriter: vi.fn().mockResolvedValue(CLIENT),
    prepare: vi.fn().mockResolvedValue(undefined),
    persist: vi.fn(async (_writer, _input, _actor, manifest) => ({
      ...f.noteRow,
      manifest,
      manifest_sha256: await baselineSha256(manifest),
    })),
  } satisfies SurveyRoundNoteDependencies;
  return { ...f, deps, envelope: { ...f.noteInput, expectedCallerUserId: ACTOR_ID } };
}
describe("current authorized manual note endpoints", () => {
  it.each(["valid", "hash", "storage", "owner"])(
    "default prepare enforces canonical original %s",
    async (kind) => {
      const f = await fixture();
      const prepared = {
        media: structuredClone(f.media),
        upload: {
          id: f.media.source_upload_id,
          project_id: PROJECT_ID,
          storage_path: f.media.file_path,
          original_sha256: f.media.original_sha256,
          original_validation_sha256: f.media.original_validation_sha256,
          uploaded_by: ACTOR_ID,
        },
        object: {
          id: f.media.storage_object_id,
          version: f.media.storage_object_version,
          updated_at: f.media.storage_object_updated_at,
          owner_id: ACTOR_ID,
          size: f.media.file_size_bytes,
          mimetype: "image/jpeg",
        },
      };
      if (kind === "hash") prepared.media.original_sha256 = "f".repeat(64);
      if (kind === "storage") prepared.object.version = "changed";
      if (kind === "owner") prepared.object.owner_id = "ffffffff-0000-4000-8000-000000000001";
      const writer = { rpc: vi.fn().mockResolvedValue({ data: prepared, error: null }) };
      const { prepare: _prepare, ...deps } = f.deps;
      deps.getWriter.mockResolvedValue(writer as never);
      const call = executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, deps);
      if (kind === "valid") {
        expect((await call).id).toBe(NOTE_ID);
        expect(writer.rpc).toHaveBeenCalledWith("prepare_project_media_original_read", {
          p_project_id: PROJECT_ID,
          p_media_id: f.media.id,
          p_actor_id: ACTOR_ID,
        });
      } else {
        await expect(call).rejects.toThrow();
        expect(deps.persist).not.toHaveBeenCalled();
      }
    },
  );
  it.each([
    "editor",
    "field",
    "admin",
    "project_manager",
    "organization_owner",
    "organization_admin",
  ])("permits %s manual drafts", async (role) => {
    const f = await fixture(role);
    expect(
      (await executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps)).id,
    ).toBe(NOTE_ID);
    expect(f.deps.persist).toHaveBeenCalledOnce();
    expect(f.deps.prepare).toHaveBeenCalledBefore(f.deps.persist);
    expect(f.deps.persist.mock.calls[0][2]).toBe(ACTOR_ID);
    expect(f.deps.persist.mock.calls[0][1]).not.toHaveProperty("expectedCallerUserId");
  });
  it.each(["viewer", "external"])("%s reads but cannot draft", async (role) => {
    const f = await fixture(role);
    expect(
      (await executeGetSurveyRoundNoteAccess({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, f.deps))
        .canDraft,
    ).toBe(false);
    await expect(
      executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
    ).rejects.toThrow();
    expect(f.deps.loadBinding).not.toHaveBeenCalled();
    expect(f.deps.getWriter).not.toHaveBeenCalled();
    expect(
      (
        await executeGetSurveyRoundNote(
          { projectId: PROJECT_ID, noteVersionId: NOTE_ID },
          ACTOR_ID,
          CLIENT,
          f.deps,
        )
      )?.id,
    ).toBe(NOTE_ID);
  });
  it("compares caller before any authorization/data/writer work", async () => {
    const f = await fixture();
    await expect(
      executeSaveSurveyRoundNoteForCaller(
        { ...f.envelope, expectedCallerUserId: "ffffffff-0000-4000-8000-000000000001" },
        ACTOR_ID,
        CLIENT,
        f.deps,
      ),
    ).rejects.toThrow();
    expect(f.deps.authorize).not.toHaveBeenCalled();
    expect(f.deps.loadBinding).not.toHaveBeenCalled();
    expect(f.deps.getWriter).not.toHaveBeenCalled();
  });
  it.each(["missing", "actorInjected", "approvalInjected"])(
    "rejects malformed %s envelope",
    async (kind) => {
      const f = await fixture();
      const raw: Record<string, unknown> = { ...f.envelope };
      if (kind === "missing") delete raw.expectedCallerUserId;
      if (kind === "actorInjected") raw.actorId = ACTOR_ID;
      if (kind === "approvalInjected") raw.professionalApproved = true;
      await expect(
        executeSaveSurveyRoundNoteForCaller(raw as never, ACTOR_ID, CLIENT, f.deps),
      ).rejects.toThrow();
      expect(f.deps.authorize).not.toHaveBeenCalled();
    },
  );
  it.each(["save", "get", "list", "access"])(
    "denies current auth before %s data access",
    async (op) => {
      const f = await fixture();
      f.deps.authorize.mockRejectedValue(new Error("denied"));
      await expect(
        op === "save"
          ? executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps)
          : op === "get"
            ? executeGetSurveyRoundNote(
                { projectId: PROJECT_ID, noteVersionId: NOTE_ID },
                ACTOR_ID,
                CLIENT,
                f.deps,
              )
            : op === "list"
              ? executeListSurveyRoundNotes({ projectId: PROJECT_ID }, ACTOR_ID, CLIENT, f.deps)
              : executeGetSurveyRoundNoteAccess(
                  { projectId: PROJECT_ID },
                  ACTOR_ID,
                  CLIENT,
                  f.deps,
                ),
      ).rejects.toThrow();
      expect(f.deps.loadBinding).not.toHaveBeenCalled();
      expect(f.deps.loadNote).not.toHaveBeenCalled();
      expect(f.deps.listNotes).not.toHaveBeenCalled();
      expect(f.deps.getWriter).not.toHaveBeenCalled();
    },
  );
  it.each(["missing", "foreign", "wrongId"])(
    "rejects %s assignment before writer",
    async (kind) => {
      const f = await fixture();
      f.deps.loadBinding.mockResolvedValue(
        kind === "missing"
          ? null
          : kind === "foreign"
            ? { ...f.binding, projectId: "ffffffff-0000-4000-8000-000000000001" }
            : { ...f.binding, id: "ffffffff-0000-4000-8000-000000000001" },
      );
      await expect(
        executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
      ).rejects.toThrow();
      expect(f.deps.getWriter).not.toHaveBeenCalled();
    },
  );
  it("fails unavailable/changed current original before any insert including retry", async () => {
    const f = await fixture();
    f.deps.prepare.mockRejectedValue(new Error("storage version changed or revoked"));
    await expect(
      executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
    ).rejects.toThrow();
    expect(f.deps.persist).not.toHaveBeenCalled();
  });
  it("leaves writer current-role rejection visible", async () => {
    const f = await fixture();
    f.deps.persist.mockRejectedValue(new Error("locked role denied"));
    await expect(
      executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
    ).rejects.toThrow("locked role denied");
  });
  it.each(["created_by", "request_id", "logical_note_id", "project_id"])(
    "rejects returned %s mismatch",
    async (key) => {
      const f = await fixture();
      f.deps.persist.mockResolvedValue({
        ...f.noteRow,
        [key]: "ffffffff-0000-4000-8000-000000000001",
      });
      await expect(
        executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
      ).rejects.toThrow();
    },
  );
  it("retry sends identical request, actor and canonical manifest", async () => {
    const f = await fixture();
    const a = await executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps),
      b = await executeSaveSurveyRoundNoteForCaller(f.envelope, ACTOR_ID, CLIENT, f.deps);
    expect(a).toEqual(b);
    expect(f.deps.prepare).toHaveBeenCalledTimes(2);
    expect(f.deps.persist.mock.calls[0]).toEqual(f.deps.persist.mock.calls[1]);
  });
  it("historical get uses DB input replay only, no writer or prepare", async () => {
    const f = await fixture("viewer"),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      expect(
        (
          await executeGetSurveyRoundNote(
            { projectId: PROJECT_ID, noteVersionId: NOTE_ID },
            ACTOR_ID,
            CLIENT,
            f.deps,
          )
        )?.manifest,
      ).toEqual(f.noteManifest);
      expect(f.deps.getWriter).not.toHaveBeenCalled();
      expect(f.deps.prepare).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("returns absence and rejects another returned version", async () => {
    const f = await fixture();
    f.deps.loadNote.mockResolvedValueOnce(null);
    expect(
      await executeGetSurveyRoundNote(
        { projectId: PROJECT_ID, noteVersionId: NOTE_ID },
        ACTOR_ID,
        CLIENT,
        f.deps,
      ),
    ).toBeNull();
    f.deps.loadNote.mockResolvedValue({ ...f.noteRow, id: "ffffffff-0000-4000-8000-000000000001" });
    await expect(
      executeGetSurveyRoundNote(
        { projectId: PROJECT_ID, noteVersionId: NOTE_ID },
        ACTOR_ID,
        CLIENT,
        f.deps,
      ),
    ).rejects.toThrow();
  });
  it("uses project cursor with lookahead, then resumes without duplicates", async () => {
    const f = await fixture();
    const second = { ...f.noteRow, id: "b1000000-0000-4000-8000-000000000002", version_no: 2 };
    f.deps.listNotes.mockResolvedValueOnce([second, f.noteRow]).mockResolvedValueOnce([f.noteRow]);
    const p1 = await executeListSurveyRoundNotes(
        { projectId: PROJECT_ID, limit: 1 },
        ACTOR_ID,
        CLIENT,
        f.deps,
      ),
      p2 = await executeListSurveyRoundNotes(
        { projectId: PROJECT_ID, limit: 1, beforeVersion: p1.nextBeforeVersion! },
        ACTOR_ID,
        CLIENT,
        f.deps,
      );
    expect(p1.items.map((n) => n.id)).toEqual([second.id]);
    expect(p1.nextBeforeVersion).toBe(2);
    expect(p2.items.map((n) => n.id)).toEqual([NOTE_ID]);
    expect(p2.nextBeforeVersion).toBeNull();
    expect(f.deps.getWriter).not.toHaveBeenCalled();
  });
  it.each(["foreign", "duplicate", "order", "cursor", "round", "binding", "unbounded"])(
    "rejects malformed %s page before input replay",
    async (kind) => {
      const f = await fixture();
      let rows = [f.noteRow];
      const input = {
        projectId: PROJECT_ID,
        limit: 1,
        beforeVersion: 3,
        roundVersionId: f.round.id,
        mediaBindingId: f.binding.id,
      };
      if (kind === "foreign")
        rows = [{ ...f.noteRow, project_id: "ffffffff-0000-4000-8000-000000000001" }];
      if (kind === "duplicate") rows = [f.noteRow, f.noteRow];
      if (kind === "order")
        rows = [
          f.noteRow,
          { ...f.noteRow, id: "b1000000-0000-4000-8000-000000000002", version_no: 2 },
        ];
      if (kind === "cursor") input.beforeVersion = 1;
      if (kind === "round") input.roundVersionId = "ffffffff-0000-4000-8000-000000000001";
      if (kind === "binding") input.mediaBindingId = "ffffffff-0000-4000-8000-000000000001";
      if (kind === "unbounded") rows = [f.noteRow, f.noteRow, f.noteRow];
      f.deps.listNotes.mockResolvedValue(rows);
      await expect(executeListSurveyRoundNotes(input, ACTOR_ID, CLIENT, f.deps)).rejects.toThrow();
      expect(f.deps.loadBinding).not.toHaveBeenCalled();
    },
  );
});
