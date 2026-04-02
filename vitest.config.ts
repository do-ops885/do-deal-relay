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
    testTimeout: 15000, // Increased to accommodate retry delays (1+2+4=7s)
  },
});
