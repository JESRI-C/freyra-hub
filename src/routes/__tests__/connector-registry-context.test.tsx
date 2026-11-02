import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  project: { id: "selected-project", slug: null as string | null } as {
    id: string;
    slug: string | null;
  } | null,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ currentProject: state.project }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({
    children,
    to,
    params,
  }: {
    children?: React.ReactNode;
    to: string;
    params?: { slug: string };
  }) => <a href={to.replace("$slug", params?.slug ?? "")}>{children}</a>,
}));
vi.mock("@/components/data-foundation/ConnectorRegistryTable", () => ({
  ConnectorRegistryTable: () => <div>Kilderegister</div>,
}));
import { Route } from "../app.connect.registry";

describe("data catalogue project context", () => {
  it.each([
    [{ id: "selected-project", slug: null }, "/app/projects/map/selected-project"],
    [{ id: "selected-project", slug: "selected-slug" }, "/app/projects/map/selected-slug"],
    [null, "/app/projects"],
  ])("opens the selected project or asks for selection", (project, expected) => {
    state.project = project;
    const html = renderToStaticMarkup(
      React.createElement(Route.options.component as React.ComponentType),
    );
    expect(html).toContain(`href="${expected}"`);
    expect(html).not.toContain("skallebaek-biodiversity-pilot");
    expect(html).toContain("Den beviser ikke");
  });
});
