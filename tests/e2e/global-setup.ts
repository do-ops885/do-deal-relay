import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Playwright global setup
 * Seeds local KV with test API keys before E2E tests run.
 */
export default async function globalSetup() {
  const root = resolve(__dirname, "../..");

  // Ensure .dev.vars exists
  if (!existsSync(resolve(root, ".dev.vars"))) {
    console.log("Creating .dev.vars from .dev.vars.example...");
    const example = existsSync(resolve(root, ".dev.vars.example"))
      ? "WEBHOOK_SECRET=e2e-test-webhook-secret-do-not-use-in-prod\nEMAIL_WEBHOOK_SECRET=e2e-test-email-webhook-secret-do-not-use-in-prod\nAPI_ENCRYPTION_KEY=e2e-test-encryption-key-32-chars-ok\n"
      : "";
    writeFileSync(resolve(root, ".dev.vars"), example);
  }

  // Seed KV with test API keys
  console.log("Seeding E2E test API keys...");
  execSync("bash tests/e2e/setup-auth.sh", { cwd: root, stdio: "inherit" });
  console.log("✓ E2E global setup complete");
}
