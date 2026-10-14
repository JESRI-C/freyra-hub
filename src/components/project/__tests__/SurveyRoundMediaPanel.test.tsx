import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import type { SurveyRoundMediaCandidate } from "@/lib/survey-round-media.functions";
import type { SurveyRoundMediaSaveResult } from "../survey-round-media-request";
type Access = { projectId: string; userId: string; canAssign: boolean };
type Mutation = {
  mutationKey: unknown[];
  mutationFn: () => Promise<SurveyRoundMediaSaveResult>;
  onSuccess: (result: SurveyRoundMediaSaveResult) => void;
};
const state = vi.hoisted(() => ({
  cursor: 0,
  hooks: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  userId: null as string | null,
  access: null as Access | null,
  accessError: null as Error | null,
  accessPending: false,
  refetch: null as null | (() => Promise<{ data: Access | null; error: Error | null }>),
  queries: {} as Record<string, { queryFn: (...args: unknown[]) => Promise<unknown> }>,
  candidates: [] as SurveyRoundMediaCandidate[],
  candidateError: null as Error | null,
  bindings: [] as SurveyRoundMediaVersion[],
  bindingError: null as Error | null,
  mutations: {} as Record<string, Mutation>,
  mutationErrors: {} as Record<string, Error | null>,
  mutationResets: [] as string[],
  mutationResetCallbacks: {} as Record<string, () => void>,
  saveCalls: [] as unknown[],
  readCalls: [] as unknown[],
  signCalls: [] as unknown[],
  invalidations: [] as unknown[],
  save: null as null | ((input: unknown) => Promise<SurveyRoundMediaVersion>),
  read: null as null | (() => Promise<SurveyRoundMediaVersion | null>),
  sign: null as null | (() => Promise<unknown>),
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
vi.mock("@/lib/survey-round-media.functions", () => ({
  getSurveyRoundMediaAccess: async () => state.access,
  listSurveyRoundMediaCandidates: async () => ({ items: state.candidates, nextBeforeId: null }),
  listSurveyRoundMedia: async () => ({ items: state.bindings, nextBeforeVersion: null }),
  saveSurveyRoundMedia: async (input: unknown) => {
    state.saveCalls.push(input);
    if (!state.save) throw new Error("Synthetic writer response absent");
    return state.save(input);
  },
  getSurveyRoundMedia: async (input: unknown) => {
    state.readCalls.push(input);
    return state.read ? state.read() : null;
  },
  getSurveyRoundMediaOriginalUrl: async (input: unknown) => {
    state.signCalls.push(input);
    if (!state.sign) throw new Error("Synthetic signer unavailable");
    return state.sign();
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: async (value: unknown) => {
      state.invalidations.push(value);
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
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  }) => {
    const kind = String(options.queryKey[0]);
    state.queries[kind] = options;
    const candidates = kind === "survey-round-media-candidates";
    return {
      data: options.enabled
        ? { pages: [{ items: candidates ? state.candidates : state.bindings }] }
        : undefined,
      error: candidates ? state.candidateError : state.bindingError,
      isPending: false,
      hasNextPage: false,
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
      error: state.mutationErrors[kind] ?? null,
      mutate: vi.fn(),
      reset: () => {
        state.mutationErrors[kind] = null;
        state.mutationResets.push(kind);
        state.mutationResetCallbacks[kind]?.();
      },
    };
  },
}));
import { SurveyRoundMediaPanel } from "../SurveyRoundMediaPanel";
import { makeMediaUiFixture, REQUEST_ID } from "./survey-round-media-ui.fixtures";
import {
  createSurveyRoundMediaReceipt,
  surveyRoundMediaReceiptKey,
} from "../survey-round-media-request";

let fixture: Awaited<ReturnType<typeof makeMediaUiFixture>>;
const storage = new Map<string, string>();
function tree(runEffects = true, depth = 0): React.ReactElement {
  if (depth > 10) throw new Error("Synthetic effect queue did not settle");
  state.cursor = 0;
  state.effects = [];
  const result = SurveyRoundMediaPanel({ round: fixture.round, plan: fixture.plan });
  if (runEffects && state.effects.length) {
    for (const effect of state.effects) {
      const cleanup = effect();
      if (cleanup) state.cleanups.push(cleanup);
    }
    return tree(true, depth + 1);
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
      const found = find(child, predicate);
      if (found) return found;
    }
    return;
  }
  if (!React.isValidElement<Record<string, unknown>>(value)) return;
  if (predicate(value.props, value.type)) return value;
  return find(value.props.children as React.ReactNode, predicate);
}
function change(label: string, value: string) {
  const element = find(tree(), (props) => props["aria-label"] === label)!;
  (element.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function complete() {
  change("Originalfoto til runden", fixture.candidate.mediaId);
  const checkbox = find(tree(), (props, type) => type === "input" && props.type === "checkbox")!;
  (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({
    target: { checked: true },
  });
  tree();
}
function saveMutation() {
  tree();
  return state.mutations["survey-round-media-save"];
}
function writerInput(value: unknown) {
  const { expectedCallerUserId: _callerHint, ...input } = (
    value as { data: typeof fixture.input & { expectedCallerUserId: string } }
  ).data;
  return input;
}
function confirmMutation() {
  tree();
  return state.mutations["survey-round-media-confirm"];
}
async function preview() {
  const button = find(tree(), (props) => props.children === "Vis originalfoto med aktuel adgang")!;
  await (button.props.onClick as () => Promise<void>)();
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function switchCaller() {
  state.userId = "a9000000-0000-4000-8000-000000000001";
  state.access = { ...state.access!, userId: state.userId };
  state.bindings = [];
  tree();
  complete();
}
beforeEach(async () => {
  fixture = await makeMediaUiFixture();
  state.cursor = 0;
  state.hooks = [];
  state.effects = [];
  state.cleanups = [];
  state.queries = {};
  state.mutations = {};
  state.mutationErrors = {};
  state.mutationResets = [];
  state.mutationResetCallbacks = {};
  state.invalidations = [];
  state.userId = fixture.row.created_by;
  state.access = { projectId: fixture.round.projectId, userId: state.userId, canAssign: true };
  state.accessError = null;
  state.accessPending = false;
  state.refetch = null;
  state.candidates = [fixture.candidate];
  state.candidateError = null;
  state.bindings = [];
  state.bindingError = null;
  state.saveCalls = [];
  state.readCalls = [];
  state.signCalls = [];
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(REQUEST_ID);
  let written: SurveyRoundMediaVersion | null = null;
  state.save = async (value) => {
    written = await fixture.savedFor(writerInput(value));
    return written;
  };
  state.read = async () => written;
  state.sign = async () => ({
    projectId: fixture.round.projectId,
    mediaId: fixture.media.id,
    bindingId: fixture.version.id,
    bindingSha256: fixture.version.manifestSha256,
    originalSha256: fixture.media.original_sha256,
    currentStorageVersionChecked: true,
    expiresInSeconds: 60,
    reportEligible: false,
    georeferenced: false,
    signedUrl: "https://synthetic.invalid/original?token=ephemeral",
  });
});
afterEach(() => {
  for (const cleanup of state.cleanups) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("saved round original-photo assignment UI", () => {
  it("resets the actual mutation observer for a new caller while preserving the old unresolved receipt", async () => {
    complete();
    const original = saveMutation();
    const { MutationObserver, QueryClient } = await import("@tanstack/query-core");
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const waiting = deferred<SurveyRoundMediaVersion>();
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
    for (let n = 0; n < 20 && state.saveCalls.length === 0; n++) await Promise.resolve();
    expect(state.saveCalls).toHaveLength(1);
    switchCaller();
    const next = saveMutation();
    observer.setOptions({
      mutationKey: next.mutationKey,
      mutationFn: next.mutationFn,
      onSuccess: next.onSuccess,
    });
    expect(observer.getCurrentResult().isIdle).toBe(true);
    waiting.resolve(fixture.version);
    expect((await outcome).error).toBeInstanceOf(Error);
    expect(observer.getCurrentResult().error).toBeNull();
    expect(observer.getCurrentResult().isPending).toBe(false);
    expect(storage.size).toBe(1);
    unsubscribe();
    client.clear();
  });
  it("retains a confirmed request if browser cleanup fails and permits a fresh read-only confirmation", async () => {
    complete();
    const mutation = saveMutation(),
      result = await mutation.mutationFn();
    expect(state.bindings).toEqual([]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: () => {
        throw new Error("Synthetic cleanup denied");
      },
    });
    mutation.onSuccess(result);
    expect(storage.size).toBe(1);
    expect(html()).toContain("kunne ikke ryddes");
    expect(html()).toContain("Bekræft og ryd genforsøgsreferencen igen");
    expect(state.invalidations).toHaveLength(1);
    expect(state.mutationResets).toEqual([]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    state.read = async () => result.version;
    const confirmation = confirmMutation();
    confirmation.onSuccess(await confirmation.mutationFn());
    expect(storage.size).toBe(0);
    expect(state.saveCalls).toHaveLength(1);
  });
  it.each(["confirm", "conflict"])(
    "clears the obsolete failed save after successful read-only %s recovery",
    async (operation) => {
      complete();
      state.read = async () => {
        throw new Error("Synthetic lost readback response");
      };
      const original = saveMutation();
      const { MutationObserver, QueryClient } = await import("@tanstack/query-core");
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const observer = new MutationObserver(client, {
        mutationKey: original.mutationKey,
        mutationFn: original.mutationFn,
        onSuccess: original.onSuccess,
      });
      state.mutationResetCallbacks["survey-round-media-save"] = () => observer.reset();
      const unsubscribe = observer.subscribe(() => {
        state.mutationErrors["survey-round-media-save"] = observer.getCurrentResult().error;
      });
      await expect(observer.mutate()).rejects.toThrow("Synthetic lost readback response");
      expect(html()).toContain("Synthetic lost readback response");
      const version =
        operation === "confirm"
          ? fixture.version
          : await fixture.savedFor({
              ...fixture.input,
              requestId: "a8000000-0000-4000-8000-000000000001",
            });
      state.bindings = [version];
      state.read = async () => version;
      tree();
      const mutation =
        state.mutations[
          operation === "confirm" ? "survey-round-media-confirm" : "survey-round-media-conflict"
        ];
      mutation.onSuccess(await mutation.mutationFn());
      expect(storage.size).toBe(0);
      expect(html()).not.toContain("Synthetic lost readback response");
      expect(state.saveCalls).toHaveLength(1);
      expect(state.mutationResets).toEqual([
        "survey-round-media-save",
        "survey-round-media-confirm",
        "survey-round-media-conflict",
      ]);
      expect(observer.getCurrentResult().error).toBeNull();
      expect(observer.getCurrentResult().isIdle).toBe(true);
      unsubscribe();
      client.clear();
    },
  );
  it("removes a transient original preview when its short authorization window expires", async () => {
    state.bindings = [fixture.version];
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await preview();
    expect(html()).toContain("token=ephemeral");
    clock.mockReturnValue(now + 60_001);
    expect(html()).not.toContain("token=ephemeral");
    expect(storage.size).toBe(0);
  });
  it("prevents a second attachment of the same original in one saved round", async () => {
    state.bindings = [fixture.version];
    complete();
    await expect(saveMutation().mutationFn()).rejects.toThrow("allerede knyttet");
    expect(state.saveCalls).toEqual([]);
    expect(storage.size).toBe(0);
    expect(html()).toContain("De valgte spørgsmål fastholdes ved gemning");
  });
  it("only closes a competing immutable binding after explicit fresh list and exact authorized read", async () => {
    const scope = { actorId: fixture.row.created_by, round: fixture.round };
    const receipt = createSurveyRoundMediaReceipt(
      scope,
      fixture.candidate,
      fixture.input.questionIds,
      REQUEST_ID,
    );
    storage.set(surveyRoundMediaReceiptKey(scope), JSON.stringify(receipt));
    const existing = await fixture.savedFor({
      ...fixture.input,
      requestId: "a8000000-0000-4000-8000-000000000001",
    });
    state.bindings = [existing];
    state.read = async () => existing;
    tree();
    expect(html()).toContain("Dine valg fra genforsøget er ikke gemt");
    expect(storage.size).toBe(1);
    const mutation = state.mutations["survey-round-media-conflict"];
    const result = await mutation.mutationFn();
    expect(storage.size).toBe(1);
    expect(state.readCalls).toHaveLength(1);
    mutation.onSuccess(result);
    expect(storage.size).toBe(0);
    expect(state.saveCalls).toEqual([]);
  });
  it("does not close a competing receipt from cached list when the exact current read is denied", async () => {
    const scope = { actorId: fixture.row.created_by, round: fixture.round };
    const receipt = createSurveyRoundMediaReceipt(
      scope,
      fixture.candidate,
      fixture.input.questionIds,
      REQUEST_ID,
    );
    storage.set(surveyRoundMediaReceiptKey(scope), JSON.stringify(receipt));
    state.bindings = [
      await fixture.savedFor({
        ...fixture.input,
        requestId: "a8000000-0000-4000-8000-000000000001",
      }),
    ];
    state.read = async () => {
      throw new Error("Synthetic current read denied");
    };
    tree();
    await expect(state.mutations["survey-round-media-conflict"].mutationFn()).rejects.toThrow(
      "current read denied",
    );
    expect(storage.size).toBe(1);
    expect(state.saveCalls).toEqual([]);
  });
  it.each(["round", "hash", "unmount"])(
    "halts an old pending save after %s scope changes",
    async (transition) => {
      complete();
      const waiting = deferred<{ data: Access | null; error: Error | null }>();
      state.refetch = () => waiting.promise;
      const originalAccess = { ...state.access! };
      const promise = saveMutation().mutationFn();
      if (transition === "round")
        fixture.round = { ...fixture.round, id: "a8000000-0000-4000-8000-000000000001" };
      if (transition === "hash")
        fixture.round = { ...fixture.round, manifestSha256: "a".repeat(64) };
      if (transition === "unmount") for (const cleanup of state.cleanups) cleanup();
      else tree();
      waiting.resolve({ data: originalAccess, error: null });
      await expect(promise).rejects.toThrow("Brugeren eller den valgte runde");
      expect(state.saveCalls).toEqual([]);
    },
  );
  it("selects an existing filename and actual round questions, then writes and separately reads back before retiring the receipt", async () => {
    complete();
    expect(html()).toContain("DJI_0001.JPG");
    expect(state.signCalls).toEqual([]);
    const mutation = saveMutation(),
      result = await mutation.mutationFn();
    expect(storage.size).toBe(1);
    expect(state.saveCalls).toHaveLength(1);
    expect(state.readCalls).toHaveLength(1);
    expect((state.saveCalls[0] as { data: unknown }).data).toMatchObject({
      expectedCallerUserId: fixture.row.created_by,
      roundSha256: fixture.round.manifestSha256,
      questionIds: fixture.input.questionIds,
    });
    mutation.onSuccess(result);
    expect(storage.size).toBe(0);
    expect(state.invalidations).toHaveLength(1);
  });
  it("stops before the writer when durable browser storage fails", async () => {
    complete();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: () => {
        throw new Error("Synthetic storage full");
      },
      removeItem: vi.fn(),
    });
    await expect(saveMutation().mutationFn()).rejects.toThrow("Ingen billedtilknytning er sendt");
    expect(state.saveCalls).toEqual([]);
    expect(html()).toContain("Et genforsøg er bevaret");
  });
  it("retains the identical request across ambiguous save failure and retries without creating a new ID", async () => {
    complete();
    state.save = async () => {
      throw new Error("Synthetic lost response");
    };
    await expect(saveMutation().mutationFn()).rejects.toThrow("lost response");
    const first = JSON.stringify(state.saveCalls[0]);
    state.save = async (value) => fixture.savedFor(writerInput(value));
    state.read = async () => fixture.version;
    const retry = saveMutation();
    const result = await retry.mutationFn();
    expect(JSON.stringify(state.saveCalls[1])).toBe(first);
    retry.onSuccess(result);
    expect(storage.size).toBe(0);
  });
  it("does not retire a receipt when saved-version readback is missing or mismatched", async () => {
    complete();
    state.read = async () => null;
    await expect(saveMutation().mutationFn()).rejects.toThrow("afventer bekræftelse");
    expect(storage.size).toBe(1);
    state.read = async () => ({ ...fixture.version, manifestSha256: "a".repeat(64) });
    await expect(saveMutation().mutationFn()).rejects.toThrow("afventer bekræftelse");
    expect(storage.size).toBe(1);
  });
  it("allows a viewer to read and explicitly confirm an existing ambiguous request without invoking a writer", async () => {
    const scope = { actorId: fixture.row.created_by, round: fixture.round };
    const receipt = createSurveyRoundMediaReceipt(
      scope,
      fixture.candidate,
      fixture.input.questionIds,
      REQUEST_ID,
    );
    storage.set(surveyRoundMediaReceiptKey(scope), JSON.stringify(receipt));
    state.access!.canAssign = false;
    state.bindings = [fixture.version];
    state.read = async () => fixture.version;
    expect(html()).toContain("Du har læseadgang");
    const mutation = confirmMutation();
    mutation.onSuccess(await mutation.mutationFn());
    expect(storage.size).toBe(0);
    expect(state.saveCalls).toEqual([]);
    await expect(saveMutation().mutationFn()).rejects.toThrow("tillader ikke");
  });
  it("checks current contributor permission again immediately before writing", async () => {
    complete();
    state.refetch = async () => ({ data: { ...state.access!, canAssign: false }, error: null });
    await expect(saveMutation().mutationFn()).rejects.toThrow("aktuelle adgang");
    expect(state.saveCalls).toEqual([]);
  });
  it("suppresses stale list data and empty-state claims when the read fails", () => {
    state.bindings = [fixture.version];
    state.bindingError = new Error("Synthetic read failed");
    const output = html();
    expect(output).toContain("Synthetic read failed");
    expect(output).not.toContain("Gemt billedtilknytning · Udkast");
    expect(output).not.toContain("endnu ingen gemte billedtilknytninger");
    expect(state.signCalls).toEqual([]);
  });
  it("rejects an out-of-round saved binding before rendering its content", async () => {
    tree();
    state.bindings = [
      { ...fixture.version, roundVersionId: "a9000000-0000-4000-8000-000000000001" },
    ];
    await expect(
      state.queries["survey-round-media"].queryFn({ pageParam: undefined }),
    ).rejects.toThrow("matcher ikke");
  });
  it("never calls the writer after delayed access resolves under another caller", async () => {
    complete();
    const waiting = deferred<{ data: Access | null; error: Error | null }>();
    state.refetch = () => waiting.promise;
    const promise = saveMutation().mutationFn();
    switchCaller();
    waiting.resolve({ data: { ...state.access!, userId: fixture.row.created_by }, error: null });
    await expect(promise).rejects.toThrow("Brugeren eller den valgte runde");
    expect(state.saveCalls).toEqual([]);
    expect(storage.size).toBe(0);
  });
  it("preserves another caller’s draft and avoids old save readback after a caller switch", async () => {
    complete();
    const waiting = deferred<SurveyRoundMediaVersion>();
    state.save = () => waiting.promise;
    const old = saveMutation();
    const promise = old.mutationFn();
    for (let n = 0; n < 8 && state.saveCalls.length === 0; n++) await Promise.resolve();
    expect(state.saveCalls).toHaveLength(1);
    switchCaller();
    waiting.resolve(fixture.version);
    await expect(promise).rejects.toThrow("Brugeren eller den valgte runde");
    expect(state.readCalls).toEqual([]);
    expect(storage.size).toBe(1);
    expect(
      find(tree(), (props) => props["aria-label"] === "Originalfoto til runden")!.props.value,
    ).toBe(fixture.candidate.mediaId);
  });
  it("ignores an old successful completion after scope changes and does not clear its durable receipt", async () => {
    complete();
    const old = saveMutation(),
      result = await old.mutationFn();
    switchCaller();
    old.onSuccess(result);
    expect(storage.size).toBe(1);
    expect(state.invalidations).toEqual([]);
    expect(state.mutationResets).toEqual([]);
  });
  it("loads no private original automatically and keeps the requested URL solely in transient component state", async () => {
    state.bindings = [fixture.version];
    expect(html()).not.toContain("token=ephemeral");
    expect(state.signCalls).toEqual([]);
    await preview();
    expect(html()).toContain("token=ephemeral");
    expect(storage.size).toBe(0);
    expect(Object.keys(state.mutations)).toEqual([
      "survey-round-media-save",
      "survey-round-media-confirm",
      "survey-round-media-conflict",
    ]);
    expect(html()).toContain("Billedets optagetid: Ukendt");
    expect(html()).toContain("Kameraposition er ukendt");
  });
  it("discards a delayed signed URL after caller changes without cache, local storage or preview exposure", async () => {
    state.bindings = [fixture.version];
    tree();
    const waiting = deferred<unknown>();
    state.sign = () => waiting.promise;
    const promise = preview();
    switchCaller();
    waiting.resolve({ signedUrl: "https://synthetic.invalid/?token=old-caller" });
    await promise;
    expect(html()).not.toContain("old-caller");
    expect(storage.size).toBe(0);
    expect(state.invalidations).toEqual([]);
  });
  it("clears a preview immediately on logout and rejects late old read completions", async () => {
    state.bindings = [fixture.version];
    await preview();
    expect(html()).toContain("token=ephemeral");
    const read = state.queries["survey-round-media"].queryFn;
    state.userId = null;
    state.access = null;
    expect(html()).not.toContain("token=ephemeral");
    await expect(read({ pageParam: undefined })).rejects.toThrow("Brugeren eller den valgte runde");
  });
  it("fails visibly for an invalid local receipt and does not silently create a replacement", () => {
    const key = surveyRoundMediaReceiptKey({
      actorId: fixture.row.created_by,
      round: fixture.round,
    });
    storage.set(key, "invalid");
    expect(html()).toContain("Genforsøget kan ikke genåbnes");
    expect(state.saveCalls).toEqual([]);
    expect(storage.get(key)).toBe("invalid");
  });
});
