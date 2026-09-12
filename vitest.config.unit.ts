import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Unit tests run on plain Node where the Workers runtime specifier
    // does not resolve; map it to a behavior-free stub (fixtures only).
    alias: [
      {
        find: "cloudflare:workers",
        replacement: new URL(
          "./tests/fixtures/cloudflare-workers-stub.ts",
          import.meta.url,
        ).pathname,
      },
    ],
  },
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
