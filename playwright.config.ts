import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for browser-based API testing
 * Tests the Deal Discovery System endpoints
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:8787",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Note: webServer is disabled by default to allow manual control or CI setup
  // to seed the environment before tests run.
  webServer: process.env.SKIP_DEV_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:8787/health/live",
        reuseExistingServer: true,
        timeout: 120000,
      },
});
