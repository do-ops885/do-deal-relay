import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "@cloudflare/vitest-pool-workers",
    globals: true,
    testTimeout: 20000,
    env: {
      NODE_ENV: "test",
    },
    include: ["tests/integration/**/*.test.ts", "tests/load/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.wrangler/**"],
    coverage: {
      provider: "v8",
      include: ["worker/**/*.ts"],
      exclude: ["worker/**/*.test.ts", "worker/**/*.d.ts", "worker/index.ts"],
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
