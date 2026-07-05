import { describe, it, expect } from "vitest";
import { roleAtLeast, permissionsFor, ROLE_LABELS } from "../project-members-service";

describe("roleAtLeast", () => {
  it("orders roles by rank", () => {
    expect(roleAtLeast("admin", "project_manager")).toBe(true);
    expect(roleAtLeast("project_manager", "editor")).toBe(true);
    expect(roleAtLeast("editor", "project_manager")).toBe(false);
    expect(roleAtLeast("viewer", "field")).toBe(false);
    expect(roleAtLeast("field", "viewer")).toBe(true);
  });
  it("returns false for null role", () => {
    expect(roleAtLeast(null, "viewer")).toBe(false);
    expect(roleAtLeast(undefined, "viewer")).toBe(false);
  });
});

describe("permissionsFor", () => {
  it("grants full access to admin", () => {
    const p = permissionsFor("admin");
    expect(p.canAdmin).toBe(true);
    expect(p.canManage).toBe(true);
    expect(p.canEdit).toBe(true);
    expect(p.canRecordField).toBe(true);
    expect(p.canView).toBe(true);
  });
  it("editor cannot manage or admin", () => {
    const p = permissionsFor("editor");
    expect(p.canAdmin).toBe(false);
    expect(p.canManage).toBe(false);
    expect(p.canEdit).toBe(true);
    expect(p.canRecordField).toBe(true);
  });
  it("viewer only views", () => {
    const p = permissionsFor("viewer");
    expect(p.canEdit).toBe(false);
    expect(p.canRecordField).toBe(false);
    expect(p.canView).toBe(true);
  });
  it("no role means no view", () => {
    expect(permissionsFor(null).canView).toBe(false);
  });
});

describe("ROLE_LABELS", () => {
  it("covers every role", () => {
    expect(ROLE_LABELS.admin).toBe("Administrator");
    expect(ROLE_LABELS.external).toBe("Ekstern");
  });
});
