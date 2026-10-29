import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
const worker = readFileSync(new URL("./field-offline-worker.js", import.meta.url), "utf8");
export function fieldOfflineBuildPlugin() {
  return {
    name: "freyra-field-offline-assets",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const fonts = readdirSync(new URL("../public/fonts/", import.meta.url))
        .filter((name) => /^[a-zA-Z0-9._-]+\.woff2$/.test(name))
        .map((name) => "/fonts/" + name);
      const assets = [
        ...Object.keys(bundle)
          .filter((name) => /\.(js|css|woff2)$/.test(name) && name.startsWith("assets/"))
          .map((name) => "/" + name),
        ...fonts,
        "/favicon.svg",
      ].sort();
      if (!assets.length) throw new Error("Offline assets missing");
      const hash = createHash("sha256").update(worker).update(JSON.stringify(assets));
      for (const font of fonts)
        hash.update(readFileSync(new URL("../public" + font, import.meta.url)));
      const revision = hash.digest("hex").slice(0, 24);
      const manifest = { schema: "freyra.field-offline-assets/v1", revision, assets };
      this.emitFile({
        type: "asset",
        fileName: "field-offline-manifest.json",
        source: JSON.stringify(manifest),
      });
      this.emitFile({
        type: "asset",
        fileName: "field-sw.js",
        source: worker.replace(
          "const manifest = __FREYRA_FIELD_PRECACHE__;",
          "const manifest = " + JSON.stringify(manifest) + ";",
        ),
      });
    },
  };
}
