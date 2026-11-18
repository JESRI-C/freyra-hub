import { describe, expect, it } from "vitest";
import { resolveLoginDestination, safeLoginNext } from "@/lib/login-flow";

describe("login flow", () => {
  it("waits for the hydrated user before leaving the login page", () => {
    expect(resolveLoginDestination({ loading: true, hasUser: true, next: undefined })).toBeNull();
    expect(resolveLoginDestination({ loading: false, hasUser: false, next: undefined })).toBeNull();
    expect(resolveLoginDestination({ loading: false, hasUser: true, next: undefined })).toBe(
      "/select",
    );
  });

  it("preserves safe same-origin destinations after hydration", () => {
    expect(resolveLoginDestination({ loading: false, hasUser: true, next: "/app/overview" })).toBe(
      "/app/overview",
    );
  });

  it("rejects absolute and protocol-relative redirects", () => {
    expect(safeLoginNext("https://example.com")).toBeNull();
    expect(safeLoginNext("//example.com")).toBeNull();
    expect(safeLoginNext("/\\example.com")).toBeNull();
  });
});
