import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
    teardownTimeout: 5000,
    pool: "threads",
    env: {
      NODE_ENV: "test",
    },
    include: ["tests/unit/**/*.test.ts", "worker/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.wrangler/**"],
    coverage: {
      provider: "v8",
      include: ["worker/**/*.ts"],
      exclude: ["worker/**/*.test.ts", "worker/**/*.d.ts", "worker/index.ts"],
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage-unit",
    },
  },
});
