// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Project } from "@/lib/supabase/types";
vi.mock("@/services/projects-service", () => ({ updateProjectDetails: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: false, supabase: null }));
import { ProjectHeader } from "../ProjectHeader";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
const project = {
  id: "project",
  name: "Bykær",
  description: "Projektets problem og mål",
  project_type: "Naturgenopretning",
  location_name: "Bykær",
  municipality: "Testkommune",
  status: "Aktiv",
  start_date: null,
  end_date: null,
} as Project;
async function show(compact: boolean) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <ProjectHeader
          project={project}
          canEdit
          compact={compact}
          sitesCount={4}
          activeDataSourcesCount={2}
          actionsCount={3}
        />
      </QueryClientProvider>,
    ),
  );
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient();
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
it("retains an accessible project heading and an open project editor when task focus compacts context", async () => {
  await show(false);
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent === "Rediger")!
      .click(),
  );
  const name = host.querySelector<HTMLInputElement>("form input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      name,
      "Min ugemte projekttitel",
    );
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await show(true);
  expect(host.querySelector("h1")?.textContent).toBe("Bykær");
  expect(host.querySelector("h1")?.closest("[hidden]")).toBeNull();
  const context = [...host.querySelectorAll("p")].find(
    (paragraph) => paragraph.textContent === "Projekt · Testkommune · Bykær",
  );
  expect(context).toBeDefined();
  expect(context!.closest("[hidden]")).toBeNull();
  expect(
    [...host.querySelectorAll("span")]
      .find((span) => span.textContent === "4 fotopunkter")
      ?.closest("[hidden]"),
  ).not.toBeNull();
  expect(host.querySelector("form input")).toBe(name);
  expect(name.value).toBe("Min ugemte projekttitel");
  await show(false);
  expect(host.querySelector("form input")).toBe(name);
  expect(name.value).toBe("Min ugemte projekttitel");
});
