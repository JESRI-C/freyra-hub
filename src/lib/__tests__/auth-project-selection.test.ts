import { describe, expect, it } from "vitest";
import { findAuthorizedProjectSelection } from "@/lib/auth-project-selection";

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
});
