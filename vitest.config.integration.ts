import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
  test: {
    globals: true,
    testTimeout: 20000,
    env: {
      NODE_ENV: "test",
    },
    include: ["tests/integration/**/*.test.ts", "tests/load/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.wrangler/**"],
    coverage: {
      provider: "istanbul",
      include: ["worker/**/*.ts"],
      exclude: ["worker/**/*.test.ts", "worker/**/*.d.ts", "worker/index.ts"],
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
