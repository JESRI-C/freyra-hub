// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectTabs } from "../ProjectTabs";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    search,
    children,
    ...props
  }: {
    params: { slug: string };
    search: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a
      {...props}
      href={`/app/projects/${params.slug}?${new URLSearchParams(Object.entries(search).filter(([, value]) => value !== undefined))}`}
    >
      {children}
    </a>
  ),
}));
import { ProjectFieldShortcuts } from "../ProjectFieldShortcuts";

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});
async function render(element: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
  return host;
}
describe("mobile project navigation", () => {
  it("makes secondary tabs selectable on mobile and reports the selected tab", async () => {
    const choose = vi.fn();
    const host = await render(
      <ProjectTabs
        tabs={[
          { id: "overview", label: "Overblik" },
          { id: "jobs", label: "Jobkort" },
          { id: "audit", label: "Revisionsspor" },
        ]}
        primaryTabIds={["overview", "jobs"]}
        onTabChange={choose}
      >
        {(tab) => <p data-current>{tab}</p>}
      </ProjectTabs>,
    );
    const select = host.querySelector("select")!;
    expect(select.options.length).toBe(3);
    await act(async () => {
      select.value = "audit";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(choose).toHaveBeenCalledWith("audit");
    expect(host.querySelector("[data-current]")?.textContent).toBe("audit");
  });
  it("keeps the mobile selection in sync with navigation from another control", async () => {
    const tabs = [
      { id: "jobs", label: "Jobkort" },
      { id: "photos", label: "Fotos" },
    ];
    const host = await render(
      <ProjectTabs tabs={tabs} activeTab="photos">
        {(tab) => <p>{tab}</p>}
      </ProjectTabs>,
    );
    expect(host.querySelector("select")!.value).toBe("photos");
  });
  it("retains the project and survey round in every field shortcut", async () => {
    const host = await render(<ProjectFieldShortcuts projectId="project-one" round="round-one" />);
    const links = Array.from(host.querySelectorAll("a"));
    expect(links.length).toBe(4);
    for (const link of links) {
      const url = new URL(link.href);
      expect(url.pathname).toBe("/app/projects/project-one");
      expect(url.searchParams.get("round")).toBe("round-one");
    }
    expect(
      links.map(
        (link) =>
          new URL(link.href).searchParams.get("tab") ?? new URL(link.href).searchParams.get("step"),
      ),
    ).toEqual(["handlinger", "medier", "billeder", "rapporter"]);
  });
});
