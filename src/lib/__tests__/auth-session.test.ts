// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ onAuthStateChange: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: mocks.onAuthStateChange }, from: mocks.from },
}));
import { AuthProvider, useAuth } from "../auth";

let listener: (event: AuthChangeEvent, session: Session | null) => void;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const mounted = vi.fn();
const unmounted = vi.fn();

function sessionFor(id: string, accessToken = "test-token"): Session {
  return {
    user: { id, email: `${id}@example.invalid`, user_metadata: {} },
    access_token: accessToken,
  } as Session;
}

function Editor() {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    mounted();
    return unmounted;
  }, []);
  return createElement(
    "button",
    { onClick: () => setDraft("Unsaved report") },
    draft || "Edit report",
  );
}

function Workspace() {
  const auth = useAuth();
  return auth.loading || !auth.user ? null : createElement(Editor);
}

async function emit(event: AuthChangeEvent, session: Session | null) {
  // Flush the event separately from the deferred queries, as the browser does.
  act(() => listener(event, session));
  await act(async () => {
    // AuthProvider deliberately defers its queries outside the auth lock.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("mounted workspace across auth events", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    localStorage.clear();
    mocks.onAuthStateChange.mockImplementation((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.from.mockImplementation((table: string) => {
      const result = { data: table === "profiles" ? null : [], error: null };
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({
          ...result,
          maybeSingle: vi.fn().mockResolvedValue(result),
        }),
      };
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient();
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(AuthProvider, null, createElement(Workspace)),
        ),
      );
    });
    expect(host.textContent).toBe("");
    await emit("INITIAL_SESSION", sessionFor("user-a"));
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).toBe("Unsaved report");
    client.setQueryData(["private-report"], "user-a data");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    vi.unstubAllGlobals();
  });

  it.each(["TOKEN_REFRESHED", "SIGNED_IN", "USER_UPDATED"] as AuthChangeEvent[])(
    "%s for the same user preserves drafts and cached work",
    async (event) => {
      await emit(event, sessionFor("user-a", "new-token"));
      expect(host.textContent).toBe("Unsaved report");
      expect(mounted).toHaveBeenCalledTimes(1);
      expect(unmounted).not.toHaveBeenCalled();
      expect(client.getQueryData(["private-report"])).toBe("user-a data");
    },
  );

  it("switching users unmounts old work and clears private cache", async () => {
    await emit("SIGNED_IN", sessionFor("user-b"));
    expect(host.textContent).toBe("Edit report");
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["private-report"])).toBeUndefined();
  });

  it("signing out removes the workspace and private cache", async () => {
    await emit("SIGNED_OUT", null);
    expect(host.textContent).toBe("");
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["private-report"])).toBeUndefined();
  });
});
