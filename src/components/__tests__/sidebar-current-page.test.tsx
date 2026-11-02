// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "../AppSidebar";
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ currentOrg: { name: "Testorganisation" }, currentProject: null }),
}));

describe("current main menu item through the real router", () => {
  it.each([
    ["/app/connect/map", "/app/connect/map"],
    ["/app/connect/registry?source=test", "/app/connect/registry"],
    ["/app/connect/live", "/app/connect"],
    ["/app/settings/users", "/app/settings/users"],
    ["/app/settings/security", "/app/settings"],
    ["/app/projects/project-id?tab=handlinger", "/app/projects"],
  ])("marks only %s's intended menu item", async (path, expected) => {
    const rootRoute = createRootRoute({ component: AppSidebar });
    const route = createRoute({ getParentRoute: () => rootRoute, path: "$" });
    const router = createRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        await router.load();
        root.render(<RouterProvider router={router} />);
      });
      const active = host.querySelectorAll('nav[aria-label="Hovedmenu"] a[aria-current="page"]');
      expect(active).toHaveLength(1);
      expect(active[0].getAttribute("href")).toBe(expected);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
