import { defineConfig } from "vitest/config";

// Eval harness config (IMP-5): golden-case suites live outside the unit
// test run so `npm run test:unit` stays hermetic; run via `npm run test:evals`.
export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
    pool: "threads",
    include: ["tests/evals/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.wrangler/**"],
  },
});
