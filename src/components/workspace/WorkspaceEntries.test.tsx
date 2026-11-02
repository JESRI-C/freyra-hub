// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceEntries } from "./WorkspaceEntries";
import type { WorkspaceEntry } from "@/lib/project-workspace";
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ reset: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
  }: {
    children: React.ReactNode;
    params: { slug: string };
    search: Record<string, string>;
  }) => <a href={`/app/projects/${params.slug}?${new URLSearchParams(search)}`}>{children}</a>,
}));
const id = "11111111-1111-4111-8111-111111111111";
const entry = (source: string, decision: string): WorkspaceEntry => ({
  id,
  entry_id: id,
  organization_id: "org",
  project_id: "project",
  kind: "decision_note",
  title: "Gemt registrering",
  version: 1,
  created_at: "2026-11-02T10:00:00Z",
  created_by: "actor",
  payload: { source, decision, basis: "Synlig begrundelse" },
});
async function render(
  entries: WorkspaceEntry[],
  check: (host: HTMLDivElement) => Promise<void> | void,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <WorkspaceEntries
          kind="decision_note"
          entries={entries}
          scope={{ organizationId: "org", projectId: "project" }}
          canEdit
        />,
      ),
    );
    await check(host);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}
describe("structured records in decision notes", () => {
  it("opens actual execution in the same project and task without rendering or editing raw data", async () => {
    const current = entry(`action-execution:${id}`, '{"schema":"freyra.action-execution/v1"}');
    await render([current], async (host) => {
      expect(host.textContent).toContain("Synlig begrundelse");
      expect(host.textContent).not.toContain('"schema"');
      expect(host.querySelector("a")?.getAttribute("href")).toBe(
        `/app/projects/project?tab=handlinger&task=${id}&work=execution`,
      );
      expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Redigér")).toBe(
        false,
      );
      const history = [...host.querySelectorAll("button")].find(
        (b) => b.textContent === "Versionshistorik",
      )!;
      await act(async () => history.click());
      expect(host.querySelector("ol")).not.toBeNull();
      expect(host.textContent).not.toContain('"schema"');
    });
  });
  it.each([
    [`workflow-followup:${id}`, "Rapport og opfølgning"],
    ["photo-comparison:test", "Før og efter"],
    ["photo-atlas:test:photo", "Fotoatlas"],
  ])("links %s to its existing workspace", async (source, label) => {
    await render([entry(source, '{"internal":"saved data"}')], (host) => {
      expect(host.querySelector("a")?.textContent).toBe(label);
      expect(host.textContent).not.toContain('"internal"');
    });
  });
  it("preserves ordinary user text and generic editing", async () => {
    await render([entry("Brugerens kilde", "Min begrundelse med {egne felter}")], (host) => {
      expect(host.textContent).toContain("Min begrundelse med {egne felter}");
      expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Redigér")).toBe(
        true,
      );
    });
  });
});
