// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { municipalBuildMetadataPlugin } from "./scripts/municipal-build-metadata.mjs";

// The MCP plugin generates development routes. Its current path-containment
// check mixes slash styles on Windows, where the generated routes already live
// in source control, so keep it to non-Windows development servers.
const mcpDevPlugin = mcpPlugin();
mcpDevPlugin.apply = "serve";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    // This runtime module is supplied by Workers. Keep it external only in the
    // intermediate server bundle; Nitro's Cloudflare preset handles the final
    // Worker bundle, and the client must retain its server-only import checks.
    environments: {
      // Workers uses modern V8. Avoid a second browser-target pass in the final
      // staging server bundle; client and intermediate SSR targets stay unchanged.
      ...(process.env.CLOUDFLARE_ENV === "staging"
        ? { nitro: { build: { target: "esnext", minify: false as const } } }
        : {}),
      ssr: {
        build: { rollupOptions: { external: ["cloudflare:workers"] } },
      },
    },
    // This checkout can live below an older dashboard. Its PostCSS/Tailwind
    // configuration must not be inherited from the parent project.
    css: { postcss: { plugins: [] } },
    optimizeDeps: {
      include: ["leaflet"],
    },
    plugins: [
      municipalBuildMetadataPlugin(),
      ...(process.platform === "win32" ? [] : [mcpDevPlugin]),
    ],
  },
});
