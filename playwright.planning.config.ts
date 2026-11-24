import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "customer-pages-local.spec.ts",
    "customers-local.spec.ts",
    "planning-local.spec.ts",
    "workflow-local.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: "tmp/planning-e2e/playwright",
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4179",
    viewport: { width: 1440, height: 1000 },
    locale: "da-DK",
    timezoneId: "Europe/Copenhagen",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
