import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for browser-based API testing
 * Tests the Deal Discovery System endpoints
 *
 * Required env vars for local E2E:
 *   - Copy .dev.vars.example → .dev.vars for worker config validation
 *   - Or set WEBHOOK_SECRET, EMAIL_WEBHOOK_SECRET, API_ENCRYPTION_KEY
 */

// Allowlist of required env var NAMES (values are never inspected or logged).
// See .dev.vars.example for what each one is.
const REQUIRED_ENV_VARS = [
  "WEBHOOK_SECRET",
  "EMAIL_WEBHOOK_SECRET",
  "API_ENCRYPTION_KEY",
] as const;

// Presence-only check; values are never compared, returned, or logged.
function getMissingEnvVars(): readonly string[] {
  const missing: string[] = [];
  if (
    process.env.WEBHOOK_SECRET === undefined ||
    process.env.WEBHOOK_SECRET.trim() === ""
  )
    missing.push("WEBHOOK_SECRET");
  if (
    process.env.EMAIL_WEBHOOK_SECRET === undefined ||
    process.env.EMAIL_WEBHOOK_SECRET.trim() === ""
  )
    missing.push("EMAIL_WEBHOOK_SECRET");
  if (
    process.env.API_ENCRYPTION_KEY === undefined ||
    process.env.API_ENCRYPTION_KEY.trim() === ""
  )
    missing.push("API_ENCRYPTION_KEY");
  return missing;
}

const missing = getMissingEnvVars();
if (missing.length > 0) {
  const names = missing.join(", ");
  console.error(
    `\n  ❌ Missing required environment variables:\n` +
      `     ${missing.map((n) => `- ${n}`).join("\n     ")}\n` +
      `  → Copy .dev.vars.example to .dev.vars and populate them.\n`,
  );
  if (process.env.CI !== undefined) {
    // Fail fast in CI: missing env vars is a configuration error.
    throw new Error(`Missing required env vars: ${names}`);
  }
}

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
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
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-browser",
      testDir: "./tests/browser",
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
