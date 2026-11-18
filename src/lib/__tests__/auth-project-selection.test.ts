import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findAuthorizedProjectSelection } from "@/lib/auth-project-selection";

const authProviderSource = readFileSync(resolve(process.cwd(), "src/lib/auth.tsx"), "utf8");

const ORGANIZATIONS = [
  { id: "org-a", projects: [{ id: "project-a" }] },
  { id: "org-b", projects: [{ id: "project-b" }] },
];

describe("findAuthorizedProjectSelection", () => {
  it("selects the organization that contains the freshly authorized project", () => {
    expect(findAuthorizedProjectSelection(ORGANIZATIONS, "project-b")).toEqual({
      orgId: "org-b",
      projectId: "project-b",
    });
  });

  it("does not select a project absent from the refreshed tenant data", () => {
    expect(findAuthorizedProjectSelection(ORGANIZATIONS, "other-project")).toBeNull();
  });

  it("atomically switches to the authorized project's organization", () => {
    expect(authProviderSource).toContain(
      "const selection = findAuthorizedProjectSelection(organizations, id);",
    );
    expect(authProviderSource).toContain("setOrgId(selection.orgId);");
    expect(authProviderSource).toContain("setProjectId(selection.projectId);");
    expect(authProviderSource).not.toContain(
      "if (!currentOrg?.projects.some((project) => project.id === id)) return;",
    );
  });
});
