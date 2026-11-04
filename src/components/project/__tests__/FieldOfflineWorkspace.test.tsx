// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldWorkPack } from "@/lib/field-offline";
import { emptyWorkOrderPlan } from "@/lib/work-order-plan";
const f = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  project: "22222222-2222-4222-8222-222222222222",
  action: "33333333-3333-4333-8333-333333333333",
  packs: vi.fn(),
  items: vi.fn(),
  enqueue: vi.fn(),
  prepare: vi.fn(),
  photo: vi.fn(),
  blocker: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: f.blocker,
  Link: ({
    children,
    to,
    params: _params,
    search: _search,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    params?: unknown;
    search?: unknown;
  }) => (
    <a
      href={to}
      data-params={JSON.stringify(_params)}
      data-search={JSON.stringify(_search)}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: null }));
vi.mock("@/services/field-offline-store", () => ({
  openFieldOfflineStore: async () => ({
    packs: f.packs,
    enqueue: f.enqueue,
    items: f.items,
    close: () => {},
  }),
}));
vi.mock("@/services/field-offline-sync", () => ({ drainFieldOfflineQueue: async () => 0 }));
vi.mock("@/services/field-offline-service", () => ({
  offlineSyncDependencies: () => ({}),
  prepareOfflineJob: f.prepare,
  prepareOfflinePhoto: f.photo,
  downloadFieldWorkPack: vi.fn(),
  requireOfflineOnlineActor: vi.fn(),
}));
vi.mock("@/services/field-offline-shell", () => ({
  checkFieldOfflineShell: async () => true,
  prepareFieldOfflineShell: vi.fn(),
}));
import { FieldOfflineWorkspace } from "../FieldOfflineWorkspace";
let root: ReturnType<typeof createRoot> | undefined, host: HTMLDivElement;
const pack = (): FieldWorkPack => {
  const template = {
    id: crypto.randomUUID(),
    template_id: crypto.randomUUID(),
    organization_id: crypto.randomUUID(),
    project_id: f.project,
    version: 1,
    request_id: crypto.randomUUID(),
    created_by: f.actor,
    created_at: new Date().toISOString(),
    definition: {
      schema: "freyra.field-job-template/v1" as const,
      title: "Tilsyn",
      domain: "general" as const,
      fields: [
        { key: "count", label: "Antal", type: "number" as const, unit: "stk.", required: true },
        { key: "seen", label: "Observeret", type: "boolean" as const, required: true },
      ],
    },
  };
  return {
    actorId: f.actor,
    projectId: f.project,
    organizationId: template.organization_id,
    projectName: "Testsag",
    savedAt: 1000,
    jobs: [
      {
        actionId: f.action,
        title: "Feltbesøg",
        template,
        latest: {
          id: crypto.randomUUID(),
          organization_id: template.organization_id,
          project_id: f.project,
          action_id: f.action,
          template_version_id: template.id,
          version: 1,
          request_id: crypto.randomUUID(),
          created_by: f.actor,
          created_at: new Date().toISOString(),
          values: { count: 0, seen: false },
          status: "draft",
          correction_reason: null,
        },
      },
    ],
  };
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("freyra-field-device-v1", f.actor);
  f.packs.mockResolvedValue([pack()]);
  f.items.mockReset().mockResolvedValue([]);
  f.prepare.mockReturnValue({ id: "local" });
  f.enqueue.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function edit() {
  await act(async () => root!.render(<FieldOfflineWorkspace requestedProject={f.project} />));
  const task = Array.from(host.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.value === f.action),
  )!;
  await act(async () => {
    task.value = f.action;
    task.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const reason = Array.from(host.querySelectorAll("label"))
    .find((l) => l.textContent?.includes("Begrundelse"))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      reason,
      "Feltbesøg",
    );
    reason.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Gem registrering på telefonen"),
  )!;
}
function requiredPack() {
  const source = pack(),
    first = source.jobs[0].template!;
  const second = {
    ...first,
    id: crypto.randomUUID(),
    template_id: crypto.randomUUID(),
    definition: {
      ...first.definition,
      title: "Habitatbesøg",
      fields: [{ key: "habitat", label: "Habitat", type: "text" as const, required: true }],
    },
  };
  source.jobs[0] = {
    ...source.jobs[0],
    template: null,
    latest: null,
    registrations: [],
    requirements: {
      planVersionId: crypto.randomUUID(),
      planVersion: 1,
      cards: [first, second],
      canRecord: true,
    },
  };
  source.jobs[0].plan = {
    id: source.jobs[0].requirements!.planVersionId,
    version: 1,
    plan: {
      ...emptyWorkOrderPlan("Feltinstruks"),
      instructions: "Undersøg stedet efter den gemte instruks",
      requiredJobCards: [first, second].map((card) => ({
        templateVersionId: card.id,
        templateId: card.template_id,
        version: card.version,
        definition: card.definition,
      })),
    },
  };
  return source;
}
async function inputValue(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const inputWithLabel = (prefix: string) =>
  [...host.querySelectorAll("label")]
    .find((label) => label.textContent?.trim().startsWith(prefix))!
    .querySelector<HTMLInputElement>("input")!;
describe("mobile field local save feedback", () => {
  it("retains the corrected source without counting it as an outstanding registration", async () => {
    const source = pack(),
      job = source.jobs[0],
      received = crypto.randomUUID();
    f.packs.mockResolvedValue([source]);
    f.items.mockResolvedValue([
      {
        id: crypto.randomUUID(),
        kind: "job",
        state: "conflict",
        projectId: f.project,
        supersededBy: received,
        template: job.template,
        payload: { actionId: f.action, expectedVersion: 1, values: job.latest!.values },
      },
      {
        id: received,
        kind: "job",
        state: "complete",
        projectId: f.project,
        template: job.template,
        payload: { actionId: f.action, expectedVersion: 1, values: job.latest!.values },
        receipt: { ...job.latest, version: 2 },
      },
    ]);
    await act(async () => root!.render(<FieldOfflineWorkspace requestedProject={f.project} />));
    const queue = host.querySelector('[aria-label="Telefonens feltkø"]')!;
    expect(queue.textContent).toContain("0 afventer på denne sag");
    expect(queue.textContent).toContain("1 tidligere kladder er bevaret");
    expect(queue.textContent).toContain("Bevaret – rettet i nyere registrering");
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it("saves a first required card and reopens each card's local answers without mixing them", async () => {
    const source = requiredPack(),
      cards = source.jobs[0].requirements!.cards;
    const queue: unknown[] = [];
    f.packs.mockResolvedValue([source]);
    f.items.mockResolvedValue(queue);
    f.prepare.mockImplementation((_pack, actionId, raw) => ({
      id: crypto.randomUUID(),
      actorId: f.actor,
      projectId: f.project,
      kind: "job",
      state: "queued",
      createdAt: Date.now(),
      originalBytes: 0,
      attempts: 0,
      lastError: null,
      receipt: null,
      template: cards.find((card) => card.id === raw.templateVersionId),
      payload: {
        actionId,
        templateVersionId: raw.templateVersionId,
        requiredPlanVersionId: source.jobs[0].requirements!.planVersionId,
        expectedVersion: queue.length,
        ...raw,
      },
    }));
    f.enqueue.mockImplementation(async (item) => {
      queue.push(item);
    });
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    const selector = () =>
      host.querySelector<HTMLSelectElement>('select[aria-label="Jobkort i opgavepakken"]')!;
    expect(host.textContent).toContain("Den første registrering kan gemmes på telefonen");
    expect(host.textContent).toContain("Undersøg stedet efter den gemte instruks");
    await inputValue(host.querySelector<HTMLInputElement>('input[type="number"]')!, "0");
    const yesNo = [...host.querySelectorAll("select")].find((select) =>
      [...select.options].some((option) => option.value === "false"),
    )!;
    await act(async () => {
      yesNo.value = "false";
      yesNo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(selector().disabled).toBe(true);
    await inputValue(inputWithLabel("Begrundelse"), "Første kort");
    const save = () =>
      [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Gem registrering på telefonen"),
      )!;
    await act(async () => save().click());
    expect(f.prepare.mock.calls[0][2]).toMatchObject({
      templateVersionId: cards[0].id,
      values: { count: 0, seen: false },
    });
    expect(selector().disabled).toBe(false);
    await act(async () => {
      selector().value = cards[1].id;
      selector().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector('input[type="number"]')).toBeNull();
    expect(inputWithLabel("Habitat").value).toBe("");
    await inputValue(inputWithLabel("Habitat"), "Eng");
    await inputValue(inputWithLabel("Begrundelse"), "Andet kort");
    await act(async () => save().click());
    expect(f.prepare.mock.calls[1][2]).toMatchObject({
      templateVersionId: cards[1].id,
      values: { habitat: "Eng" },
    });
    await act(async () => {
      selector().value = cards[0].id;
      selector().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe("0");
    expect([...host.querySelectorAll("select")].some((select) => select.value === "false")).toBe(
      true,
    );
    expect(queue).toHaveLength(2);
  });
  it("keeps required cards read-only when the downloaded capability does not allow execution", async () => {
    const source = requiredPack();
    source.jobs[0].requirements!.canRecord = false;
    f.packs.mockResolvedValue([source]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.disabled).toBe(true);
    expect(inputWithLabel("Begrundelse").disabled).toBe(true);
    const save = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Gem registrering på telefonen"),
    )!;
    expect(save.disabled).toBe(true);
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it("preserves a draft collected on another plan and requires explicit reuse of its answers", async () => {
    const source = requiredPack(),
      card = source.jobs[0].requirements!.cards[0];
    source.jobs[0].requirements!.planVersion = 2;
    source.jobs[0].plan!.version = 2;
    f.packs.mockResolvedValue([source]);
    f.items.mockResolvedValue([
      {
        id: crypto.randomUUID(),
        kind: "job",
        state: "conflict",
        projectId: f.project,
        template: card,
        payload: {
          actionId: f.action,
          templateVersionId: card.id,
          requiredPlanVersionId: crypto.randomUUID(),
          expectedVersion: 0,
          values: { count: 0, seen: false },
          status: "recorded",
        },
      },
    ]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    expect(host.textContent).toContain("anden planversion");
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe("");
    const copy = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Brug den bevarede registrering som ny kladde"),
    )!;
    await act(async () => copy.click());
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe("0");
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it("opens the requested jobcard only when it belongs to the saved project pack", async () => {
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    expect(
      (host.querySelector('section[aria-label="Jobkort på telefonen"] select') as HTMLSelectElement)
        .value,
    ).toBe(f.action);
    expect(host.textContent).toContain("Skabelonversion 1");
    expect(host.textContent).toContain("Jobkort og opgavefotos bruger samme valg");
  });
  it("reuses an already received card after a plan change without treating it as a conflict draft", async () => {
    const source = requiredPack(),
      card = source.jobs[0].requirements!.cards[0];
    f.packs.mockResolvedValue([source]);
    f.items.mockResolvedValue([
      {
        id: crypto.randomUUID(),
        kind: "job",
        state: "complete",
        projectId: f.project,
        template: card,
        payload: {
          actionId: f.action,
          templateVersionId: card.id,
          requiredPlanVersionId: crypto.randomUUID(),
          expectedVersion: 0,
          values: { count: 4, seen: false },
          status: "recorded",
        },
      },
    ]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    const copy = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Brug den bevarede registrering som ny kladde"),
    )!;
    await act(async () => copy.click());
    await inputValue(inputWithLabel("Begrundelse"), "Svar gennemgået efter ny plan");
    const save = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Gem registrering på telefonen"),
    )!;
    await act(async () => save.click());
    expect(f.prepare.mock.calls.at(-1)![2]).toMatchObject({
      values: { count: 4, seen: false },
      supersedesId: undefined,
    });
  });
  it("shows the preserved answers of a blocked card and offers no new conflict correction", async () => {
    const source = requiredPack(),
      card = source.jobs[0].requirements!.cards[0];
    f.packs.mockResolvedValue([source]);
    f.items.mockResolvedValue([
      {
        id: crypto.randomUUID(),
        kind: "job",
        state: "blocked",
        projectId: f.project,
        template: card,
        payload: {
          actionId: f.action,
          templateVersionId: card.id,
          requiredPlanVersionId: source.jobs[0].requirements!.planVersionId,
          expectedVersion: 0,
          values: { count: 5, seen: false },
          status: "recorded",
        },
      },
    ]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    expect(host.textContent).toContain("På telefonen");
    expect(host.textContent).toContain("Afklar adgangen");
    expect(
      [...host.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("Brug den bevarede registrering som ny kladde"),
      ),
    ).toBe(false);
  });
  it("waits for an unsent old-plan card before offering a new correction", async () => {
    const source = requiredPack(),
      card = source.jobs[0].requirements!.cards[0];
    f.packs.mockResolvedValue([source]);
    f.items.mockResolvedValue([
      {
        id: crypto.randomUUID(),
        kind: "job",
        state: "queued",
        projectId: f.project,
        template: card,
        payload: {
          actionId: f.action,
          templateVersionId: card.id,
          requiredPlanVersionId: crypto.randomUUID(),
          expectedVersion: 0,
          values: { count: 6, seen: false },
          status: "recorded",
        },
      },
    ]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    expect(host.textContent).toContain("Synkronisér den bevarede registrering");
    expect(
      [...host.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("Brug den bevarede registrering som ny kladde"),
      ),
    ).toBe(false);
  });
  it("links back to evidence on the exact requested job only when online", async () => {
    const round = "44444444-4444-4444-8444-444444444444";
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace
          requestedProject={f.project}
          requestedRound={round}
          requestedActionId={f.action}
        />,
      ),
    );
    const evidenceLink = () =>
      [...host.querySelectorAll("a")].find((link) =>
        link.textContent?.includes("Knyt dokumentation til opgaven"),
      );
    expect(evidenceLink()?.getAttribute("href")).toBe("/app/projects/$slug");
    expect(JSON.parse(evidenceLink()!.dataset.params!)).toEqual({ slug: f.project });
    expect(JSON.parse(evidenceLink()!.dataset.search!)).toEqual({
      tab: "handlinger",
      round,
      task: f.action,
      work: "evidence",
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(evidenceLink()).toBeUndefined();
    vi.restoreAllMocks();
  });
  it("follows the selected task instead of the original URL when opening documentation", async () => {
    const source = pack(),
      next = "55555555-5555-4555-8555-555555555555";
    source.jobs.push({
      ...source.jobs[0],
      actionId: next,
      title: "Næste feltopgave",
      latest: { ...source.jobs[0].latest!, action_id: next },
    });
    f.packs.mockResolvedValue([source]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace
          requestedProject={f.project}
          requestedActionId={f.action}
          requestedRound="44444444-4444-4444-8444-444444444444"
        />,
      ),
    );
    const select = host.querySelector<HTMLSelectElement>(
      'section[aria-label="Jobkort på telefonen"] select',
    )!;
    await act(async () => {
      select.value = next;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const link = [...host.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Knyt dokumentation til opgaven"),
    )!;
    expect(JSON.parse(link.dataset.search!)).toEqual({
      tab: "handlinger",
      task: next,
      work: "evidence",
    });
    const back = [...host.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Tilbage til sagen"),
    )!;
    expect(JSON.parse(back.dataset.search!)).toEqual({
      tab: "handlinger",
      task: next,
      work: "field",
    });
  });
  it("opens documentation for a task selected in another saved project", async () => {
    const first = pack(),
      second = pack(),
      nextProject = "55555555-5555-4555-8555-555555555555",
      nextTask = "66666666-6666-4666-8666-666666666666";
    second.projectId = nextProject;
    second.projectName = "Anden testsag";
    second.jobs[0].actionId = nextTask;
    second.jobs[0].template!.project_id = nextProject;
    second.jobs[0].latest!.project_id = nextProject;
    second.jobs[0].latest!.action_id = nextTask;
    f.packs.mockResolvedValue([first, second]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    const project = [...host.querySelectorAll("label")]
      .find((l) => l.textContent?.trim().startsWith("Gemt sag"))!
      .querySelector("select")!;
    await act(async () => {
      project.value = nextProject;
      project.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const task = host.querySelector<HTMLSelectElement>(
      'section[aria-label="Jobkort på telefonen"] select',
    )!;
    await act(async () => {
      task.value = nextTask;
      task.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const link = [...host.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Knyt dokumentation til opgaven"),
    )!;
    expect(JSON.parse(link.dataset.params!)).toEqual({ slug: nextProject });
    expect(JSON.parse(link.dataset.search!)).toEqual({
      tab: "handlinger",
      task: nextTask,
      work: "evidence",
    });
  });
  it("links back to evidence on the exact requested job only when online", async () => {
    const round = "44444444-4444-4444-8444-444444444444";
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace
          requestedProject={f.project}
          requestedRound={round}
          requestedActionId={f.action}
        />,
      ),
    );
    const evidenceLink = () =>
      [...host.querySelectorAll("a")].find((link) =>
        link.textContent?.includes("Knyt dokumentation til opgaven"),
      );
    expect(evidenceLink()?.getAttribute("href")).toBe("/app/projects/$slug");
    expect(JSON.parse(evidenceLink()!.dataset.params!)).toEqual({ slug: f.project });
    expect(JSON.parse(evidenceLink()!.dataset.search!)).toEqual({
      tab: "handlinger",
      round,
      task: f.action,
      work: "evidence",
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(evidenceLink()).toBeUndefined();
    vi.restoreAllMocks();
  });
  it("waits for the local queue before opening a saved jobcard", async () => {
    const savedPack = pack();
    f.packs.mockResolvedValue([savedPack]);
    let readQueue!: (items: unknown[]) => void;
    const queue = new Promise<unknown[]>((resolve) => {
      readQueue = resolve;
    });
    f.items.mockReturnValue(queue);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    expect(host.textContent).toContain("Henter gemte feltkladder");
    expect(host.textContent).not.toContain("Skabelonversion 1");
    await act(async () =>
      readQueue([
        {
          id: crypto.randomUUID(),
          projectId: f.project,
          kind: "job",
          state: "queued",
          template: savedPack.jobs[0].template,
          payload: { actionId: f.action, expectedVersion: 1, values: { count: null, seen: false } },
        },
      ]),
    );
    expect(host.textContent).toContain("Nødvendige felter udfyldt: 1 af 2");
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("");
  });
  it("compares a conflicting local answer with the refreshed server version", async () => {
    const refreshed = pack();
    const job = refreshed.jobs[0];
    job.latest = { ...job.latest!, version: 2, values: { count: 8, seen: true } };
    f.packs.mockResolvedValue([refreshed]);
    f.items.mockResolvedValue([
      {
        id: crypto.randomUUID(),
        projectId: f.project,
        kind: "job",
        state: "conflict",
        template: job.template,
        payload: {
          actionId: f.action,
          expectedVersion: 1,
          values: { count: 0, seen: false },
          status: "draft",
        },
      },
    ]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    const values = [...host.querySelectorAll("li dl dd")].map((item) => item.textContent);
    expect(values).toEqual(["8", "0", "Ja", "Nej"]);
    const useLocal = [...host.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("Brug den bevarede registrering som ny kladde"),
    )!;
    await act(async () => useLocal.click());
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("0");
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it("shows the server version and draft status on a completed job receipt", async () => {
    const savedPack = pack();
    const job = savedPack.jobs[0];
    f.packs.mockResolvedValue([savedPack]);
    f.items.mockResolvedValue([
      {
        id: crypto.randomUUID(),
        projectId: f.project,
        kind: "job",
        state: "complete",
        template: job.template,
        payload: { actionId: f.action, expectedVersion: 1, values: job.latest!.values },
        receipt: { ...job.latest, version: 2, status: "draft" },
      },
    ]);
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    const queue = host.querySelector('[aria-label="Telefonens feltkø"]');
    expect(queue?.textContent).toContain("Gemt som version 2 · Kladde");
    expect(queue?.textContent).toContain("Modtaget og kontrolleret på serveren");
  });
  it("counts a retained cancelled registration separately from pending work", async () => {
    const savedPack = pack();
    const job = savedPack.jobs[0];
    const registration = {
      projectId: f.project,
      kind: "job",
      template: job.template,
      payload: { actionId: f.action, expectedVersion: 1, values: job.latest!.values },
    };
    f.packs.mockResolvedValue([savedPack]);
    f.items.mockResolvedValue([
      { ...registration, id: crypto.randomUUID(), state: "blocked", lastError: "cancelled" },
      { ...registration, id: crypto.randomUUID(), state: "queued" },
    ]);
    await act(async () => root!.render(<FieldOfflineWorkspace requestedProject={f.project} />));

    const queue = host.querySelector('[aria-label="Telefonens feltkø"]')!;
    expect(queue.textContent).toContain("1 afventer på denne sag");
    expect(queue.textContent).toContain("1 registrering er bevaret på telefonen efter aflysning.");
    const cancelled = [...queue.querySelectorAll("li")].find((item) =>
      item.textContent?.includes("opgaven er aflyst"),
    );
    expect(cancelled?.textContent).toContain("Hent registrering");
    expect(cancelled?.querySelectorAll("button")).toHaveLength(1);
  });
  it("does not replace an unavailable requested task with another saved task", async () => {
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace
          requestedProject={f.project}
          requestedActionId="44444444-4444-4444-8444-444444444444"
        />,
      ),
    );
    expect(host.textContent).toContain("Der er ikke valgt en erstatningsopgave");
    expect(host.textContent).not.toContain("Skabelonversion 1");
    expect(host.textContent).not.toContain("Knyt dokumentation til opgaven");
    expect(f.prepare).not.toHaveBeenCalled();
    expect(
      [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Tag foto")
        ?.disabled,
    ).toBe(true);
  });
  it("retains a rejected camera file for download and retry instead of discarding the selection", async () => {
    const source = requiredPack();
    source.jobs[0].photoCaptureAllowed = true;
    f.packs.mockResolvedValue([source]);
    f.photo.mockResolvedValue({ id: "photo" });
    f.enqueue.mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    const camera = host.querySelector<HTMLInputElement>('input[capture="environment"]')!;
    Object.defineProperty(camera, "files", {
      value: [new File(["raw"], "camera.png", { type: "image/png" })],
    });
    await act(async () => camera.dispatchEvent(new Event("change", { bubbles: true })));
    expect(host.textContent).toContain("1 originaler er endnu ikke gemt");
    expect(host.textContent).toContain("Hent ikke-gemt original: camera.png");
    expect(
      host
        .querySelector<HTMLSelectElement>('section[aria-label="Jobkort på telefonen"] select')!
        .matches(":disabled"),
    ).toBe(true);
    expect(f.blocker.mock.calls.at(-1)?.[0].enableBeforeUnload).toBe(true);
    const evidence = [...host.querySelectorAll("a")].find((link) =>
      link.textContent?.includes("Knyt dokumentation til opgaven"),
    )!;
    const navigate = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => evidence.dispatchEvent(navigate));
    expect(navigate.defaultPrevented).toBe(true);
    expect(host.textContent).toContain("Gem eller fortryd ændringerne, før du forlader feltsiden.");
    const retry = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Prøv at gemme de resterende"),
    )!;
    f.enqueue.mockResolvedValue(undefined);
    await act(async () => retry.click());
    expect(f.enqueue.mock.calls[1][1]).toBe(f.enqueue.mock.calls[0][1]);
    expect(host.textContent).toContain("1 af 1 originaler er gemt på telefonen.");
    expect(host.textContent).not.toContain("1 originaler er endnu ikke gemt");
    expect(f.blocker.mock.calls.at(-1)?.[0].enableBeforeUnload).toBe(false);
  });
  it("acknowledges only a committed local save and preserves false, zero and field units", async () => {
    let commit!: () => void;
    f.enqueue.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          commit = resolve;
        }),
    );
    const save = await edit();
    expect(host.textContent).toContain("Antal (stk.)");
    await act(async () => save.click());
    expect(host.textContent).not.toContain("Registreringen er gemt på telefonen.");
    expect(f.prepare.mock.calls.at(-1)?.[2]).toMatchObject({
      values: { count: 0, seen: false },
      correctionReason: "Feltbesøg",
    });
    await act(async () => commit());
    expect(host.textContent).toContain("Registreringen er gemt på telefonen.");
  });
  it("counts zero and no, then focuses a required field when its answer is cleared", async () => {
    await edit();
    expect(host.textContent).toContain("Nødvendige felter udfyldt: 2 af 2");
    const count = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(count, "");
      count.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("Nødvendige felter udfyldt: 1 af 2");
    const shortcut = Array.from(host.querySelectorAll("button")).find(
      (item) => item.textContent?.trim() === "Udfyld Antal",
    )!;
    await act(async () => shortcut.click());
    expect(document.activeElement).toBe(count);
  });
  it("keeps the form and reason after quota failure instead of confirming a save", async () => {
    f.enqueue.mockRejectedValue(new DOMException("Lageret er fuldt", "QuotaExceededError"));
    const save = await edit();
    await act(async () => save.click());
    expect(host.textContent).toContain("Telefonens lager er fuldt");
    expect(host.textContent).not.toContain("Registreringen er gemt på telefonen.");
    expect(Array.from(host.querySelectorAll("input")).some((i) => i.value === "Feltbesøg")).toBe(
      true,
    );
  });

  it("captures the currently selected task and instructions without requiring a prior job card", async () => {
    const source = requiredPack();
    source.jobs[0].photoCaptureAllowed = true;
    const second = {
      ...source.jobs[0],
      actionId: crypto.randomUUID(),
      title: "Andet tilsyn",
      plan: { ...source.jobs[0].plan!, id: crypto.randomUUID(), version: 3 },
    };
    source.jobs.push(second);
    f.packs.mockResolvedValue([source]);
    f.photo.mockResolvedValue({ id: "photo" });
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    const select = host.querySelector<HTMLSelectElement>(
      'section[aria-label="Jobkort på telefonen"] select',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        second.actionId,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const camera = host.querySelector<HTMLInputElement>('input[capture="environment"]')!;
    const file = new File(["raw"], "task.png", { type: "image/png" });
    Object.defineProperty(camera, "files", { value: [file] });
    await act(async () => camera.dispatchEvent(new Event("change", { bubbles: true })));
    const photos = host.querySelector('section[aria-label="Feltfotos på telefonen"]')!;
    const cardSelector = host.querySelector('select[aria-label="Jobkort i opgavepakken"]')!;
    expect(
      photos.compareDocumentPosition(cardSelector) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(f.photo.mock.calls[0][5]).toEqual({
      schema: "freyra.field-photo-work-order/v1",
      organizationId: source.organizationId,
      actionId: second.actionId,
      planVersionId: second.plan.id,
    });
    expect(f.enqueue).toHaveBeenCalledWith(expect.anything(), file);
    expect(host.textContent).toContain("Andet tilsyn · arbejdsgrundlag version 3");
  });
  it("requires refresh for a legacy task pack while keeping explicit general project capture", async () => {
    f.photo.mockResolvedValue({ id: "photo" });
    await act(async () =>
      root!.render(
        <FieldOfflineWorkspace requestedProject={f.project} requestedActionId={f.action} />,
      ),
    );
    const captureButton = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Tag foto",
    )!;
    expect(captureButton.disabled).toBe(true);
    const projectRadio = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1];
    await act(async () => projectRadio.click());
    expect(captureButton.disabled).toBe(false);
    const camera = host.querySelector<HTMLInputElement>('input[capture="environment"]')!;
    Object.defineProperty(camera, "files", {
      value: [new File(["raw"], "case.png", { type: "image/png" })],
    });
    await act(async () => camera.dispatchEvent(new Event("change", { bubbles: true })));
    expect(f.photo.mock.calls[0][5]).toBeUndefined();
  });
});
