// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectWorkspaceShell } from "../ProjectWorkspaceShell";
import { ProjectTabs } from "../ProjectTabs";
import { ProjectNavigation } from "../ProjectNavigation";
import { PROJECT_TABS, type ProjectView } from "@/lib/project-navigation";

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});
async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  return {
    host,
    render: async (element: React.ReactNode) => {
      await act(async () => root.render(element));
    },
  };
}
function Editor({ name }: { name: string }) {
  const [value, setValue] = useState(0);
  return (
    <section aria-label={name}>
      <button onClick={() => setValue(value + 1)}>Ret {name}</button>
      <output>{value}</output>
    </section>
  );
}
describe("shared project workspace", () => {
  it("collapses general help for a selected task while preserving a mounted editor across focus changes", async () => {
    const { host, render } = await mount();
    const shell = (focused: boolean) => (
      <ProjectWorkspaceShell
        taskFocused={focused}
        view={{ kind: "tab", id: "handlinger" }}
        onNavigate={() => {}}
        renderTab={() => <Editor name="handlinger" />}
        renderStep={() => <div />}
      />
    );
    await render(shell(false));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('section[aria-label="handlinger"] button')!.click(),
    );
    const draft = host.querySelector('section[aria-label="handlinger"]')!;
    await render(shell(true));
    expect(host.querySelector('section[aria-label="handlinger"]')).toBe(draft);
    expect(draft.querySelector("output")?.textContent).toBe("1");
    const guide = host.querySelector('[aria-label="Formål og resultat"]')!;
    expect(guide.closest("details")?.open).toBe(false);
    expect(host.textContent).toContain("← Til projektets forløb");
    await render(shell(false));
    expect(host.querySelector('section[aria-label="handlinger"]')).toBe(draft);
    expect(host.querySelector('[aria-label="Formål og resultat"]')?.closest("details")).toBeNull();
  });
  it("keeps navigation and another tool available when a visited tool fails", async () => {
    const { host, render } = await mount();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let failed = true;
    function FailingTool() {
      if (failed) throw new Error("test source unavailable");
      return <p>Genindlæst</p>;
    }
    const shell = (view: ProjectView) => (
      <ProjectWorkspaceShell
        view={view}
        onNavigate={() => {}}
        renderTab={() => <Editor name="overblik" />}
        renderStep={() => <FailingTool />}
      />
    );
    try {
      await render(shell({ kind: "step", id: "baseline" }));
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "Værktøjet kunne ikke åbnes",
      );
      expect(host.querySelector('nav[aria-label="Projektets arbejdsområder"]')).not.toBeNull();
      failed = false;
      const retry = [...host.querySelectorAll("button")].find(
        (b) => b.textContent === "Prøv igen",
      )!;
      await act(async () => retry.click());
      expect(host.textContent).toContain("Genindlæst");
      await render(shell({ kind: "tab", id: "overblik" }));
      expect(host.querySelector('section[aria-label="overblik"]')?.closest("[hidden]")).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
  it("keeps visited tab and guided editors alive, and clears them on actor/project change", async () => {
    const { host, render } = await mount();
    function shell(key: string, view: ProjectView) {
      return (
        <ProjectWorkspaceShell
          key={key}
          view={view}
          onNavigate={() => {}}
          renderTab={(tab) => (
            <ProjectTabs
              tabs={PROJECT_TABS.map((t) => ({ ...t }))}
              showNavigation={false}
              retainVisitedPanels
              activeTab={tab}
            >
              {(id) => <Editor name={id} />}
            </ProjectTabs>
          )}
          renderStep={(step) => <Editor name={step} />}
        />
      );
    }
    await render(shell("actor-a:project-a", { kind: "tab", id: "handlinger" }));
    await act(async () =>
      (host.querySelector('section[aria-label="handlinger"] button') as HTMLButtonElement).click(),
    );
    await render(shell("actor-a:project-a", { kind: "step", id: "sammenligning" }));
    await act(async () =>
      (
        host.querySelector('section[aria-label="sammenligning"] button') as HTMLButtonElement
      ).click(),
    );
    await render(shell("actor-a:project-a", { kind: "tab", id: "rapporter" }));
    expect(host.querySelector('section[aria-label="handlinger"] output')?.textContent).toBe("1");
    expect(host.querySelector('section[aria-label="sammenligning"] output')?.textContent).toBe("1");
    expect(
      host.querySelector('section[aria-label="sammenligning"]')?.closest("[hidden]"),
    ).not.toBeNull();
    await render(shell("actor-a:project-a", { kind: "step", id: "sammenligning" }));
    expect(
      host.querySelector('section[aria-label="sammenligning"]')?.closest("[hidden]"),
    ).toBeNull();
    await render(shell("actor-b:project-a", { kind: "tab", id: "handlinger" }));
    expect(host.querySelector('section[aria-label="handlinger"] output')?.textContent).toBe("0");
    expect(host.querySelector('section[aria-label="sammenligning"]')).toBeNull();
    await render(shell("actor-b:project-b", { kind: "tab", id: "handlinger" }));
    expect(host.querySelector('section[aria-label="handlinger"] output')?.textContent).toBe("0");
  });
  it("offers the same secondary destination on mobile and desktop", async () => {
    const { host, render } = await mount();
    const navigate = vi.fn();
    await render(<ProjectNavigation view={{ kind: "tab", id: "medier" }} onNavigate={navigate} />);
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "step:datagrundlag";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(navigate).toHaveBeenLastCalledWith({ kind: "step", id: "datagrundlag" });
    const button = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Opret undersøgelse",
    )!;
    await act(async () => button.click());
    expect(navigate).toHaveBeenLastCalledWith({ kind: "step", id: "datagrundlag" });
  });
});
