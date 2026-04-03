import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.toml",
      },
      miniflare: {
        modules: true,
        compatibilityDate: "2024-03-20",
      },
    }),
  ],
  test: {
    globals: true,
    testTimeout: 15000,
    retry: 1, // Retry flaky tests once
    teardownTimeout: 5000, // Give workers time to cleanup
  },
});
