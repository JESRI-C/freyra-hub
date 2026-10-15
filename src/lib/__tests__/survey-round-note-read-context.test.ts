import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeCase, makeClient } from "@/lib/__tests__/survey-round-note-read-context.fixtures";
import { ACTOR_ID, PROJECT_ID } from "@/services/baseline/__tests__/public-baseline.fixtures";
import {
  executeGetSurveyRoundNote,
  executeListSurveyRoundNotes,
  executeSaveSurveyRoundNoteForCaller,
} from "@/lib/survey-round-note.functions";
import { SaveSurveyRoundNoteInputSchema } from "@/services/baseline/survey-round-note-persistence";
import { createVerifiedInputContext } from "@/services/baseline/verified-input-context";

let single: Awaited<ReturnType<typeof makeCase>>, mixed: typeof single, distinct: typeof single;
beforeAll(async () => {
  single = await makeCase(1, 0);
  mixed = await makeCase(15, 0);
  distinct = await makeCase(30, 0);
});
const fixture = (value = single) => structuredClone(value);
const total = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
const readList = (client: ReturnType<typeof makeClient>["client"]) =>
  executeListSurveyRoundNotes({ projectId: PROJECT_ID, limit: 30 }, ACTOR_ID, client as never);

describe("current-authorized request-local note reads", () => {
  it.each([
    {
      name: "round plan",
      delay: "project_media",
      mutate: (f: typeof single) => {
        f.roundRow.plan_id = "ffffffff-0000-4000-8000-000000000001";
      },
    },
    {
      name: "round baseline",
      delay: "project_media",
      mutate: (f: typeof single) => {
        f.roundRow.baseline_id = "ffffffff-0000-4000-8000-000000000001";
      },
    },
    {
      name: "canonical upload pin",
      delay: "verification_plan_versions",
      mutate: (f: typeof single) => {
        f.allMedia[0].source_upload_id = "ffffffff-0000-4000-8000-000000000001";
      },
    },
    {
      name: "upload checksum",
      delay: "project_baseline_snapshots",
      mutate: (f: typeof single) => {
        f.allUploads[0].original_validation_sha256 = "f".repeat(64);
      },
    },
    {
      name: "nested upload validation",
      delay: "project_baseline_snapshots",
      mutate: (f: typeof single) => {
        f.allUploads[0].original_validation.original.sha256 = "f".repeat(64);
      },
    },
  ])(
    "plans later batches from the detached $name snapshot while another batch awaits",
    async ({ delay, mutate }) => {
      const f = fixture(),
        m = makeClient(f, false, true),
        from = m.client.from.bind(m.client);
      const expected = f.notes
        .slice(1)
        .reverse()
        .map((row) => row.manifest_sha256);
      const expectedIds = {
        survey_round_media_versions: [[f.allBindings[0].id]],
        survey_round_versions: [[f.roundRow.id]],
        verification_plan_versions: [[f.planRow.id]],
        project_baseline_snapshots: [[f.baselineRow.id]],
        project_media: [[f.allMedia[0].id]],
        uploads: [[f.allUploads[0].id]],
      };
      const requestedIds: Record<string, string[][]> = {};
      let mutated = false;
      m.client.from = (table: string) => {
        const query = from(table);
        const include = query.in.bind(query);
        query.in = (column, values) => {
          (requestedIds[table] ??= []).push(values.map(String).sort());
          return include(column, values);
        };
        if (table === delay) {
          const then = query.then.bind(query);
          query.then = (resolve, reject) =>
            then(async (value) => {
              await new Promise((done) => setTimeout(done, 0));
              mutate(f);
              mutated = true;
              return resolve(value);
            }, reject);
        }
        return query;
      };
      const result = await readList(m.client);
      expect(mutated).toBe(true);
      expect(result.items.map((row) => row.manifestSha256)).toEqual(expected);
      expect(total(m.queryCounts)).toBe(9);
      expect(Object.values(m.queryCounts)).toEqual(Array(9).fill(1));
      expect(requestedIds).toEqual(expectedIds);
      expect(m.rpcCalls).toBe(0);
    },
  );
  it.each(["one", "mixed", "distinct"])(
    "batches a 30-note %s-original page with one read per source table",
    async (kind) => {
      const f = fixture(kind === "one" ? single : kind === "mixed" ? mixed : distinct),
        m = makeClient(f);
      const before = structuredClone(f);
      const result = await readList(m.client);
      expect(result.items).toHaveLength(30);
      expect(result.nextBeforeVersion).toBe(2);
      expect(result.items.map((row) => row.id)).toEqual(
        f.notes
          .slice(1)
          .reverse()
          .map((row) => row.id),
      );
      expect(result.items.map((row) => row.manifestSha256)).toEqual(
        f.notes
          .slice(1)
          .reverse()
          .map((row) => row.manifest_sha256),
      );
      expect(total(m.queryCounts)).toBe(9);
      expect(Object.values(m.queryCounts)).toEqual(Array(9).fill(1));
      expect(m.queryCounts.organization_memberships).toBeUndefined();
      expect(m.rpcCalls).toBe(0);
      expect(f).toEqual(before);
    },
  );
  it("keeps org-owner fallback current without per-note authorization queries", async () => {
    const m = makeClient(fixture(distinct), true);
    expect((await readList(m.client)).items).toHaveLength(30);
    expect(total(m.queryCounts)).toBe(10);
    expect(m.queryCounts.organization_memberships).toBe(1);
  });
  it("reopens one note through the same exhaustive immutable boundaries", async () => {
    const f = fixture(),
      m = makeClient(f);
    const result = await executeGetSurveyRoundNote(
      { projectId: PROJECT_ID, noteVersionId: f.notes[0].id },
      ACTOR_ID,
      m.client as never,
    );
    expect(result?.manifest).toEqual(f.notes[0].manifest);
    expect(total(m.queryCounts)).toBe(9);
    expect(m.rpcCalls).toBe(0);
  });
  it("does not carry authorization or DB rows into the next request", async () => {
    const m = makeClient(fixture());
    await readList(m.client);
    m.tableRows.project_members = [];
    m.tableRows.organization_memberships = [];
    await expect(readList(m.client)).rejects.toThrow();
    expect(m.queryCounts.projects).toBe(2);
    expect(m.queryCounts.project_members).toBe(2);
    expect(m.queryCounts.survey_round_note_versions).toBe(1);
    expect(m.queryCounts.survey_round_media_versions).toBe(1);
  });
  it("authorizes before loading any note or immutable source row", async () => {
    const m = makeClient(fixture());
    m.tableRows.projects = [];
    await expect(readList(m.client)).rejects.toThrow();
    expect(m.queryCounts).toEqual({ projects: 1 });
  });
  it("handles an empty page without touching source rows", async () => {
    const m = makeClient(fixture());
    m.tableRows.survey_round_note_versions = [];
    expect(await readList(m.client)).toEqual({ items: [], nextBeforeVersion: null });
    expect(total(m.queryCounts)).toBe(3);
  });
  it.each([
    "media_binding_sha256",
    "round_sha256",
    "baseline_sha256",
    "plan_sha256",
    "original_sha256",
  ])("still checks each note's %s after earlier notes reused the same input", async (key) => {
    const f = fixture();
    (f.notes[28] as unknown as Record<string, unknown>)[key] = "f".repeat(64);
    const m = makeClient(f);
    await expect(readList(m.client)).rejects.toThrow();
    expect(m.queryCounts.survey_round_media_versions).toBe(1);
    expect(m.queryCounts.project_baseline_snapshots).toBe(1);
  });
  it.each(["duplicate", "foreign", "unrequested", "oversized", "missing"])(
    "rejects a malformed %s batch without falling back to hidden reads",
    async (kind) => {
      const f = fixture(),
        m = makeClient(f),
        from = m.client.from.bind(m.client);
      m.client.from = (table: string) => {
        const query = from(table);
        if (table === "survey_round_media_versions")
          query.then = (resolve, reject) => {
            m.queryCounts[table] = (m.queryCounts[table] ?? 0) + 1;
            let rows: Record<string, unknown>[] = structuredClone(f.allBindings);
            if (kind === "duplicate") rows = [rows[0], rows[0]];
            if (kind === "foreign")
              rows = [{ ...rows[0], project_id: "ffffffff-0000-4000-8000-000000000001" }];
            if (kind === "unrequested")
              rows = [{ ...rows[0], id: "ffffffff-0000-4000-8000-000000000001" }];
            if (kind === "oversized") rows = Array(31).fill(rows[0]);
            if (kind === "missing") rows = [];
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          };
        return query;
      };
      await expect(readList(m.client)).rejects.toThrow();
      expect(m.queryCounts.survey_round_media_versions).toBe(1);
    },
  );
  it("never reads mutable upload lifecycle even when the server row exposes a throwing getter", async () => {
    const f = fixture(distinct);
    for (const upload of f.allUploads)
      Object.defineProperty(upload, "status", {
        enumerable: true,
        get() {
          throw new Error("Historical reader inspected lifecycle");
        },
      });
    const m = makeClient(f, false, true);
    expect((await readList(m.client)).items).toHaveLength(30);
    expect(m.rpcCalls).toBe(0);
  });
  it.each(["plan", "baseline", "validation", "owner", "missing-original", "missing-upload"])(
    "rejects invalid %s data through the real default replay path",
    async (kind) => {
      const f = fixture(),
        m = makeClient(f);
      if (kind === "plan") f.planRow.manifest.questions[0].question = "Changed without checksum";
      if (kind === "baseline")
        f.baselineRow.manifest.sources[0].provider = "Changed without checksum";
      if (kind === "validation") f.allUploads[0].original_validation_sha256 = "f".repeat(64);
      if (kind === "owner") f.allUploads[0].uploaded_by = "ffffffff-0000-4000-8000-000000000001";
      if (kind === "missing-original") m.tableRows.project_media = [];
      if (kind === "missing-upload") m.tableRows.uploads = [];
      await expect(readList(m.client)).rejects.toThrow();
      expect(m.rpcCalls).toBe(0);
      for (const count of Object.values(m.queryCounts)) expect(count).toBeLessThanOrEqual(1);
    },
  );
  it("detaches source rows before asynchronous validation and rechecks fresh bytes next time", async () => {
    const f = fixture(),
      m = makeClient(f, false, true),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    const spy = vi.spyOn(crypto.subtle, "digest").mockImplementation((algorithm, data) => {
      if (!changed) {
        changed = true;
        f.baselineRow.manifest.sources[0].provider = "Mutation after detached snapshot";
      }
      return digest(algorithm, data);
    });
    try {
      expect((await readList(m.client)).items).toHaveLength(30);
    } finally {
      spy.mockRestore();
    }
    expect(changed).toBe(true);
    await expect(readList(m.client)).rejects.toThrow();
  });
  it.each(["forged", "genuine"])(
    "rejects %s context transport input before authorization",
    async (kind) => {
      const genuine = createVerifiedInputContext(),
        context = kind === "genuine" ? genuine : Object.create(Object.getPrototypeOf(genuine));
      const m = makeClient(fixture());
      await expect(
        executeListSurveyRoundNotes(
          { projectId: PROJECT_ID, context } as never,
          ACTOR_ID,
          m.client as never,
        ),
      ).rejects.toThrow();
      expect(m.queryCounts).toEqual({});
    },
  );
  it("still runs the current original prepare guard on every save/retry", async () => {
    const f = fixture(),
      m = makeClient(f),
      row = f.notes[0];
    const raw = Object.fromEntries(
      Object.keys(SaveSurveyRoundNoteInputSchema.shape).map((key) => [
        key,
        key === "requestId"
          ? row.request_id
          : (row.manifest as unknown as Record<string, unknown>)[key],
      ]),
    );
    const envelope = {
      ...SaveSurveyRoundNoteInputSchema.parse(raw),
      expectedCallerUserId: ACTOR_ID,
    };
    const prepare = vi.fn().mockRejectedValue(new Error("Current original version changed")),
      persist = vi.fn();
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(
        executeSaveSurveyRoundNoteForCaller(envelope, ACTOR_ID, m.client as never, {
          getWriter: async () => m.client as never,
          prepare,
          persist,
        }),
      ).rejects.toThrow("Current original version changed");
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(persist).not.toHaveBeenCalled();
    expect(m.queryCounts.project_baseline_snapshots).toBe(2);
  });
});
