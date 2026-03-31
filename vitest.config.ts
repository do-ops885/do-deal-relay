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
  },
});
