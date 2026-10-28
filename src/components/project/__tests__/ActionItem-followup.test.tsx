import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/services/actions-service", () => ({
  actionPriorityTone: () => "neutral",
  getActionEvidence: vi.fn(),
}));
vi.mock("../ActionEvidenceDialog", () => ({ ActionEvidenceDialog: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
  }: {
    children: React.ReactNode;
    params: { slug: string };
    search: { step: string };
  }) => <a href={"/app/projects/" + params.slug + "?step=" + search.step}>{children}</a>,
}));
import { ActionItem } from "../ActionItem";
it("opens versioned followup editing from the existing action list instead of generic status buttons", () => {
  const html = renderToStaticMarkup(
    <ActionItem
      action={{
        id: "synthetic-task",
        project_id: "synthetic-project",
        title: "SYNTHETIC followup",
        description: "SYNTHETIC",
        priority: null,
        status: "I gang",
        due_date: null,
        owner: null,
        created_at: "2026-10-28",
        action_type: "workflow_followup",
      }}
    />,
  );
  expect(html).toContain("/app/projects/synthetic-project?step=rapport");
  expect(html).toContain("opfølgning og historik");
  expect(html).not.toContain("<button");
});
