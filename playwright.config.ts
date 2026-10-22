import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  expect: { timeout: 60_000 },
  outputDir: "tmp/playwright-results",
  reporter: [["list"], ["html", { outputFolder: "tmp/playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.HADERSLEV_E2E_BASE_URL ?? "http://localhost:8787",
    ...devices["Desktop Chrome"],
    trace: "off", // Traces can contain private originals and bearer tokens.
    screenshot: "only-on-failure",
    actionTimeout: 60_000,
  },
});
