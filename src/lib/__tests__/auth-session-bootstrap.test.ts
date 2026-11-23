import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeferredLatestTask, shouldBootstrapAuthSession } from "@/lib/auth-session-bootstrap";

afterEach(() => {
  vi.useRealTimers();
});

describe("createDeferredLatestTask", () => {
  it("defers bootstrap work until after the auth callback returns", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const pending: boolean[] = [];
    const task = createDeferredLatestTask({
      run,
      onPendingChange: (value) => pending.push(value),
    });

    task.schedule("signed-in");

    expect(run).not.toHaveBeenCalled();
    expect(pending).toEqual([true]);

    await vi.runAllTimersAsync();

    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith("signed-in", expect.any(Function));
    expect(pending).toEqual([true, false]);
  });

  it("runs only the latest auth state when events arrive together", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const task = createDeferredLatestTask({
      run,
      onPendingChange: vi.fn(),
    });

    task.schedule("initial-session");
    task.schedule("signed-in");
    await vi.runAllTimersAsync();

    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith("signed-in", expect.any(Function));
  });

  it("does not let a stale completion clear the latest pending state", async () => {
    vi.useFakeTimers();
    let resolveFirst: (() => void) | undefined;
    let firstIsCurrent: (() => boolean) | undefined;
    const pending: boolean[] = [];
    const run = vi.fn((value: string, isCurrent: () => boolean) => {
      if (value === "first") {
        firstIsCurrent = isCurrent;
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve();
    });
    const task = createDeferredLatestTask({
      run,
      onPendingChange: (value) => pending.push(value),
    });

    task.schedule("first");
    vi.runOnlyPendingTimers();
    await Promise.resolve();
    expect(run).toHaveBeenCalledWith("first", expect.any(Function));

    task.schedule("second");
    await vi.runAllTimersAsync();
    expect(pending.at(-1)).toBe(false);
    expect(firstIsCurrent?.()).toBe(false);

    const pendingCount = pending.length;
    resolveFirst?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(pending).toHaveLength(pendingCount);
  });

  it("cancels scheduled bootstrap work on unmount", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const pending = vi.fn();
    const task = createDeferredLatestTask({ run, onPendingChange: pending });

    task.schedule("signed-in");
    task.cancel();
    await vi.runAllTimersAsync();

    expect(run).not.toHaveBeenCalled();
    expect(pending).toHaveBeenCalledTimes(1);
    expect(pending).toHaveBeenCalledWith(true);
  });
});

describe("shouldBootstrapAuthSession", () => {
  it("bootstraps the initial session and identity changes", () => {
    expect(shouldBootstrapAuthSession(undefined, "user-a")).toBe(true);
    expect(shouldBootstrapAuthSession("user-a", "user-b")).toBe(true);
    expect(shouldBootstrapAuthSession("user-a", null)).toBe(true);
  });

  it("does not reload tenant data for repeated same-user events", () => {
    expect(shouldBootstrapAuthSession("user-a", "user-a")).toBe(false);
    expect(shouldBootstrapAuthSession(null, null)).toBe(false);
  });
});
