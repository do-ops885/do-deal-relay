import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    retry: 1, // Retry flaky tests once
    teardownTimeout: 10000, // Give workers time to cleanup (increased from 5000)
    pool: "forks", // Use Node.js fork pool instead of Cloudflare Workers pool to avoid crashes
    maxWorkers: 1, // Single worker to prevent pool crashes
    env: {
      NODE_ENV: "test",
    },
    exclude: [
      "**/node_modules/**",
      "**/tests/browser/**", // Playwright browser tests
      "**/tests/e2e/**", // Playwright E2E tests
      "**/dist/**",
      "**/.wrangler/**",
    ],
  },
});
