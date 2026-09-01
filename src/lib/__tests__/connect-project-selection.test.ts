import { describe, expect, it } from "vitest";
import { findConnectProjectById, resolveConnectProject } from "@/lib/connect-project-selection";

const currentOrgProjects = [
  { id: "project-a", name: "A" },
  { id: "project-a-2", name: "A 2" },
] as const;

describe("Connect project selection", () => {
  it("never returns a forged project query parameter outside the current organisation", () => {
    const project = resolveConnectProject(currentOrgProjects, "project-b-forged", "project-a-2");

    expect(project).toBe(currentOrgProjects[1]);
    expect(project?.id).not.toBe("project-b-forged");
  });

  it("falls back only to a project from the current organisation", () => {
    const project = resolveConnectProject(
      currentOrgProjects,
      "project-b-forged",
      "project-b-persisted",
    );

    expect(project).toBe(currentOrgProjects[0]);
  });

  it("returns null and rejects setProject candidates when the current organisation has no match", () => {
    expect(resolveConnectProject([], "project-b-forged", "project-b-persisted")).toBeNull();
    expect(findConnectProjectById(currentOrgProjects, "project-b-forged")).toBeNull();
  });

  it("accepts a requested project only when it belongs to the current organisation", () => {
    expect(findConnectProjectById(currentOrgProjects, "project-a-2")).toBe(currentOrgProjects[1]);
  });
});
