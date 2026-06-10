import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    retry: 1, // Retry flaky tests once
    teardownTimeout: 10000, // Give workers time to cleanup (increased from 5000)
    pool: "forks", // Use Node.js fork pool instead of Cloudflare Workers pool to avoid crashes
    // @ts-expect-error - Vitest 4 pool options
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
      // Skill scaffolding templates are copied into new projects, not run here
      "**/.agents/skills/**/templates/**",
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
        lines: 59,
        functions: 60,
        branches: 50,
        statements: 59,
      },
    },
  },
});
