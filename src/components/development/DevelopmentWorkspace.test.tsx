// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevelopmentWorkspace } from "./DevelopmentWorkspace";

const auth = vi.hoisted(() => ({
  currentOrg: { role: "owner" } as { role?: string } | null,
  loading: false,
  refreshing: false,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
let host: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
async function render() {
  if (auth.currentOrg?.role === "owner" || auth.currentOrg?.role === "admin")
    await import("./SkyhostDevelopmentBoard");
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => {
    root.render(<DevelopmentWorkspace />);
  });
}
async function ready() {
  for (let attempt = 0; attempt < 20 && host.querySelectorAll("article").length === 0; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  expect(host.querySelectorAll("article")).toHaveLength(42);
}
async function change(selector: string, value: string) {
  const node = host.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  host = undefined!;
  root = undefined!;
  auth.currentOrg = { role: "owner" };
  auth.loading = false;
  auth.refreshing = false;
});

describe("Development workspace", () => {
  it.each(["member", "viewer", "editor", undefined])(
    "does not show the product register for role %s",
    async (role) => {
      auth.currentOrg = { role };
      await render();
      expect(host.querySelectorAll("article")).toHaveLength(0);
      expect(host.textContent).toMatch(/ejer og administrator/);
    },
  );
  it("withholds the board while membership is refreshing and removes it after a role change", async () => {
    await render();
    await ready();
    auth.refreshing = true;
    await render();
    expect(host.querySelectorAll("article")).toHaveLength(0);
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/Kontrollerer adgang/);
    auth.currentOrg = { role: "member" };
    auth.refreshing = false;
    await render();
    expect(host.querySelectorAll("article")).toHaveLength(0);
  });
  it("lets an administrator combine filters and inspect acceptance without claiming completed features", async () => {
    auth.currentOrg = { role: "admin" };
    await render();
    await ready();
    await change('input[type="search"]', "F-040");
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(host.querySelector("article")?.textContent).toMatch(/Registrér en pris/);
    expect(host.querySelectorAll('section[aria-label="Implementering"] article')).toHaveLength(1);
    await change("select", "GPS");
    expect(host.querySelectorAll("article")).toHaveLength(0);
    await change('input[type="search"]', "");
    expect(host.querySelectorAll("article").length).toBeGreaterThan(0);
    await change("label:nth-child(3) select", "done");
    expect(host.querySelectorAll("article")).toHaveLength(0);
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(
      /0 med afsluttet samlet accept/,
    );
  });
  it("links feature cards to private evidence notices without publishing internal records", async () => {
    await render();
    await ready();
    const links = [...host.querySelectorAll<HTMLAnchorElement>('article a[href^="#acceptance-"]')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const target = host.querySelector(link.getAttribute("href")!);
      expect(target).not.toBeNull();
      expect(target?.querySelector("pre")?.textContent).toContain('"private": true');
    }
    expect(host.querySelector('[aria-label="Dokumenterede delprøver"]')?.textContent).toMatch(
      /fysisk telefon afventer/,
    );
    expect(host.querySelector("#acceptance-offline-restart pre")?.textContent).toContain(
      '"private": true',
    );
  });
});
