import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SaveSurveyRoundNoteInput,
  SurveyRoundNoteVersion,
} from "@/services/baseline/survey-round-note-persistence";
import type { SurveyRoundNoteSaveResult } from "../survey-round-note-request";
type Access = { projectId: string; userId: string; canDraft: boolean };
type Mutation = {
  mutationKey: unknown[];
  mutationFn: () => Promise<SurveyRoundNoteSaveResult>;
  onSuccess: (result: SurveyRoundNoteSaveResult) => void;
  onError?: () => void;
};
const state = vi.hoisted(() => ({
  cursor: 0,
  hooks: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  userId: null as string | null,
  guided: false,
  access: null as Access | null,
  accessError: null as Error | null,
  accessPending: false,
  accessFn: null as null | (() => Promise<Access>),
  refetch: null as null | (() => Promise<{ data: Access | null; error: Error | null }>),
  notes: [] as SurveyRoundNoteVersion[],
  listError: null as Error | null,
  nextBefore: null as number | null,
  listFn: null as
    | null
    | (() => Promise<{ items: SurveyRoundNoteVersion[]; nextBeforeVersion: number | null }>),
  queries: {} as Record<
    string,
    { queryFn: (args?: unknown) => Promise<unknown>; queryKey: unknown[] }
  >,
  mutations: {} as Record<string, Mutation>,
  errors: {} as Record<string, Error | null>,
  resets: [] as string[],
  resetCallbacks: {} as Record<string, () => void>,
  saveCalls: [] as unknown[],
  readCalls: [] as unknown[],
  listCalls: [] as unknown[],
  invalidations: [] as unknown[],
  save: null as null | ((input: unknown) => Promise<SurveyRoundNoteVersion>),
  read: null as null | (() => Promise<SurveyRoundNoteVersion | null>),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = state.cursor++;
      if (!(i in state.hooks)) state.hooks[i] = typeof initial === "function" ? initial() : initial;
      return [
        state.hooks[i],
        (next: unknown) => {
          state.hooks[i] = typeof next === "function" ? next(state.hooks[i]) : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const i = state.cursor++;
      if (!(i in state.hooks)) state.hooks[i] = { current: initial };
      return state.hooks[i];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const i = state.cursor++,
        previous = state.hooks[i] as unknown[] | undefined;
      if (!previous || deps.some((dep, index) => dep !== previous[index])) {
        state.effects.push(effect);
        state.hooks[i] = deps;
      }
    },
  };
});
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: state.userId ? { id: state.userId } : null }),
}));
vi.mock("@/lib/survey-round-note.functions", () => ({
  getSurveyRoundNoteAccess: async () => (state.accessFn ? state.accessFn() : state.access),
  listSurveyRoundNotes: async (input: unknown) => {
    state.listCalls.push(input);
    return state.listFn
      ? state.listFn()
      : { items: state.notes, nextBeforeVersion: state.nextBefore };
  },
  saveSurveyRoundNote: async (input: unknown) => {
    state.saveCalls.push(input);
    if (!state.save) throw new Error("Synthetic writer absent");
    return state.save(input);
  },
  getSurveyRoundNote: async (input: unknown) => {
    state.readCalls.push(input);
    return state.read ? state.read() : null;
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: async (input: unknown) => {
      state.invalidations.push(input);
    },
  }),
  useQuery: (options: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
    state.queries[String(options.queryKey[0])] = options;
    return {
      data: state.access,
      error: state.accessError,
      isPending: state.accessPending,
      refetch: async () =>
        state.refetch ? state.refetch() : { data: state.access, error: state.accessError },
    };
  },
  useInfiniteQuery: (options: {
    queryKey: unknown[];
    queryFn: (args: unknown) => Promise<unknown>;
    enabled: boolean;
  }) => {
    state.queries[String(options.queryKey[0])] = options;
    return {
      data: options.enabled
        ? { pages: [{ items: state.notes, nextBeforeVersion: state.nextBefore }] }
        : undefined,
      error: state.listError,
      isPending: false,
      hasNextPage: state.nextBefore !== null,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  },
  useMutation: (options: Mutation) => {
    const kind = String(options.mutationKey[0]);
    state.mutations[kind] = options;
    return {
      isPending: false,
      error: state.errors[kind] ?? null,
      mutate: vi.fn(),
      reset: () => {
        state.errors[kind] = null;
        state.resets.push(kind);
        state.resetCallbacks[kind]?.();
      },
    };
  },
}));
import { SurveyRoundNotePanel } from "../SurveyRoundNotePanel";
import {
  makeRoundNoteFixture,
  NOTE_REQUEST_ID,
  LOGICAL_NOTE_ID,
} from "@/services/baseline/__tests__/survey-round-note.fixtures";
import {
  buildSurveyRoundNoteManifestV1,
  surveyRoundNoteVersionFromRow,
} from "@/services/baseline/survey-round-note-persistence";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  createSurveyRoundNoteReceipt,
  surveyRoundNoteReceiptKey,
} from "../survey-round-note-request";
let f: Awaited<ReturnType<typeof makeRoundNoteFixture>>;
const storage = new Map<string, string>();
function installStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
}
function tree(depth = 0): React.ReactElement {
  if (depth > 10) throw new Error("Synthetic effects did not settle");
  state.cursor = 0;
  state.effects = [];
  const result = SurveyRoundNotePanel({
    binding: f.binding,
    round: f.round,
    plan: f.plan,
    guided: state.guided,
  });
  if (state.effects.length) {
    for (const effect of state.effects) {
      const cleanup = effect();
      if (cleanup) state.cleanups.push(cleanup);
    }
    return tree(depth + 1);
  }
  return result;
}
function html() {
  return renderToStaticMarkup(tree());
}
function find(
  value: React.ReactNode,
  predicate: (props: Record<string, unknown>, type: unknown) => boolean,
): React.ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const hit = find(child, predicate);
      if (hit) return hit;
    }
    return;
  }
  if (!React.isValidElement<Record<string, unknown>>(value)) return;
  if (predicate(value.props, value.type)) return value;
  return find(value.props.children as React.ReactNode, predicate);
}
function change(label: string, value: string) {
  const target = find(tree(), (props) => props["aria-label"] === label)!;
  (target.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function complete() {
  change("Spørgsmål til den manuelle note", f.noteInput.questionId);
  change("Manuel vurdering", f.noteInput.manual.qualitativeAnswer);
  change("Manuel beskrivelse", f.noteInput.manual.manualStatement);
  change("Usikkerhed", f.noteInput.manual.uncertainty);
  change("Foreslået opfølgning", f.noteInput.manual.proposedFollowup);
  tree();
}
function mutation(kind = "save") {
  tree();
  return state.mutations[`survey-round-note-${kind}`];
}
function scope() {
  return { actorId: state.userId!, round: f.round, plan: f.plan, binding: f.binding };
}
async function savedFor(value: unknown) {
  const { expectedCallerUserId, ...input } = (
    value as { data: SaveSurveyRoundNoteInput & { expectedCallerUserId: string } }
  ).data;
  const m = await buildSurveyRoundNoteManifestV1(input, f.binding, f.plan);
  return surveyRoundNoteVersionFromRow(
    {
      ...f.noteRow,
      logical_note_id: input.logicalNoteId,
      request_id: input.requestId,
      created_by: expectedCallerUserId,
      manifest: m,
      manifest_sha256: await baselineSha256(m),
    },
    f.binding,
    f.plan,
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise((done) => setTimeout(done, 0));
  expect(predicate()).toBe(true);
}
function switchCaller() {
  state.userId = "a9000000-0000-4000-8000-000000000001";
  state.access = { ...state.access!, userId: state.userId };
  state.notes = [];
  tree();
}
async function run(kind = "save") {
  const m = mutation(kind);
  try {
    const result = await m.mutationFn();
    m.onSuccess(result);
    return result;
  } catch (error) {
    state.errors[`survey-round-note-${kind}`] = error as Error;
    m.onError?.();
    throw error;
  }
}
beforeEach(async () => {
  f = await makeRoundNoteFixture();
  Object.assign(state, {
    cursor: 0,
    hooks: [],
    effects: [],
    cleanups: [],
    userId: f.noteRow.created_by,
    guided: false,
    access: { projectId: f.round.projectId, userId: f.noteRow.created_by, canDraft: true },
    accessError: null,
    accessPending: false,
    accessFn: null,
    refetch: null,
    notes: [],
    listError: null,
    nextBefore: null,
    listFn: null,
    queries: {},
    mutations: {},
    errors: {},
    resets: [],
    resetCallbacks: {},
    saveCalls: [],
    readCalls: [],
    listCalls: [],
    invalidations: [],
  });
  storage.clear();
  installStorage();
  vi.stubGlobal("fetch", async () => {
    throw new Error("No network in note UI fixtures");
  });
  let ids = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(
    () =>
      [
        NOTE_REQUEST_ID,
        LOGICAL_NOTE_ID,
        "a8000000-0000-4000-8000-000000000001",
        "a8000000-0000-4000-8000-000000000002",
      ][ids++] as ReturnType<typeof crypto.randomUUID>,
  );
  let written: SurveyRoundNoteVersion | null = null;
  state.save = async (value) => {
    written = await savedFor(value);
    return written;
  };
  state.read = async () => written;
});
afterEach(() => {
  for (const cleanup of state.cleanups) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saved-photo manual note UI", () => {
  it("uses the one actual saved question in the guided flow but still requires an explicit assessment", async () => {
    state.guided = true;
    const out = html();
    expect(out).toContain(f.plan.manifest.questions[0].title);
    expect(out).not.toContain('aria-label="Spørgsmål til den manuelle note"');
    expect(out).toContain("Vælg vurdering");
    expect(out).toContain("Ikke vurderet");
    expect(state.saveCalls).toEqual([]);
    await expect(run()).rejects.toThrow();
    expect(state.saveCalls).toEqual([]);
    change("Manuel vurdering", f.noteInput.manual.qualitativeAnswer);
    change("Manuel beskrivelse", f.noteInput.manual.manualStatement);
    change("Usikkerhed", f.noteInput.manual.uncertainty);
    change("Foreslået opfølgning", f.noteInput.manual.proposedFollowup);
    await run();
    expect((state.saveCalls[0] as { data: SaveSurveyRoundNoteInput }).data.questionId).toBe(
      f.noteInput.questionId,
    );
    expect(html()).toContain("Ikke fagligt gennemgået");
  });
  it("requires an explicit answer and keeps priority unassessed without signing or auto-writing", () => {
    const out = html();
    expect(out).toContain(f.plan.manifest.questions[0].title);
    expect(out).toContain("Ikke vurderet");
    expect(out).toContain("Vælg vurdering");
    expect(out).toContain("ikke, at det er blevet set");
    expect(state.saveCalls).toEqual([]);
    expect(state.readCalls).toEqual([]);
  });
  it("persists the exact receipt before a caller-bound write, reads it back and presents an unreviewed note", async () => {
    complete();
    const original = state.save!;
    state.save = async (value) => {
      expect(storage.size).toBe(1);
      const data = (value as { data: SaveSurveyRoundNoteInput & { expectedCallerUserId: string } })
        .data;
      expect(data.expectedCallerUserId).toBe(f.noteRow.created_by);
      expect(data.manual.proposedPriority).toBe("not_assessed");
      expect(JSON.parse([...storage.values()][0]).input).toEqual(
        (({ expectedCallerUserId: _hint, ...input }) => input)(data),
      );
      return original(value);
    };
    await run();
    expect(state.readCalls).toHaveLength(1);
    expect(storage.size).toBe(0);
    expect(html()).toContain("Gemt manuel note · Ikke fagligt gennemgået");
    expect(html()).toContain(f.noteInput.manual.uncertainty);
    expect(html()).not.toContain("Godkendt");
  });
  it("does not send a writer request if browser persistence fails and retries the exact same IDs", async () => {
    complete();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: () => {
        throw new Error("denied");
      },
    });
    await expect(run()).rejects.toThrow("Ingen note er sendt");
    expect(state.saveCalls).toHaveLength(0);
    expect(html()).toContain("Samme note og genforsøg");
    installStorage();
    await run();
    expect((state.saveCalls[0] as { data: SaveSurveyRoundNoteInput }).data.requestId).toBe(
      NOTE_REQUEST_ID,
    );
    expect((state.saveCalls[0] as { data: SaveSurveyRoundNoteInput }).data.logicalNoteId).toBe(
      LOGICAL_NOTE_ID,
    );
  });
  it("recovers a lost writer response through a fresh read-only confirmation without another writer", async () => {
    complete();
    let written!: SurveyRoundNoteVersion;
    state.save = async (value) => {
      written = await savedFor(value);
      throw new Error("Synthetic response lost");
    };
    await expect(run()).rejects.toThrow("response lost");
    expect(storage.size).toBe(1);
    state.notes = [written];
    state.read = async () => written;
    await run("confirm");
    expect(storage.size).toBe(0);
    expect(state.saveCalls).toHaveLength(1);
    expect(html()).not.toContain("Synthetic response lost");
  });
  it("retries the identical note after a lost readback and never changes locked text or logical IDs", async () => {
    complete();
    state.read = async () => {
      throw new Error("Synthetic readback lost");
    };
    await expect(run()).rejects.toThrow("readback lost");
    const first = state.saveCalls[0];
    change("Manuel beskrivelse", "Forced edit of disabled field");
    state.read = async () => savedFor(first);
    await run();
    expect(state.saveCalls).toHaveLength(2);
    expect(state.saveCalls[1]).toEqual(first);
    expect(storage.size).toBe(0);
  });
  it("retains a cleanup-failed receipt and offers actual read-only confirmation with an empty cached list", async () => {
    complete();
    const m = mutation(),
      result = await m.mutationFn();
    expect(state.notes).toEqual([]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: () => {
        throw new Error("denied");
      },
    });
    m.onSuccess(result);
    expect(storage.size).toBe(1);
    expect(html()).toContain("kunne ikke ryddes");
    expect(html()).toContain("Bekræft den gemte note og ryd genforsøget");
    expect(state.invalidations).toHaveLength(1);
    installStorage();
    state.read = async () => result.version;
    await run("confirm");
    expect(storage.size).toBe(0);
    expect(state.saveCalls).toHaveLength(1);
  });
  it.each(["viewer", "wrong-caller", "revoked"])(
    "prevents the writer for %s access",
    async (kind) => {
      complete();
      if (kind === "viewer") state.access!.canDraft = false;
      if (kind === "wrong-caller")
        state.refetch = async () => ({
          data: { ...state.access!, userId: "a9000000-0000-4000-8000-000000000001" },
          error: null,
        });
      if (kind === "revoked")
        state.refetch = async () => ({ data: { ...state.access!, canDraft: false }, error: null });
      await expect(run()).rejects.toThrow();
      expect(state.saveCalls).toEqual([]);
    },
  );
  it("allows a current read-only contributor to confirm an already saved pending note", async () => {
    complete();
    let written!: SurveyRoundNoteVersion;
    state.save = async (value) => {
      written = await savedFor(value);
      throw new Error("lost");
    };
    await expect(run()).rejects.toThrow();
    state.access!.canDraft = false;
    state.notes = [written];
    state.read = async () => written;
    await run("confirm");
    expect(storage.size).toBe(0);
    expect(state.saveCalls).toHaveLength(1);
  });
  it("restores the exact request/logical ID and text after a fresh component instance", async () => {
    const receipt = await createSurveyRoundNoteReceipt(
      scope(),
      f.noteInput.questionId,
      f.noteInput.manual,
      NOTE_REQUEST_ID,
      LOGICAL_NOTE_ID,
    );
    storage.set(surveyRoundNoteReceiptKey(scope()), JSON.stringify(receipt));
    expect(html()).toContain("Samme note og genforsøg");
    await run();
    expect((state.saveCalls[0] as { data: SaveSurveyRoundNoteInput }).data.manual).toEqual(
      f.noteInput.manual,
    );
    expect((state.saveCalls[0] as { data: SaveSurveyRoundNoteInput }).data.logicalNoteId).toBe(
      LOGICAL_NOTE_ID,
    );
  });
  it("rejects stale access completion before the writer starts", async () => {
    complete();
    const waiting = deferred<{ data: Access | null; error: Error | null }>();
    const initial = state.access!;
    state.refetch = () => waiting.promise;
    const operation = mutation().mutationFn();
    switchCaller();
    waiting.resolve({ data: initial, error: null });
    await expect(operation).rejects.toThrow("ændret");
    expect(state.saveCalls).toEqual([]);
  });
  it.each(["caller", "binding-hash", "round-hash", "unmount"])(
    "ignores a stale write completion after %s",
    async (changeKind) => {
      complete();
      const waiting = deferred<SurveyRoundNoteVersion>();
      state.save = () => waiting.promise;
      const m = mutation(),
        operation = m.mutationFn();
      await until(() => state.saveCalls.length === 1);
      const written = await savedFor(state.saveCalls[0]);
      if (changeKind === "caller") switchCaller();
      if (changeKind === "binding-hash") {
        f.binding = { ...f.binding, manifestSha256: "a".repeat(64) };
        tree();
      }
      if (changeKind === "round-hash") {
        f.round = { ...f.round, manifestSha256: "a".repeat(64) };
        tree();
      }
      if (changeKind === "unmount") for (const cleanup of state.cleanups) cleanup();
      waiting.resolve(written);
      await expect(operation).rejects.toThrow("ændret");
      expect(state.readCalls).toHaveLength(0);
      expect(storage.size).toBe(1);
      expect(state.invalidations).toEqual([]);
    },
  );
  it("ignores a stale readback even if caller selection changes away and back", async () => {
    complete();
    const initial = state.userId;
    const waiting = deferred<SurveyRoundNoteVersion | null>();
    state.read = () => waiting.promise;
    const operation = mutation().mutationFn();
    await until(() => state.readCalls.length === 1);
    const written = await savedFor(state.saveCalls[0]);
    switchCaller();
    state.userId = initial;
    state.access = { ...state.access!, userId: initial! };
    tree();
    waiting.resolve(written);
    await expect(operation).rejects.toThrow("ændret");
    expect(storage.size).toBe(1);
  });
  it("scopes list cursors to this saved binding and rejects late or tampered lists", async () => {
    tree();
    const query = state.queries["survey-round-notes"];
    await query.queryFn({ pageParam: 19 });
    expect(state.listCalls[0]).toEqual({
      data: {
        projectId: f.round.projectId,
        roundVersionId: f.round.id,
        mediaBindingId: f.binding.id,
        beforeVersion: 19,
        limit: 30,
      },
    });
    const waiting = deferred<{
      items: SurveyRoundNoteVersion[];
      nextBeforeVersion: number | null;
    }>();
    state.listFn = () => waiting.promise;
    const old = query.queryFn({ pageParam: undefined });
    switchCaller();
    waiting.resolve({ items: [], nextBeforeVersion: null });
    await expect(old).rejects.toThrow("ændret");
    state.listFn = null;
    const bad = await surveyRoundNoteVersionFromRow(f.noteRow, f.binding, f.plan);
    bad.manifest.manual.uncertainty = "Changed";
    state.notes = [bad];
    tree();
    await expect(
      state.queries["survey-round-notes"].queryFn({ pageParam: undefined }),
    ).rejects.toThrow();
  });
  it("does not expose cached notes or enable writes after a denied list", async () => {
    state.notes = [await surveyRoundNoteVersionFromRow(f.noteRow, f.binding, f.plan)];
    state.listError = new Error("Synthetic list denied");
    const out = html();
    expect(out).toContain("Synthetic list denied");
    expect(out).not.toContain(f.noteInput.manual.manualStatement);
    expect(out).not.toContain("Ingen gemte manuelle noter");
    await expect(run()).rejects.toThrow();
    expect(state.saveCalls).toEqual([]);
  });
  it("serializes overlapping save invocations before asynchronous request construction", async () => {
    complete();
    const waiting = deferred<SurveyRoundNoteVersion>();
    state.save = () => waiting.promise;
    const m = mutation(),
      first = m.mutationFn();
    await expect(m.mutationFn()).rejects.toThrow("allerede i gang");
    await until(() => state.saveCalls.length === 1);
    state.read = () => savedFor(state.saveCalls[0]);
    waiting.resolve(await savedFor(state.saveCalls[0]));
    m.onSuccess(await first);
    expect(state.saveCalls).toHaveLength(1);
  });
  it("cannot let an old successful callback retire a newer pending logical note", async () => {
    complete();
    const old = mutation(),
      first = await old.mutationFn();
    old.onSuccess(first);
    complete();
    const latest = mutation(),
      second = await latest.mutationFn();
    old.onSuccess(first);
    expect(storage.size).toBe(1);
    expect(JSON.parse([...storage.values()][0]).input.logicalNoteId).toBe(
      second.receipt.input.logicalNoteId,
    );
    latest.onSuccess(second);
    expect(storage.size).toBe(0);
  });
  it("resets a real mutation observer on caller change without attaching the old failure to the new caller", async () => {
    complete();
    const original = mutation();
    const { MutationObserver, QueryClient } = await import("@tanstack/query-core");
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const waiting = deferred<SurveyRoundNoteVersion>();
    state.save = () => waiting.promise;
    const observer = new MutationObserver(client, {
      mutationKey: original.mutationKey,
      mutationFn: original.mutationFn,
      onSuccess: original.onSuccess,
    });
    const unsubscribe = observer.subscribe(() => {});
    const outcome = observer.mutate().then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
    await until(() => state.saveCalls.length === 1);
    const written = await savedFor(state.saveCalls[0]);
    switchCaller();
    const next = mutation();
    observer.setOptions({
      mutationKey: next.mutationKey,
      mutationFn: next.mutationFn,
      onSuccess: next.onSuccess,
    });
    expect(observer.getCurrentResult().isIdle).toBe(true);
    waiting.resolve(written);
    expect((await outcome).error).toBeInstanceOf(Error);
    expect(observer.getCurrentResult().error).toBeNull();
    expect(storage.size).toBe(1);
    unsubscribe();
    client.clear();
  });
  it("clears an actual failed mutation observer after later authorized read-only confirmation", async () => {
    complete();
    state.read = async () => {
      throw new Error("Synthetic readback response lost");
    };
    const original = mutation();
    const { MutationObserver, QueryClient } = await import("@tanstack/query-core");
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const observer = new MutationObserver(client, {
      mutationKey: original.mutationKey,
      mutationFn: original.mutationFn,
      onSuccess: original.onSuccess,
    });
    state.resetCallbacks["survey-round-note-save"] = () => observer.reset();
    const unsubscribe = observer.subscribe(() => {
      state.errors["survey-round-note-save"] = observer.getCurrentResult().error;
    });
    await expect(observer.mutate()).rejects.toThrow("readback response lost");
    expect(html()).toContain("Synthetic readback response lost");
    const written = await savedFor(state.saveCalls[0]);
    state.notes = [written];
    state.read = async () => written;
    await run("confirm");
    expect(observer.getCurrentResult().isIdle).toBe(true);
    expect(observer.getCurrentResult().error).toBeNull();
    expect(html()).not.toContain("Synthetic readback response lost");
    expect(storage.size).toBe(0);
    expect(state.saveCalls).toHaveLength(1);
    unsubscribe();
    client.clear();
  });
});
