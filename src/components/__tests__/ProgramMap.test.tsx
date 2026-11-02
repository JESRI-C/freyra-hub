// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a
      {...props}
      href={to + (Object.keys(search ?? {}).length ? "?" + new URLSearchParams(search) : "")}
    >
      {children}
    </a>
  ),
}));
import { ProgramMap } from "../ProgramMap";
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
});
async function render(projectId?: string) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ProgramMap projectId={projectId} />));
  return host;
}
async function choose(host: HTMLElement, label: string, value: string) {
  const el = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
describe("program overview", () => {
  it("shows planned work without active action controls and can recover from an empty selection", async () => {
    const host = await render("project-a");
    await choose(host, "Vis funktioner", "planned");
    expect(host.querySelectorAll("article").length).toBeGreaterThan(10);
    expect(host.querySelectorAll("article a").length).toBe(0);
    await choose(host, "Arbejdsområde", "overview");
    expect(host.textContent).toContain("Ingen funktioner matcher");
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Vis alle funktioner igen")!
        .click(),
    );
    expect(host.querySelectorAll("article").length).toBeGreaterThan(80);
  });
  it("offers a real project selection when no project is chosen", async () => {
    const host = await render();
    await choose(host, "Arbejdsområde", "tasks");
    const link = [...host.querySelectorAll("a")].find(
      (a) => a.textContent === "Vælg projekt til Aflevering",
    )!;
    expect(link.getAttribute("href")).toBe("/app/projects");
  });
  it("shows all ten Skyhost areas and keeps planned time/material/booking controls inactive", async () => {
    const host = await render("project-a");
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Skyhosts ti jobområder")!
        .click(),
    );
    const list = host.querySelector('section[aria-label="Skyhost-jobkortets funktioner"]')!;
    expect(list.querySelectorAll("li").length).toBe(10);
    for (const title of ["Timer", "Materialer", "Booking", "Ruter"]) {
      const item = [...list.querySelectorAll("li")].find(
        (li) => li.querySelector("h2")?.textContent === title,
      )!;
      expect(item.textContent).toContain("Planlagt");
      expect(item.querySelector("a")).toBeNull();
    }
    expect(
      list.querySelector('a[href="/app/projects/project-a?tab=handlinger&work=evidence"]'),
    ).not.toBeNull();
  });
});
