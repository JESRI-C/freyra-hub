import { describe, it, expect } from "vitest";
import { resolveProjectSelection as resolve } from "./project-selection";
const orgs = [
  {
    id: "a",
    projects: [
      { id: "p1", slug: "stream" },
      { id: "p2", slug: "lake" },
    ],
  },
  { id: "b", projects: [{ id: "p3", slug: "forest" }] },
];
describe("authorized project context", () => {
  it("rejects an empty URL selection rather than hanging", () =>
    expect(resolve(orgs, "a", "p1", "").invalid).toBe(true));
  it("does not silently select the first project", () =>
    expect(resolve(orgs, "a", null).projectId).toBeNull());
  it("rejects a URL id from another organization", () =>
    expect(resolve(orgs, "a", "p1", "p3")).toMatchObject({ projectId: null, invalid: true }));
  it("clears a previous project after switching organization", () =>
    expect(resolve(orgs, "b", "p1").projectId).toBeNull());
  it("synchronizes a route to its authorized organization and project", () =>
    expect(resolve(orgs, "a", "p1", undefined, "forest")).toEqual({
      orgId: "b",
      projectId: "p3",
      invalid: false,
    }));
  it("does not replace an unknown route with the selected project", () =>
    expect(resolve(orgs, "a", "p1", undefined, "missing").invalid).toBe(true));
  it("rejects ambiguous slugs", () =>
    expect(
      resolve(
        [...orgs, { id: "c", projects: [{ id: "p4", slug: "stream" }] }],
        "a",
        "p1",
        undefined,
        "stream",
      ).invalid,
    ).toBe(true));
  it("accepts an explicit authorized URL selection", () =>
    expect(resolve(orgs, "a", "p1", "p2").projectId).toBe("p2"));
});
