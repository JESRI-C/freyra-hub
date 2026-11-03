// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  actions: vi.fn(),
  schedule: vi.fn(),
  create: vi.fn(),
  blocker: vi.fn(),
  navigate: vi.fn(),
  actor: "actor" as string | null,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: m.actor ? { id: m.actor } : null }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: m.blocker,
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => <a href={to + "?" + new URLSearchParams(search)}>{children}</a>,
}));
vi.mock("@/lib/field-job-access.functions", () => ({ getFieldJobAccess: m.access }));
vi.mock("@/services/field-job-cards-service", () => ({
  listFieldJobActions: m.actions,
  listFieldJobSchedule: m.schedule,
}));
vi.mock("@/services/project-workspace-service", () => ({ createProjectAction: m.create }));
function Editor({
  label,
  selectedActionId,
  onEditing,
}: {
  label: string;
  selectedActionId: string;
  onEditing: (value: boolean) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <section aria-label={label}>
      <p>
        {label} · {selectedActionId}
      </p>
      <label>
        {label} kladde
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onEditing(true);
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          setValue("");
          onEditing(false);
        }}
      >
        Fortryd {label}
      </button>
    </section>
  );
}
vi.mock("../WorkOrderPlansPanel", () => ({
  WorkOrderPlansPanel: (props: Parameters<typeof Editor>[0]) => <Editor {...props} label="Plan" />,
}));
vi.mock("../FieldJobCardsPanel", () => ({
  FieldJobCardsPanel: (props: Parameters<typeof Editor>[0]) => <Editor {...props} label="Felt" />,
}));
vi.mock("../ActionExecutionPanel", () => ({
  ActionExecutionPanel: (props: Parameters<typeof Editor>[0]) => (
    <Editor {...props} label="Udførelse" />
  ),
}));
vi.mock("../WorkOrderEvidencePanel", () => ({
  WorkOrderEvidencePanel: ({
    actionId,
    ...props
  }: { actionId: string } & Omit<Parameters<typeof Editor>[0], "selectedActionId">) => (
    <Editor {...props} selectedActionId={actionId} label="Dokumentation" />
  ),
}));
import { ProjectWorkOrdersWorkspace, type WorkOrderView } from "../ProjectWorkOrdersWorkspace";
vi.mock("../WorkOrderSubmissionPanel", () => ({
  WorkOrderSubmissionPanel: ({
    actionId,
    ...props
  }: { actionId: string } & Omit<Parameters<typeof Editor>[0], "selectedActionId">) => (
    <Editor {...props} selectedActionId={actionId} label="Aflevering" />
  ),
}));
const scope = { organizationId: "org", projectId: "project" };
const tasks = [
  { id: "first", title: "Første opgave", status: "Åben" },
  { id: "second", title: "Anden opgave", status: "Åben" },
];
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function render(
  task?: string,
  canEdit = true,
  controlled = false,
  initialView?: WorkOrderView,
) {
  function RouteHarness() {
    const [selected, select] = useState(task);
    return (
      <ProjectWorkOrdersWorkspace
        scope={scope}
        round="exact-round"
        canEdit={canEdit}
        selectedActionId={controlled ? selected : task}
        initialView={initialView}
        onSelectAction={(id) => {
          m.navigate(id);
          if (controlled) select(id);
        }}
      />
    );
  }
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <RouteHarness />
      </QueryClientProvider>,
    ),
  );
  await settle();
  await settle();
}
async function click(text: string) {
  const node = [...host.querySelectorAll("button")].find((button) => button.textContent === text);
  expect(node, text).toBeTruthy();
  await act(async () => node!.click());
  await settle();
}
async function fill(label: string, value: string) {
  const input = [...host.querySelectorAll("label")]
    .find((node) => node.textContent?.startsWith(label))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  m.actor = "actor";
  m.access.mockResolvedValue({ userId: "actor", projectId: "project", canConfigure: true });
  m.actions.mockResolvedValue(tasks);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
it("shows dated work ahead of undated work and opens its existing plan", async () => {
  m.schedule.mockResolvedValue({ second: { start: "2026-11-03", end: "2026-11-05" } });
  await render();
  await click("Planoversigt");
  expect(m.schedule).toHaveBeenCalledWith(scope);
  expect(host.textContent).toContain("Ingen planlagt dato");
  const listed = [...host.querySelectorAll("button")].filter((button) =>
    button.textContent?.includes("Åbn →"),
  );
  expect(listed[0].textContent).toContain(tasks[1].title);
  expect(listed[0].textContent).toContain("3. nov. 2026");
  await act(async () => listed[0].click());
  expect(m.navigate).toHaveBeenCalledWith("second");
});

it("shows a task spanning the month boundary and filters it by a planned day", async () => {
  const now = new Date();
  const key = (date: Date) =>
    [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((value) => String(value).padStart(2, "0"))
      .join("-");
  m.schedule.mockResolvedValue({
    second: {
      start: key(new Date(now.getFullYear(), now.getMonth(), 0)),
      end: key(new Date(now.getFullYear(), now.getMonth(), 4)),
    },
  });
  await render();
  await click("Kalender");
  const plannedDays = [
    ...host.querySelectorAll<HTMLButtonElement>('button[aria-label*="planlagt arbejde"]'),
  ];
  expect(plannedDays).toHaveLength(4);
  await act(async () => plannedDays[2].click());
  expect(host.textContent).toContain("1 planlagt opgave på den valgte dato");
  expect(host.textContent).toContain(tasks[1].title);
  expect(host.textContent).not.toContain(tasks[0].title);
  await click("Vis hele måneden");
  expect(host.textContent).toContain("1 planlagt opgave i måneden");
});

describe("one task across the project workspaces", () => {
  it("moves to the next step without discarding the current plan draft", async () => {
    await render("first");
    await fill("Plan kladde", "Bevar formålet med indsatsen");
    await click("Videre til feltregistrering →");
    expect(host.querySelector('section[aria-label="Plan"]')?.closest("[hidden]")).not.toBeNull();
    await click("Arbejdsgrundlag");
    expect(host.querySelector<HTMLInputElement>('section[aria-label="Plan"] input')?.value).toBe(
      "Bevar formålet med indsatsen",
    );
    expect(host.querySelector("select")!.disabled).toBe(true);
  });
  it("retains documentation drafts while switching views and does not release another editor's lock", async () => {
    await render("first");
    await fill("Plan kladde", "Planen bevares");
    await click("Dokumentation");
    await fill("Dokumentation kladde", "Koblingen bevares");
    await click("Arbejdsgrundlag");
    await click("Fortryd Plan");
    expect(host.querySelector("select")!.disabled).toBe(true);
    await click("Dokumentation");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Dokumentation"] input')!.value).toBe(
      "Koblingen bevares",
    );
    await click("Fortryd Dokumentation");
    expect(host.querySelector("select")!.disabled).toBe(false);
  });
  it("follows a field return link on the mounted task without discarding an opened editor", async () => {
    const show = async (initialView: WorkOrderView) => {
      await act(async () =>
        root.render(
          <QueryClientProvider client={cache}>
            <ProjectWorkOrdersWorkspace
              scope={scope}
              selectedActionId="second"
              canEdit
              initialView={initialView}
            />
          </QueryClientProvider>,
        ),
      );
      await settle();
      await settle();
    };
    await show("plan");
    await fill("Plan kladde", "Bevar planen");
    await show("field");
    expect(
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Feltregistrering")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Plan"] input')!.value).toBe(
      "Bevar planen",
    );
  });
  it("opens an execution entry link directly in the execution view without mounting the planning editor", async () => {
    await render("second", true, false, "execution");
    expect(host.querySelector('[aria-label="Plan"]')).toBeNull();
    expect(host.querySelector('[aria-label="Udførelse"]')?.textContent).toContain("second");
    expect(
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Udført arbejde")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("opens the exact deep-linked task in all views and retains the round in photo navigation", async () => {
    await render("second");
    expect(host.textContent).toContain("Plan · second");
    expect(host.querySelectorAll("select")).toHaveLength(1);
    expect(host.querySelector('[aria-label="Felt"]')).toBeNull();
    await click("Feltregistrering");
    await click("Udført arbejde");
    expect(host.querySelector('[aria-label="Felt"]')?.textContent).toContain("second");
    expect(host.querySelector('[aria-label="Udførelse"]')?.textContent).toContain("second");
    expect(host.querySelector('a[href*="tab=medier"]')?.getAttribute("href")).toContain(
      "task=second",
    );
    expect(host.querySelector('a[href*="tab=medier"]')?.getAttribute("href")).toContain(
      "round=exact-round",
    );
  });
  it("keeps drafts mounted across views, blocks changing task, then releases the lock on cancel", async () => {
    await render("first");
    await fill("Plan kladde", "Bevar den her plan");
    expect(host.querySelector("select")!.disabled).toBe(true);
    await click("Feltregistrering");
    await fill("Felt kladde", "Bevar feltregistrering");
    await click("Arbejdsgrundlag");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Plan"] input')!.value).toBe(
      "Bevar den her plan",
    );
    await click("Fortryd Plan");
    expect(host.querySelector("select")!.disabled).toBe(true);
    await click("Feltregistrering");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Felt"] input')!.value).toBe(
      "Bevar feltregistrering",
    );
    await click("Fortryd Felt");
    expect(host.querySelector("select")!.disabled).toBe(false);
    expect(m.blocker.mock.calls.at(-1)![0].shouldBlockFn()).toBe(false);
  });
  it("changes the shared task and URL without carrying old task drafts to the new task", async () => {
    await render("first", true, true);
    await act(async () => {
      const select = host.querySelector("select")!;
      select.value = "second";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(m.navigate).toHaveBeenCalledWith("second");
    expect(host.textContent).toContain("Plan · second");
    expect(host.textContent).not.toContain("Plan · first");
  });
  it("does not silently substitute another task for an unavailable deep link", async () => {
    await render("from-another-project");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("kunne ikke findes");
    expect(host.querySelector('[aria-label="Plan"]')).toBeNull();
  });
  it("hides project tools when the current access read fails, rather than using cached permissions", async () => {
    m.access.mockRejectedValue(new Error("Synthetic access unavailable"));
    await render("first");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Synthetic access unavailable",
    );
    expect(host.querySelector('[aria-label="Plan"]')).toBeNull();
    expect(m.actions).not.toHaveBeenCalled();
  });
  it("does not expose creation to a read-only project user", async () => {
    await render(undefined, false);
    expect(host.textContent).not.toContain("Opret arbejdsopgave");
    expect(host.textContent).toContain("Første opgave");
  });
  it("preserves an open draft while a failed permission refresh hides the workspace, then restores it on retry", async () => {
    await render("first");
    await fill("Plan kladde", "Må ikke forsvinde ved netfejl");
    m.access.mockRejectedValueOnce(new Error("Synthetic transient permission check"));
    await act(async () => cache.invalidateQueries({ queryKey: ["field-job-access"] }));
    await settle();
    const draft = host.querySelector<HTMLInputElement>('[aria-label="Plan"] input')!;
    expect(draft.value).toBe("Må ikke forsvinde ved netfejl");
    expect(draft.closest("[hidden]")).toBeTruthy();
    await click("Prøv igen");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Plan"] input')).toBe(draft);
    expect(draft.closest("[hidden]")).toBeNull();
    expect(host.querySelector("select")!.disabled).toBe(true);
    await click("Fortryd Plan");
    expect(host.querySelector("select")!.disabled).toBe(false);
  });
  it("reuses the task identity after a lost create reply and selects it after successful recovery", async () => {
    m.create
      .mockRejectedValueOnce(new Error("Synthetic lost reply"))
      .mockImplementationOnce(async (_scope, title, _description, id) => {
        m.actions.mockResolvedValue([...tasks, { id, title, status: "Åben" }]);
        return { id, title };
      });
    await render("first", true, true);
    await click("Opret arbejdsopgave");
    await fill("Hvad skal der udføres?", "Ny kontrolopgave");
    const submit = async () => {
      await act(async () =>
        host
          .querySelector("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
      await settle();
    };
    await submit();
    await submit();
    await settle();
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.create.mock.calls[1]).toEqual(m.create.mock.calls[0]);
    expect(m.navigate).toHaveBeenLastCalledWith(m.create.mock.calls[0][3]);
    expect(host.querySelector("select")!.value).toBe(m.create.mock.calls[0][3]);
    expect(host.textContent).toContain("Plan · " + m.create.mock.calls[0][3]);
  });
});
