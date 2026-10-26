import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import type { SurveyRoundMediaCandidate } from "@/lib/survey-round-media.functions";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import { makeMediaUiFixture } from "./survey-round-media-ui.fixtures";

const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  actorId: "",
  projectId: "",
  rows: [] as SurveyRoundMediaCandidate[],
  pages: [] as { beforeId?: string; limit: number }[],
  saved: new Map<string, SurveyRoundMediaVersion>(),
  writes: [] as {
    requestId: string;
    mediaId: string;
    questionIds: string[];
    expectedCallerUserId: string;
  }[],
  reads: [] as string[],
  makeSaved: null as
    | null
    | ((input: {
        requestId: string;
        mediaId: string;
        questionIds: string[];
        expectedCallerUserId: string;
      }) => Promise<SurveyRoundMediaVersion>),
  loseResponse: false,
  saveGate: null as null | Promise<void>,
  candidateGate: null as null | Promise<{
    items: SurveyRoundMediaCandidate[];
    nextBeforeId: string | null;
  }>,
  assigned: 0,
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const at = state.cursor++;
      if (!(at in state.hooks))
        state.hooks[at] = typeof initial === "function" ? initial() : initial;
      return [
        state.hooks[at],
        (value: unknown) => {
          state.hooks[at] = typeof value === "function" ? value(state.hooks[at]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const at = state.cursor++;
      if (!(at in state.hooks)) state.hooks[at] = { current: initial };
      return state.hooks[at];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const at = state.cursor++,
        previous = state.hooks[at] as unknown[] | undefined;
      if (!previous || deps.some((dep, index) => dep !== previous[index])) {
        state.effects.push(effect);
        state.hooks[at] = deps;
      }
    },
  };
});
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: state.actorId ? { id: state.actorId } : null }),
}));
vi.mock("@/lib/survey-round-media.functions", () => ({
  getSurveyRoundMediaAccess: async () => ({
    userId: state.actorId,
    projectId: state.projectId,
    canAssign: true,
  }),
  listSurveyRoundMediaCandidates: async ({
    data,
  }: {
    data: { beforeId?: string; limit: number };
  }) => {
    state.pages.push(data);
    if (state.candidateGate) {
      const pending = state.candidateGate;
      state.candidateGate = null;
      return pending;
    }
    const from = data.beforeId
      ? state.rows.findIndex((row) => row.mediaId === data.beforeId) + 1
      : 0;
    const items = state.rows.slice(from, from + data.limit);
    return {
      items,
      nextBeforeId: from + items.length < state.rows.length ? items.at(-1)!.mediaId : null,
    };
  },
  listSurveyRoundMedia: async ({ data }: { data: { mediaId: string } }) => ({
    items: state.saved.has(data.mediaId) ? [state.saved.get(data.mediaId)!] : [],
    nextBeforeVersion: null,
  }),
  saveSurveyRoundMedia: async ({
    data,
  }: {
    data: {
      requestId: string;
      mediaId: string;
      questionIds: string[];
      expectedCallerUserId: string;
    };
  }) => {
    state.writes.push(data);
    const version = await state.makeSaved!(data);
    state.saved.set(data.mediaId, version);
    if (state.saveGate) await state.saveGate;
    if (state.loseResponse) {
      state.loseResponse = false;
      throw new Error("Synthetic response lost");
    }
    return version;
  },
  getSurveyRoundMedia: async ({ data }: { data: { bindingId: string } }) => {
    state.reads.push(data.bindingId);
    return [...state.saved.values()].find((version) => version.id === data.bindingId) ?? null;
  },
}));
import { InspectionPhotoBatch } from "../InspectionPhotoBatch";
import {
  createInspectionPhotoBatch,
  inspectionPhotoBatchKey,
  readInspectionPhotoBatch,
} from "../inspection-photo-batch";

let fixture: Awaited<ReturnType<typeof makeMediaUiFixture>>;
const values = new Map<string, string>();
beforeAll(async () => {
  fixture = await makeMediaUiFixture();
});
const uuid = (family: string, index: number) =>
  `${family}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function tree(depth = 0): React.ReactElement {
  if (depth > 12) throw new Error("Synthetic effects did not settle");
  state.cursor = 0;
  state.effects = [];
  const result = InspectionPhotoBatch({
    round: fixture.round,
    onAssigned: async () => {
      state.assigned++;
    },
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
function findAll(
  value: React.ReactNode,
  predicate: (props: Record<string, unknown>, type: unknown) => boolean,
): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap((child) => findAll(child, predicate));
  if (!React.isValidElement<Record<string, unknown>>(value)) return [];
  return [
    ...(predicate(value.props, value.type) ? [value] : []),
    ...findAll(value.props.children as React.ReactNode, predicate),
  ];
}
function button(label: string) {
  return findAll(
    tree(),
    (props, type) =>
      type === "button" &&
      (typeof props.children === "string"
        ? props.children
        : Array.isArray(props.children)
          ? props.children.join("")
          : ""
      ).includes(label),
  )[0];
}
function click(label: string) {
  const element = button(label);
  if (!element || element.props.disabled) throw new Error(`Unavailable synthetic button: ${label}`);
  (element.props.onClick as () => void)();
}
function check(at: number, checked = true) {
  const element = findAll(tree(), (props, type) => type === "input" && props.type === "checkbox")[
    at
  ];
  if (!element || element.props.disabled) throw new Error("Unavailable synthetic checkbox");
  (element.props.onChange as (event: { target: { checked: boolean } }) => void)({
    target: { checked },
  });
  tree();
}
function html() {
  return renderToStaticMarkup(tree());
}
async function idle() {
  await vi.waitFor(
    () => {
      expect(html()).not.toContain("Arbejder med fotos");
    },
    { timeout: 2000, interval: 5 },
  );
}
function batch() {
  const scope = { actorId: state.actorId, round: fixture.round };
  return readInspectionPhotoBatch(values.get(inspectionPhotoBatchKey(scope)) ?? null, scope);
}
function unmount() {
  for (const cleanup of state.cleanups) cleanup();
  state.cleanups = [];
}
beforeEach(() => {
  values.clear();
  state.hooks = [];
  state.effects = [];
  state.cleanups = [];
  state.cursor = 0;
  state.actorId = fixture.row.created_by;
  state.projectId = fixture.round.projectId;
  state.rows = Array.from({ length: 65 }, (_, index) => ({
    ...fixture.candidate,
    mediaId: uuid("a1", 500 - index),
    fileName: `DJI_${index + 1}.JPG`,
  }));
  state.pages = [];
  state.saved.clear();
  state.writes = [];
  state.reads = [];
  state.loseResponse = false;
  state.saveGate = null;
  state.candidateGate = null;
  state.assigned = 0;
  state.makeSaved = async (input) => {
    const version = structuredClone(fixture.version);
    version.id = uuid("a2", state.rows.findIndex((row) => row.mediaId === input.mediaId) + 1);
    version.mediaId = input.mediaId;
    version.requestId = input.requestId;
    version.createdBy = input.expectedCallerUserId;
    version.manifest.mediaId = input.mediaId;
    version.manifest.questionIds = [...input.questionIds];
    version.manifestSha256 = await baselineSha256(version.manifest);
    return version;
  };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, text: string) => values.set(key, text),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("explicit photo batch UI", () => {
  it("loads only 30 actual candidates initially and silently selects none", async () => {
    tree();
    await idle();
    const checkboxes = findAll(
      tree(),
      (props, type) => type === "input" && props.type === "checkbox",
    );
    expect(checkboxes).toHaveLength(31);
    expect(checkboxes.every((input) => input.props.checked === false)).toBe(true);
    expect(state.pages.map((page) => page.limit)).toEqual([30]);
    expect(button("valgte fotos").props.disabled).toBe(true);
    expect(state.writes).toHaveLength(0);
    expect(html()).toContain("ikke en AI-vurdering");
  });

  it("selects only the loaded page on the explicit select-all action; later pages stay unselected", async () => {
    tree();
    await idle();
    check(0);
    expect(html()).toContain("30 valgt");
    click("Vis flere fotos");
    await idle();
    const checkboxes = findAll(
      tree(),
      (props, type) => type === "input" && props.type === "checkbox",
    );
    expect(checkboxes).toHaveLength(61);
    expect(checkboxes[0].props.checked).toBe(false);
    expect(checkboxes.filter((input) => input.props.checked)).toHaveLength(30);
    expect(state.writes).toHaveLength(0);
  });

  it("bounds paginated candidate loading to 200 and never chooses the remaining originals", async () => {
    state.rows = Array.from({ length: 205 }, (_, index) => ({
      ...fixture.candidate,
      mediaId: uuid("a1", 500 - index),
      fileName: `DJI_${index + 1}.JPG`,
    }));
    tree();
    await idle();
    for (let page = 1; page < 7; page++) {
      click("Vis flere fotos");
      await idle();
    }
    expect(state.pages.map((page) => page.limit)).toEqual([30, 30, 30, 30, 30, 30, 20]);
    expect(
      findAll(tree(), (props, type) => type === "input" && props.type === "checkbox"),
    ).toHaveLength(201);
    expect(button("Vis flere fotos")).toBeUndefined();
    expect(html()).toContain("første 200 originaler");
    expect(html()).toContain("0 valgt");
  });

  it("assigns explicitly selected photos to all saved questions with actual confirmed progress", async () => {
    tree();
    await idle();
    check(1);
    check(2);
    expect(state.writes).toHaveLength(0);
    click("valgte fotos");
    await idle();
    expect(state.writes).toHaveLength(2);
    expect(state.writes.every((input) => input.expectedCallerUserId === state.actorId)).toBe(true);
    expect(
      state.writes.every(
        (input) =>
          JSON.stringify(input.questionIds) ===
          JSON.stringify([...fixture.round.manifest.questionIds].sort()),
      ),
    ).toBe(true);
    expect(state.reads).toHaveLength(2);
    expect(html()).toContain("2 af 2 tilknytninger læsebekræftet");
    expect(state.assigned).toBe(1);
  });

  it("rehydrates an ambiguous write with its same request and confirms it without writing again", async () => {
    tree();
    await idle();
    check(1);
    state.loseResponse = true;
    click("valgte fotos");
    await idle();
    const requestId = state.writes[0].requestId;
    expect(batch()!.entries[0].status).toBe("pending");
    unmount();
    state.hooks = [];
    tree();
    await idle();
    expect(batch()!.entries[0].receipt.input.requestId).toBe(requestId);
    expect(html()).toContain("0 af 1 tilknytninger læsebekræftet");
    click("Genoptag");
    await idle();
    expect(state.writes).toHaveLength(1);
    expect(state.reads).toHaveLength(1);
    expect(html()).toContain("1 af 1 tilknytninger læsebekræftet");
  });

  it("opens a completed batch without mutating another tab's progress and requests fresh confirmation", async () => {
    tree();
    await idle();
    check(1);
    click("valgte fotos");
    await idle();
    const storageKey = inspectionPhotoBatchKey({ actorId: state.actorId, round: fixture.round });
    const completed = values.get(storageKey);
    unmount();
    state.hooks = [];
    tree();
    await idle();
    expect(values.get(storageKey)).toBe(completed);
    expect(html()).toContain("0 af 1 tilknytninger læsebekræftet");
    expect(html()).toContain("afventer ny læsebekræftelse");
    expect(button("Afslut dette batch")).toBeUndefined();
    click("Genoptag");
    await idle();
    expect(state.writes).toHaveLength(1);
    expect(state.reads).toHaveLength(2);
  });

  it("adopts another window's completed batch only as pending until an explicit fresh confirmation", async () => {
    tree();
    await idle();
    check(1);
    const scope = { actorId: state.actorId, round: fixture.round };
    const other = createInspectionPhotoBatch(scope, [state.rows[0]], () => uuid("a8", 1));
    const receipt = other.entries[0].receipt;
    const version = await state.makeSaved!({
      ...receipt.input,
      expectedCallerUserId: state.actorId,
    });
    state.saved.set(version.mediaId, version);
    other.entries[0] = {
      receipt,
      status: "confirmed",
      bindingId: version.id,
      bindingSha256: version.manifestSha256,
    };
    const text = JSON.stringify(other);
    values.set(inspectionPhotoBatchKey(scope), text);
    click("valgte fotos");
    await idle();
    expect(html()).toContain("0 af 1 tilknytninger læsebekræftet");
    expect(button("Afslut dette batch")).toBeUndefined();
    expect(state.reads).toHaveLength(0);
    expect(values.get(inspectionPhotoBatchKey(scope))).toBe(text);
    click("Genoptag");
    await idle();
    expect(state.reads).toHaveLength(1);
    expect(state.writes).toHaveLength(0);
    expect(html()).toContain("1 af 1 tilknytninger læsebekræftet");
  });

  it("freshly reads shared confirmed flags for the same pending requests", async () => {
    tree();
    await idle();
    check(1);
    state.loseResponse = true;
    click("valgte fotos");
    await idle();
    const pending = batch()!,
      receipt = pending.entries[0].receipt,
      version = state.saved.get(receipt.input.mediaId)!;
    pending.entries[0] = {
      receipt,
      status: "confirmed",
      bindingId: version.id,
      bindingSha256: version.manifestSha256,
    };
    values.set(
      inspectionPhotoBatchKey({ actorId: state.actorId, round: fixture.round }),
      JSON.stringify(pending),
    );
    click("Genoptag");
    await idle();
    expect(state.reads).toHaveLength(1);
    expect(state.writes).toHaveLength(1);
    expect(html()).toContain("1 af 1 tilknytninger læsebekræftet");
  });

  it("proves progress after a queued Web Lock even if another tab completed the requests while waiting", async () => {
    let queued: (() => Promise<unknown>) | null = null;
    let release!: () => void;
    vi.stubGlobal("navigator", {
      locks: {
        request: (_key: string, _options: unknown, run: () => Promise<unknown>) => {
          queued = run;
          return new Promise((resolve, reject) => {
            release = () => {
              void run().then(resolve, reject);
            };
          });
        },
      },
    });
    const original = createInspectionPhotoBatch(
      { actorId: state.actorId, round: fixture.round },
      [state.rows[0]],
      () => uuid("a8", 1),
    );
    values.set(
      inspectionPhotoBatchKey({ actorId: state.actorId, round: fixture.round }),
      JSON.stringify(original),
    );
    tree();
    await idle();
    click("Genoptag");
    await vi.waitFor(() => expect(queued).not.toBeNull(), { interval: 5 });
    const pending = batch()!,
      receipt = pending.entries[0].receipt;
    const version = await state.makeSaved!({
      ...receipt.input,
      expectedCallerUserId: state.actorId,
    });
    state.saved.set(version.mediaId, version);
    pending.entries[0] = {
      receipt,
      status: "confirmed",
      bindingId: version.id,
      bindingSha256: version.manifestSha256,
    };
    values.set(
      inspectionPhotoBatchKey({ actorId: state.actorId, round: fixture.round }),
      JSON.stringify(pending),
    );
    release();
    await idle();
    expect(state.reads).toHaveLength(1);
    expect(state.writes).toHaveLength(0);
    expect(html()).toContain("1 af 1 tilknytninger læsebekræftet");
    expect(state.assigned).toBe(1);
  });

  it("locks initial receipt creation and preserves another tab's requests while the first selection waits", async () => {
    let release!: () => void;
    let queued = false;
    vi.stubGlobal("navigator", {
      locks: {
        request: (_key: string, _options: unknown, run: () => Promise<unknown>) => {
          queued = true;
          return new Promise((resolve, reject) => {
            release = () => {
              void run().then(resolve, reject);
            };
          });
        },
      },
    });
    tree();
    await idle();
    check(1);
    click("valgte fotos");
    await vi.waitFor(() => expect(queued).toBe(true), { interval: 5 });
    expect(values.size).toBe(0);
    const scope = { actorId: state.actorId, round: fixture.round };
    const other = createInspectionPhotoBatch(scope, [state.rows[1]], () => uuid("a8", 1));
    const text = JSON.stringify(other);
    values.set(inspectionPhotoBatchKey(scope), text);
    release();
    await idle();
    expect(values.get(inspectionPhotoBatchKey(scope))).toBe(text);
    expect(state.writes).toHaveLength(0);
    expect(html()).toContain("Et tidligere batch er fundet");
    expect(html()).toContain("DJI_2.JPG");
    expect(batch()!.entries[0].receipt.input.requestId).toBe(uuid("a8", 1));
  });

  it("refreshes the parent's bindings even when a later conflict stops a partially successful batch", async () => {
    tree();
    await idle();
    check(1);
    check(2);
    const existing = await state.makeSaved!({
      mediaId: state.rows[1].mediaId,
      requestId: uuid("a8", 1),
      questionIds: [fixture.round.manifest.questionIds[0]],
      expectedCallerUserId: state.actorId,
    });
    state.saved.set(existing.mediaId, existing);
    click("valgte fotos");
    await idle();
    expect(state.writes).toHaveLength(1);
    expect(html()).toContain("1 af 2 tilknytninger læsebekræftet");
    expect(html()).toContain("1 konflikter");
    expect(html()).toContain("bevares uændret");
    expect(state.saved.get(existing.mediaId)).toEqual(existing);
    expect(state.assigned).toBe(1);
  });

  it("does not read, update the new screen or notify after unmount during a write", async () => {
    let release!: () => void;
    state.saveGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tree();
    await idle();
    check(1);
    click("valgte fotos");
    await vi.waitFor(() => expect(state.saved.size).toBe(1), { interval: 5 });
    unmount();
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(state.reads).toHaveLength(0);
    expect(batch()!.entries[0].status).toBe("pending");
    expect(state.assigned).toBe(0);
  });

  it("ignores old-actor candidate responses after a user switch", async () => {
    let release!: (value: {
      items: SurveyRoundMediaCandidate[];
      nextBeforeId: string | null;
    }) => void;
    state.candidateGate = new Promise((resolve) => {
      release = resolve;
    });
    tree();
    await vi.waitFor(() => expect(state.pages).toHaveLength(1), { interval: 5 });
    const oldRows = state.rows.slice(0, 30);
    state.actorId = uuid("a9", 1);
    state.rows = [];
    tree();
    await idle();
    release({ items: oldRows, nextBeforeId: null });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(html()).not.toContain("DJI_1.JPG");
    expect(state.writes).toHaveLength(0);
  });
});
