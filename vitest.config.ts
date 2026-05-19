import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    retry: 1, // Retry flaky tests once
    teardownTimeout: 10000, // Give workers time to cleanup (increased from 5000)
    pool: "forks", // Use Node.js fork pool instead of Cloudflare Workers pool to avoid crashes
    forks: {
      maxForks: 2,
    },
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
    coverage: {
      provider: "v8",
      include: ["worker/**/*.ts"],
      exclude: [
        "worker/**/*.test.ts",
        "worker/**/*.d.ts",
        "worker/index.ts", // entry point, covered by E2E
      ],
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
