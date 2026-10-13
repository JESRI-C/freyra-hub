import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SurveyRoundSummary,
  SurveyRoundVersion,
} from "@/services/baseline/survey-round-persistence";
import type { SurveyRoundMutationResult } from "../survey-round-request";
import type { SaveSurveyRoundEnvelope } from "@/lib/survey-round.functions";
type CallerAccess = { projectId: string; userId: string; canPersist: boolean };

const state = vi.hoisted(() => ({
  cursor: 0,
  hooks: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  access: null as { projectId: string; userId: string; canPersist: boolean } | null,
  accessError: null as Error | null,
  accessPending: false,
  currentAccess: null as { projectId: string; userId: string; canPersist: boolean } | null,
  refetchImplementation: null as
    | (() => Promise<{ data: CallerAccess | null; error: Error | null }>)
    | null,
  queryOptions: {} as Record<string, { queryFn: () => Promise<unknown> }>,
  accessImplementation: null as (() => Promise<CallerAccess>) | null,
  readImplementation: null as (() => Promise<SurveyRoundVersion>) | null,
  previousMutationKey: null as string | null,
  summaries: [] as SurveyRoundSummary[],
  round: null as SurveyRoundVersion | null,
  listError: null as Error | null,
  readError: null as Error | null,
  listPending: false,
  readPending: false,
  savePending: false,
  saveError: null as Error | null,
  nextPage: false,
  nextPagePending: false,
  mutation: null as {
    mutationKey: unknown[];
    mutationFn: () => Promise<SurveyRoundMutationResult>;
    onSuccess: (round: SurveyRoundMutationResult) => Promise<void>;
  } | null,
  calls: [] as unknown[],
  saveImplementation: null as ((input: unknown) => Promise<SurveyRoundVersion>) | null,
  cached: [] as unknown[],
  invalidations: [] as unknown[],
  listOptions: null as {
    queryFn: (context: { pageParam: number | undefined }) => Promise<unknown>;
  } | null,
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks))
        state.hooks[index] = typeof initial === "function" ? initial() : initial;
      return [
        state.hooks[index],
        (next: unknown) => {
          state.hooks[index] = typeof next === "function" ? next(state.hooks[index]) : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = { current: initial };
      return state.hooks[index];
    },
    useEffect: (effect: () => void | (() => void), dependencies: unknown[]) => {
      const index = state.cursor++;
      const previous = state.hooks[index] as unknown[] | undefined;
      if (
        !previous ||
        dependencies.some((dependency, position) => dependency !== previous[position])
      ) {
        state.effects.push(effect);
        state.hooks[index] = dependencies;
      }
    },
  };
});
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: state.access ? { id: state.access.userId } : null }),
}));
vi.mock("@/lib/survey-round.functions", () => ({
  getSurveyRoundAccess: vi.fn(async () =>
    state.accessImplementation ? state.accessImplementation() : state.access,
  ),
  getSurveyRound: vi.fn(async () =>
    state.readImplementation ? state.readImplementation() : state.round,
  ),
  listSurveyRounds: vi.fn(async (input: unknown) => {
    state.calls.push(input);
    return { items: state.summaries, nextBeforeVersion: null };
  }),
  saveSurveyRound: vi.fn(async (input: unknown) => {
    state.calls.push(input);
    if (!state.saveImplementation) throw new Error("No synthetic save response configured");
    return state.saveImplementation(input);
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueryData: (key: unknown, value: unknown) => state.cached.push({ key, value }),
    invalidateQueries: async (value: unknown) => {
      state.invalidations.push(value);
    },
  }),
  useMutation: (options: NonNullable<typeof state.mutation>) => {
    const key = JSON.stringify(options.mutationKey);
    if (state.previousMutationKey !== null && state.previousMutationKey !== key) {
      state.savePending = false;
      state.saveError = null;
    }
    state.previousMutationKey = key;
    state.mutation = options;
    return {
      error: state.saveError,
      isPending: state.savePending,
      mutate: vi.fn(),
      reset: () => {
        state.saveError = null;
      },
    };
  },
  useInfiniteQuery: (options: NonNullable<typeof state.listOptions>) => {
    state.listOptions = options;
    return {
      data: { pages: [{ items: state.summaries, nextBeforeVersion: null }] },
      error: state.listError,
      isPending: state.listPending,
      hasNextPage: state.nextPage,
      isFetchingNextPage: state.nextPagePending,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  },
  useQuery: (options: {
    queryKey: unknown[];
    enabled: boolean;
    queryFn: () => Promise<unknown>;
  }) => {
    state.queryOptions[String(options.queryKey[0])] = options;
    return options.queryKey[0] === "survey-round-access"
      ? {
          data: state.access,
          error: state.accessError,
          isPending: state.accessPending,
          refetch: async () =>
            state.refetchImplementation
              ? state.refetchImplementation()
              : {
                  data: state.currentAccess ?? state.access,
                  error: state.accessError,
                },
        }
      : {
          data: options.enabled ? state.round : undefined,
          error: state.readError,
          isFetching: state.readPending,
          refetch: vi.fn(),
        };
  },
}));

import { SurveyRoundPanel } from "../SurveyRoundPanel";
import { createSurveyRoundReceipt, surveyRoundReceiptKey } from "../survey-round-request";
import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";
import {
  surveyRoundVersionFromRow,
  type SaveSurveyRoundInput,
} from "@/services/baseline/survey-round-persistence";

let fixture: Awaited<ReturnType<typeof makeRoundFixture>>;
const storage = new Map<string, string>();
const NEW_REQUEST = "95000000-0000-4000-8000-000000000001";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (failure: unknown) => void;
  const promise = new Promise<T>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { promise, resolve, reject };
}
function unmount() {
  for (const cleanup of state.cleanups) cleanup();
}
function switchCaller() {
  state.access = { ...state.access!, userId: "96000000-0000-4000-8000-000000000001" };
  html();
  change("Rundetitel", "Bruger B's nye udkast");
}
async function awaitWriterStart() {
  for (let step = 0; step < 12 && state.calls.length === 0; step++) await Promise.resolve();
  expect(state.calls).toHaveLength(1);
}
function tree(runEffects = true, depth = 0) {
  if (depth > 8) throw new Error("Synthetic hook effect queue did not settle");
  state.cursor = 0;
  state.effects = [];
  const result = SurveyRoundPanel({ snapshot: fixture.baseline, plan: fixture.plan });
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
  treeValue: React.ReactNode,
  predicate: (props: Record<string, unknown>, type: unknown) => boolean,
): React.ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(treeValue)) {
    for (const child of treeValue) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (!React.isValidElement<Record<string, unknown>>(treeValue)) return undefined;
  if (predicate(treeValue.props, treeValue.type)) return treeValue;
  return find(treeValue.props.children as React.ReactNode, predicate);
}
function change(label: string, value: string) {
  const element = find(tree(), (props) => props["aria-label"] === label)!;
  (element.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function completeDraft() {
  change("Rundetitel", fixture.input.title);
  change("Registrering fra dato", fixture.input.recordingWindow.dateFrom);
  change("Registrering til dato", fixture.input.recordingWindow.dateTo);
  const checkbox = find(tree(), (props, type) => type === "input" && props.type === "checkbox")!;
  (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({
    target: { checked: true },
  });
  tree();
}
beforeEach(async () => {
  fixture = await makeRoundFixture();
  state.cursor = 0;
  state.hooks = [];
  state.effects = [];
  state.cleanups = [];
  state.refetchImplementation = null;
  state.accessImplementation = null;
  state.readImplementation = null;
  state.queryOptions = {};
  state.previousMutationKey = null;
  state.calls = [];
  state.cached = [];
  state.invalidations = [];
  state.access = {
    projectId: fixture.baseline.projectId,
    userId: fixture.row.created_by,
    canPersist: true,
  };
  state.accessError = null;
  state.accessPending = false;
  state.currentAccess = null;
  state.summaries = [];
  state.round = null;
  state.listError = null;
  state.readError = null;
  state.listPending = false;
  state.readPending = false;
  state.savePending = false;
  state.saveError = null;
  state.nextPage = false;
  state.nextPagePending = false;
  state.mutation = null;
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(NEW_REQUEST);
  state.saveImplementation = async (value) => {
    const { data } = value as { data: SaveSurveyRoundInput };
    const row = structuredClone(fixture.row);
    row.request_id = data.requestId;
    return surveyRoundVersionFromRow(row, fixture.baseline, fixture.planRow);
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("survey round draft UI and exact request lifecycle", () => {
  it("does not invoke the writer if durable receipt storage throws and retains the exact draft", async () => {
    completeDraft();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: () => {
        throw new Error("Synthetic storage full");
      },
      removeItem: (key: string) => storage.delete(key),
    });
    let failure: Error | null = null;
    try {
      await state.mutation!.mutationFn();
    } catch (caught) {
      failure = caught as Error;
    }
    state.saveError = failure;
    expect(failure?.message).toContain("Ingen registreringsrunde er sendt");
    expect(state.calls).toEqual([]);
    expect(storage.size).toBe(0);
    const output = html();
    expect(output).toContain(fixture.input.title);
    expect(output).toContain("dit udkast er bevaret");
    expect(output).toContain("Prøv gemning af samme udkast igen");
  });
  it("retains the original receipt after a confirmed save when subsequent storage cleanup fails", async () => {
    completeDraft();
    const result = await state.mutation!.mutationFn();
    const original = [...storage.values()][0];
    state.round = result.version;
    state.summaries = [result.version];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: () => {
        throw new Error("Synthetic storage denied");
      },
    });
    await state.mutation!.onSuccess(result);
    const output = html();
    expect([...storage.values()][0]).toBe(original);
    expect(output).toContain("Runden er gemt");
    expect(output).toContain("Den oprindelige reference er bevaret");
    expect(output).not.toContain("Gemningen er endnu ikke bekræftet");
    expect(state.calls).toHaveLength(1);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const cleanup = find(
      tree(),
      (props) => props.children === "Ryd den bekræftede genforsøgsreference igen",
    )!;
    (cleanup.props.onClick as () => void)();
    expect(storage.size).toBe(0);
    expect(state.calls).toHaveLength(1);
  });
  it.each(["actor", "plan", "unmount"] as const)(
    "aborts before writer after delayed access and %s transition",
    async (transition) => {
      completeDraft();
      const originalAccess = { ...state.access! };
      const response = deferred<{ data: CallerAccess; error: null }>();
      state.refetchImplementation = () => response.promise;
      const pending = state.mutation!.mutationFn();
      if (transition === "actor") switchCaller();
      if (transition === "plan") {
        fixture.plan = { ...fixture.plan, id: "99000000-0000-4000-8000-000000000001" };
        html();
        change("Rundetitel", "Nyt udkast fra en anden gemt plan");
      }
      if (transition === "unmount") unmount();
      response.resolve({ data: originalAccess, error: null });
      await expect(pending).rejects.toThrow("inputversioner er ændret");
      expect(state.calls).toEqual([]);
      expect(storage.size).toBe(0);
      expect(state.cached).toEqual([]);
      if (transition === "actor") expect(html()).toContain("Bruger B&#x27;s nye udkast");
      if (transition === "plan") expect(html()).toContain("Nyt udkast fra en anden gemt plan");
    },
  );
  it.each(["actor", "unmount"] as const)(
    "isolates a delayed successful writer completion after %s transition",
    async (transition) => {
      completeDraft();
      const response = deferred<SurveyRoundVersion>();
      state.saveImplementation = () => response.promise;
      const pending = state.mutation!.mutationFn();
      await awaitWriterStart();
      const envelope = (state.calls[0] as { data: SaveSurveyRoundEnvelope }).data;
      expect(envelope.expectedCallerUserId).toBe(fixture.row.created_by);
      const row = { ...fixture.row, request_id: envelope.requestId };
      const savedVersion = await surveyRoundVersionFromRow(row, fixture.baseline, fixture.planRow);
      const originalReceipt = [...storage.values()][0];
      if (transition === "actor") switchCaller();
      else unmount();
      response.resolve(savedVersion);
      const result = await pending;
      // TanStack can replace pending mutation options; deliberately use the latest callback.
      await state.mutation!.onSuccess(result);
      expect(state.cached).toEqual([]);
      expect(state.invalidations).toEqual([]);
      expect([...storage.values()][0]).toBe(originalReceipt);
      if (transition === "actor") expect(html()).toContain("Bruger B&#x27;s nye udkast");
    },
  );
  it("uses the actual MutationObserver key reset so B does not inherit A's delayed failure or pending state", async () => {
    completeDraft();
    const original = state.mutation!;
    const { MutationObserver, QueryClient } = await import("@tanstack/query-core");
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const response = deferred<SurveyRoundVersion>();
    state.saveImplementation = () => response.promise;
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
    await awaitWriterStart();
    state.savePending = true;
    switchCaller();
    const current = state.mutation!;
    observer.setOptions({
      mutationKey: current.mutationKey,
      mutationFn: current.mutationFn,
      onSuccess: current.onSuccess,
    });
    expect(observer.getCurrentResult().isIdle).toBe(true);
    response.reject(new Error("A's forsinkede netværksfejl"));
    expect((await outcome).error).toBeInstanceOf(Error);
    expect(observer.getCurrentResult().error).toBeNull();
    expect(observer.getCurrentResult().isPending).toBe(false);
    const output = html();
    expect(output).toContain("Bruger B&#x27;s nye udkast");
    expect(output).not.toContain("A&#x27;s forsinkede netværksfejl");
    expect(output).not.toContain("Gemmer registreringsrunde …");
    expect(storage.size).toBe(1);
    unsubscribe();
    client.clear();
  });
  it.each(["survey-round-access", "survey-round"])(
    "rejects a stale delayed %s read after account switch",
    async (query) => {
      if (query === "survey-round") {
        state.round = await surveyRoundVersionFromRow(
          fixture.row,
          fixture.baseline,
          fixture.planRow,
        );
        state.summaries = [state.round];
      }
      html();
      const response = deferred<CallerAccess | SurveyRoundVersion>();
      const originalAccess = { ...state.access! };
      const originalRound = state.round;
      if (query === "survey-round-access")
        state.accessImplementation = () => response.promise as Promise<CallerAccess>;
      else state.readImplementation = () => response.promise as Promise<SurveyRoundVersion>;
      const pending = state.queryOptions[query].queryFn();
      switchCaller();
      response.resolve(query === "survey-round-access" ? originalAccess : originalRound!);
      await expect(pending).rejects.toThrow("inputversioner er ændret");
      expect(state.cached).toEqual([]);
    },
  );
  it("shows the selected saved versions, only their actual questions, and all three round kinds", () => {
    const output = html();
    expect(output).toContain(`Datagrundlag, version ${fixture.baseline.version}`);
    expect(output).toContain(`Plan, version ${fixture.plan.version}`);
    expect(output).toContain(fixture.plan.manifest.questions[0].title);
    expect(output).toContain('value="before"');
    expect(output).toContain('value="after"');
    expect(output).toContain('value="control"');
    expect(output).toContain("Europe/Copenhagen");
    expect(output).toContain("Det planlagte vindue dokumenterer ikke faktisk tidsdækning");
    expect(output).toContain("Der er endnu ingen gemte runder");
    expect(state.calls).toEqual([]);
  });
  it.each(["viewer", "unknown", "denied"])("keeps creation disabled for %s access", (condition) => {
    if (condition === "viewer") state.access!.canPersist = false;
    if (condition === "unknown") {
      state.access = null;
      state.accessPending = true;
    }
    if (condition === "denied") state.accessError = new Error("Sagsadgang er tilbagekaldt");
    const output = html();
    if (condition === "viewer") {
      expect(output).toContain("Du har læseadgang");
      expect(output).toMatch(/<fieldset[^>]*disabled/);
    } else expect(output).not.toContain("Rundetitel");
    expect(state.calls).toEqual([]);
  });
  it("does not send a write after current caller access is revoked even if earlier access allowed it", async () => {
    completeDraft();
    state.currentAccess = { ...state.access!, canPersist: false };
    await expect(state.mutation!.mutationFn()).rejects.toThrow("aktuelle adgang");
    expect(state.calls).toEqual([]);
    expect(storage.size).toBe(0);
  });
  it("persists exact input before an uncertain save and retries the same receipt after reload", async () => {
    completeDraft();
    state.saveImplementation = async () => {
      throw new Error("Usikkert netværkssvar");
    };
    await expect(state.mutation!.mutationFn()).rejects.toThrow("Usikkert netværkssvar");
    const first = state.calls[0] as { data: SaveSurveyRoundEnvelope };
    expect(storage.size).toBe(1);
    const { expectedCallerUserId, ...domainInput } = first.data;
    expect(expectedCallerUserId).toBe(state.access!.userId);
    expect(JSON.parse([...storage.values()][0]).input).toEqual(domainInput);
    expect(JSON.parse([...storage.values()][0]).input).not.toHaveProperty("expectedCallerUserId");
    state.saveError = new Error("Usikkert netværkssvar");
    expect(html()).toContain("Prøv gemning af samme udkast igen");
    expect(html()).toContain("Gemningen er endnu ikke bekræftet");
    expect(html()).toMatch(/<fieldset[^>]*disabled/);
    state.hooks = []; // New component mount, same caller and immutable selection.
    html();
    await expect(state.mutation!.mutationFn()).rejects.toThrow("Usikkert netværkssvar");
    expect(state.calls[1]).toEqual(state.calls[0]);
    expect(first.data.requestId).toBe(NEW_REQUEST);
  });
  it("shows real pending state and clears only the successful request receipt", async () => {
    completeDraft();
    const version = await state.mutation!.mutationFn();
    state.savePending = true;
    expect(html()).toContain("Gemmer registreringsrunde …");
    expect(html()).toMatch(/<fieldset[^>]*disabled/);
    await state.mutation!.onSuccess(version);
    state.savePending = false;
    expect(storage.size).toBe(0);
    expect(state.cached).toHaveLength(1);
    expect(state.invalidations).toHaveLength(1);
  });
  it("keeps a corrupt local receipt visible as an error instead of generating another request", () => {
    const scope = {
      actorId: state.access!.userId,
      projectId: fixture.baseline.projectId,
      baselineId: fixture.baseline.id,
      baselineSha256: fixture.baseline.manifestSha256,
      planId: fixture.plan.id,
      planSha256: fixture.plan.manifestSha256,
      availableQuestionIds: fixture.input.questionIds,
    };
    storage.set(surveyRoundReceiptKey(scope), "broken JSON");
    const output = html();
    expect(output).toContain("Genforsøget kan ikke genåbnes");
    expect(output).toMatch(/<fieldset[^>]*disabled/);
    expect(storage.size).toBe(1);
    expect(state.calls).toEqual([]);
  });
  it("does not erase another request receipt when an earlier save completes", async () => {
    completeDraft();
    const version = await state.mutation!.mutationFn();
    const scope = {
      actorId: state.access!.userId,
      projectId: fixture.baseline.projectId,
      baselineId: fixture.baseline.id,
      baselineSha256: fixture.baseline.manifestSha256,
      planId: fixture.plan.id,
      planSha256: fixture.plan.manifestSha256,
      availableQuestionIds: fixture.input.questionIds,
    };
    const other = createSurveyRoundReceipt(
      scope,
      fixture.input,
      "98000000-0000-4000-8000-000000000001",
    );
    storage.set(surveyRoundReceiptKey(scope), JSON.stringify(other));
    await state.mutation!.onSuccess(version);
    expect(JSON.parse(storage.get(surveyRoundReceiptKey(scope))!)).toEqual(other);
  });
  it("reopens a receipt created in another window before submitting new input", async () => {
    completeDraft();
    const scope = {
      actorId: state.access!.userId,
      projectId: fixture.baseline.projectId,
      baselineId: fixture.baseline.id,
      baselineSha256: fixture.baseline.manifestSha256,
      planId: fixture.plan.id,
      planSha256: fixture.plan.manifestSha256,
      availableQuestionIds: fixture.input.questionIds,
    };
    const other = createSurveyRoundReceipt(
      scope,
      { ...fixture.input, title: "Tidligere planlagt kontrol" },
      "98000000-0000-4000-8000-000000000001",
    );
    storage.set(surveyRoundReceiptKey(scope), JSON.stringify(other));
    await expect(state.mutation!.mutationFn()).rejects.toThrow(
      "Et tidligere genforsøg blev fundet",
    );
    expect(state.calls).toEqual([]);
    expect(html()).toContain("Tidligere planlagt kontrol");
    expect(html()).toContain("Prøv gemning af samme udkast igen");
  });
  it("confirms an ambiguous receipt by reopening its actual saved row after write access is revoked", async () => {
    const scope = {
      actorId: state.access!.userId,
      projectId: fixture.baseline.projectId,
      baselineId: fixture.baseline.id,
      baselineSha256: fixture.baseline.manifestSha256,
      planId: fixture.plan.id,
      planSha256: fixture.plan.manifestSha256,
      availableQuestionIds: fixture.input.questionIds,
    };
    storage.set(
      surveyRoundReceiptKey(scope),
      JSON.stringify(createSurveyRoundReceipt(scope, fixture.input, fixture.input.requestId)),
    );
    state.round = await surveyRoundVersionFromRow(fixture.row, fixture.baseline, fixture.planRow);
    state.summaries = [state.round];
    state.access!.canPersist = false;
    state.saveError = new Error("Usikkert netværkssvar");
    html();
    const output = html();
    expect(output).toContain("Gemt udkast");
    expect(output).toContain("Du har læseadgang");
    expect(output).not.toContain("Gemningen er endnu ikke bekræftet");
    expect(output).not.toContain("Usikkert netværkssvar");
    expect(storage.size).toBe(0);
    expect(state.calls).toEqual([]);
  });
  it("does not hydrate another caller's input when login changes in the same component", () => {
    const scope = {
      actorId: state.access!.userId,
      projectId: fixture.baseline.projectId,
      baselineId: fixture.baseline.id,
      baselineSha256: fixture.baseline.manifestSha256,
      planId: fixture.plan.id,
      planSha256: fixture.plan.manifestSha256,
      availableQuestionIds: fixture.input.questionIds,
    };
    storage.set(
      surveyRoundReceiptKey(scope),
      JSON.stringify(createSurveyRoundReceipt(scope, fixture.input, NEW_REQUEST)),
    );
    expect(html()).toContain(fixture.input.title);
    state.access = { ...state.access!, userId: "96000000-0000-4000-8000-000000000001" };
    const output = html();
    expect(output).not.toContain(fixture.input.title);
    expect(output).not.toContain("Prøv gemning af samme udkast igen");
  });
  it.each(["list", "read", "access"])("hides cached saved rounds after %s denial", async (kind) => {
    state.round = await surveyRoundVersionFromRow(fixture.row, fixture.baseline, fixture.planRow);
    state.summaries = [state.round];
    if (kind === "list") state.listError = new Error("Rundelisten blev afvist");
    if (kind === "read") state.readError = new Error("Den gemte runde blev afvist");
    if (kind === "access") state.accessError = new Error("Adgangen blev afvist");
    const output = html();
    expect(output).toContain('role="alert"');
    expect(output).not.toContain("Rundeversion 1");
    if (kind !== "read") expect(output).not.toContain(fixture.input.title);
  });
  it("reopens an actual saved draft while retaining older selectable summaries and no photo/result claims", async () => {
    state.round = await surveyRoundVersionFromRow(fixture.row, fixture.baseline, fixture.planRow);
    state.summaries = [
      { ...state.round, version: 2, id: "97000000-0000-4000-8000-000000000001" },
      state.round,
    ];
    const output = html();
    expect(output).toContain("Udkast 2");
    expect(output).toContain("Udkast 1");
    expect(output).toContain("Rundeversion 1");
    expect(output).toContain("2026-10-13–2026-10-14");
    expect(output).toContain("Afgrænsning, faglig godkendelse og rapportaccept afventer");
    expect(output).toContain("Runden dokumenterer ikke modtagne fotos");
    expect(state.calls).toEqual([]);
  });
  it("suppresses a cached round with different immutable plan or baseline binding", async () => {
    state.round = await surveyRoundVersionFromRow(fixture.row, fixture.baseline, fixture.planRow);
    state.summaries = [state.round];
    state.round = { ...state.round, baselineSha256: "f".repeat(64) };
    const output = html();
    expect(output).toContain("Den gemte runde matcher ikke");
    expect(output).not.toContain("Rundeversion 1");
  });
  it("requests older pages with the exact selected baseline and plan, never public data sources", async () => {
    html();
    await state.listOptions!.queryFn({ pageParam: 15 });
    expect(state.calls).toEqual([
      {
        data: {
          projectId: fixture.baseline.projectId,
          baselineId: fixture.baseline.id,
          planId: fixture.plan.id,
          beforeVersion: 15,
          limit: 30,
        },
      },
    ]);
  });
});
