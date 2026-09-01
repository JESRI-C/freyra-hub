import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  clearQueryCacheForAuthTransition,
  clearQueryCacheForLogout,
  type AuthUserId,
} from "@/lib/auth-query-cache";

describe("auth-scoped React Query cache", () => {
  it("clears cached tenant data on an actual account switch", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["projects"], [{ id: "project-a" }]);

    expect(clearQueryCacheForAuthTransition(queryClient, "user-a", "user-b")).toBe(true);
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });

  it("clears cached tenant data when an authenticated session becomes anonymous", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["all-reports"], [{ id: "report-a" }]);

    expect(clearQueryCacheForAuthTransition(queryClient, "user-a", null)).toBe(true);
    expect(queryClient.getQueryData(["all-reports"])).toBeUndefined();
  });

  it("clears anonymous-session cache when a user signs in after hydration", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["projects"], [{ id: "anonymous-preview" }]);

    expect(clearQueryCacheForAuthTransition(queryClient, null, "user-a")).toBe(true);
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });

  it("does not clear during initial hydration or same-user token refresh", () => {
    const queryClient = new QueryClient();
    let activeUserId: AuthUserId = undefined;

    queryClient.setQueryData(["projects"], [{ id: "project-a" }]);
    expect(clearQueryCacheForAuthTransition(queryClient, activeUserId, "user-a")).toBe(false);
    activeUserId = "user-a";
    expect(clearQueryCacheForAuthTransition(queryClient, activeUserId, "user-a")).toBe(false);
    expect(queryClient.getQueryData(["projects"])).toEqual([{ id: "project-a" }]);
  });

  it("always clears the cache when logout is explicitly requested", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["all-data-sources"], [{ id: "source-a" }]);

    clearQueryCacheForLogout(queryClient);

    expect(queryClient.getQueryData(["all-data-sources"])).toBeUndefined();
  });
});
