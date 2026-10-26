import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Unit tests must never load the repository's real backend credentials.
  envDir: false,
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
    "import.meta.env.VITE_SUPABASE_ANON_KEY": '""',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/offline.ts"],
  },
});
