import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { fieldOfflineBuildPlugin } from "../../../scripts/field-offline-build.mjs";

const origin = "https://field.example";
const source = readFileSync(
  new URL("../../../scripts/field-offline-worker.js", import.meta.url),
  "utf8",
);
const assets = ["/assets/field-abcd.js", "/assets/app-abcd.css", "/fonts/local.woff2"];
function harness(badAsset = false) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const cacheMaps = new Map<string, Map<string, Response>>();
  const absolute = (value: string | Request) =>
    new URL(typeof value === "string" ? value : value.url, origin).href;
  const caches = {
    keys: async () => [...cacheMaps.keys()],
    delete: async (key: string) => cacheMaps.delete(key),
    open: async (key: string) => {
      const rows = cacheMaps.get(key) ?? new Map<string, Response>();
      cacheMaps.set(key, rows);
      return {
        put: async (key: string | Request, response: Response) => {
          rows.set(absolute(key), response.clone());
        },
        match: async (key: string | Request) => rows.get(absolute(key))?.clone(),
        keys: async () => [...rows.keys()].map((url) => new Request(url)),
      };
    },
  };
  const fetch = vi.fn(async (req: Request) => {
    const path = new URL(req.url).pathname;
    const type =
      path === "/felt" || (badAsset && path.endsWith(".js"))
        ? "text/html"
        : path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : "font/woff2";
    return new Response(
      path === "/felt" ? "<html>Neutral field shell</html>" : "public static bytes",
      { headers: { "content-type": type } },
    );
  });
  class RelativeRequest extends Request {
    constructor(input: string | Request, options?: RequestInit) {
      super(typeof input === "string" ? new URL(input, origin) : input, options);
    }
  }
  const claim = vi.fn(async () => {}),
    skipWaiting = vi.fn(async () => {});
  runInNewContext(
    source.replace(
      "const manifest = __FREYRA_FIELD_PRECACHE__;",
      `const manifest = ${JSON.stringify({ revision: "test", assets })};`,
    ),
    {
      URL,
      Request: RelativeRequest,
      Response,
      fetch,
      caches,
      self: {
        location: { origin },
        clients: { claim },
        skipWaiting,
        addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) =>
          handlers.set(type, handler),
      },
    },
  );
  async function dispatch(type: string, extra = {}) {
    let pending: Promise<unknown> | undefined;
    handlers.get(type)!({
      ...extra,
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
      respondWith: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    return pending;
  }
  return { caches, fetch, dispatch, claim };
}
describe("field shell cache", () => {
  it("generates public assets and replaces the executable marker", () => {
    const outputs: { fileName: string; source: string }[] = [];
    const plugin = fieldOfflineBuildPlugin();
    const generate = plugin.generateBundle as (
      this: unknown,
      options: unknown,
      bundle: unknown,
    ) => void;
    generate.call(
      {
        environment: { name: "client" },
        emitFile: (value: { fileName: string; source: string }) => outputs.push(value),
      },
      {},
      { "assets/test-123.js": {}, "assets/test-123.css": {}, "secret.map": {} },
    );
    const manifest = JSON.parse(
      outputs.find((o) => o.fileName === "field-offline-manifest.json")!.source,
    );
    expect(manifest.assets).toContain("/assets/test-123.js");
    expect(manifest.assets).not.toContain("/secret.map");
    expect(outputs.find((o) => o.fileName === "field-sw.js")!.source).not.toContain(
      "const manifest = __FREYRA_FIELD_PRECACHE__;",
    );
  });
  it("stores a neutral shell without credentials and serves it after a network failure", async () => {
    const h = harness();
    await h.dispatch("install");
    expect(h.fetch.mock.calls.every(([req]) => req.credentials === "omit")).toBe(true);
    h.fetch.mockRejectedValue(new TypeError("offline"));
    const response = (await h.dispatch("fetch", {
      request: { method: "GET", mode: "navigate", url: origin + "/felt?project=private-id" },
    })) as Response;
    expect(await response.text()).toBe("<html>Neutral field shell</html>");
    const status = vi.fn();
    await h.dispatch("message", { data: "FIELD_OFFLINE_STATUS", ports: [{ postMessage: status }] });
    expect(status).toHaveBeenCalledWith({ revision: "test", ready: true });
  });
  it("never intercepts APIs, storage links, mutations or foreign origins", async () => {
    const h = harness();
    for (const [method, url] of [
      ["GET", origin + "/api/private"],
      ["POST", origin + "/felt"],
      ["GET", "https://storage.example/original?token=private"],
      ["GET", origin + assets[0] + "?token=private"],
    ])
      expect(await h.dispatch("fetch", { request: { method, mode: "cors", url } })).toBeUndefined();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("does not report readiness when a static path returned fallback HTML", async () => {
    const h = harness(true);
    await expect(h.dispatch("install")).rejects.toThrow("Offline asset unavailable");
    const status = vi.fn();
    await h.dispatch("message", { data: "FIELD_OFFLINE_STATUS", ports: [{ postMessage: status }] });
    expect(status).toHaveBeenCalledWith({ revision: "test", ready: false });
  });
  it("removes only obsolete field caches on activation", async () => {
    const h = harness();
    await h.caches.open("unrelated-cache");
    await h.caches.open("freyra-field-shell-old");
    await h.dispatch("install");
    await h.dispatch("activate");
    expect(await h.caches.keys()).toEqual(["unrelated-cache", "freyra-field-shell-test"]);
    expect(h.claim).toHaveBeenCalledOnce();
  });
});
