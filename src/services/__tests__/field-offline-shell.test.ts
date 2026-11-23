import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFieldOfflineShell } from "../field-offline-shell";

afterEach(() => vi.unstubAllGlobals());
describe("offline cache compatibility", () => {
  it.each([
    [{ ready: true }, false],
    [{ ready: true, queueVersions: [1] }, false],
    [{ ready: true, queueVersions: [1, 2] }, true],
    [{ ready: true, queueVersions: [2, 3] }, true],
    [{ ready: true, queueVersions: ["2"] }, false],
    [{ ready: false, queueVersions: [1, 2] }, false],
  ])("requires a complete cache that can read the queue: %j", async (status, expected) => {
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: async () => ({
          active: {
            scriptURL: "https://field.example/field-sw.js",
            postMessage: (_message: unknown, ports: MessagePort[]) => {
              ports[0].postMessage(status);
              ports[0].close();
            },
          },
        }),
      },
    });
    expect(await checkFieldOfflineShell()).toBe(expected);
  });
});
