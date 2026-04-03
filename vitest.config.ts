import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    retry: 1, // Retry flaky tests once
    teardownTimeout: 5000, // Give workers time to cleanup
    pool: "forks", // Use Node.js fork pool instead of Cloudflare Workers pool to avoid crashes
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
