// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { resolve } from "node:path";

const mcp = mcpPlugin();
const resolveMcpConfig = mcp.configResolved;
if (process.platform === "win32" && typeof resolveMcpConfig === "function") {
  // Vite normalizes root to forward slashes, while MCP compares it to native
  // resolved paths. Normalize only its input, keeping its containment check.
  mcp.configResolved = function (config) {
    return resolveMcpConfig.call(this, { ...config, root: resolve(config.root) });
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    optimizeDeps: {
      include: ["leaflet"],
    },
    plugins: [mcp],
  },
});
