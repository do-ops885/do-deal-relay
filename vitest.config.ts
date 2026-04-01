import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "miniflare",
    environmentOptions: {
      modules: true,
      scriptPath: "./worker/index.ts",
      compatibilityDate: "2024-03-20",
    },
    testTimeout: 15000, // Increased to accommodate retry delays (1+2+4=7s)
  },
});
