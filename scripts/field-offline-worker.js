/* global __FREYRA_FIELD_PRECACHE__ */
// Build replaces this marker with public, hashed static asset paths. No credentials or API data.
const manifest = __FREYRA_FIELD_PRECACHE__;
const cacheName = "freyra-field-shell-" + manifest.revision;
const allowed = new Set(manifest.assets);
function validAsset(path, response) {
  const type = (response.headers.get("content-type") || "").toLowerCase();
  return (
    response.ok &&
    !response.redirected &&
    (/\.js$/.test(path)
      ? /(?:java|ecma)script/.test(type)
      : /\.css$/.test(path)
        ? type.includes("text/css")
        : /\.woff2$/.test(path)
          ? /font\/|application\/(?:font|octet-stream)/.test(type)
          : /\.svg$/.test(path) && type.includes("image/svg+xml"))
  );
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      const shell = await fetch(new Request("/felt", { credentials: "omit", cache: "reload" }));
      if (
        !shell.ok ||
        shell.redirected ||
        !shell.headers.get("content-type")?.includes("text/html")
      )
        throw new Error("Offline shell unavailable");
      await cache.put("/felt", shell);
      for (let offset = 0; offset < manifest.assets.length; offset += 6) {
        await Promise.all(
          manifest.assets.slice(offset, offset + 6).map(async (path) => {
            const response = await fetch(
              new Request(path, { credentials: "omit", cache: "reload" }),
            );
            if (!validAsset(path, response)) throw new Error("Offline asset unavailable");
            await cache.put(path, response);
          }),
        );
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("freyra-field-shell-") && key !== cacheName) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data === "FIELD_ACTIVATE_UPDATE") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data === "FIELD_OFFLINE_STATUS")
    event.waitUntil(
      (async () => {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        const paths = new Set(keys.map((key) => new URL(key.url).pathname));
        event.ports[0]?.postMessage({
          revision: manifest.revision,
          ready: paths.has("/felt") && manifest.assets.every((path) => paths.has(path)),
        });
      })(),
    );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && url.pathname === "/felt") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok) return response;
        } catch {
          /* use neutral shell */
        }
        return (await caches.open(cacheName)).match("/felt").then(
          (response) =>
            response ??
            new Response("Feltadgangen skal først klargøres med netforbindelse.", {
              status: 503,
            }),
        );
      })(),
    );
  } else if (allowed.has(url.pathname) && !url.search) {
    event.respondWith(
      (async () =>
        (await (await caches.open(cacheName)).match(url.pathname)) ?? fetch(event.request))(),
    );
  }
});
