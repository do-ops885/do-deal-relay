import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const JWT_TOKEN_PATH = resolve(__dirname, ".jwt-token");

/**
 * Playwright global setup
 * Seeds local KV with test API keys and obtains a JWT token before E2E tests run.
 */
export default async function globalSetup() {
  const root = resolve(__dirname, "../..");

  // Ensure .dev.vars exists
  if (!existsSync(resolve(root, ".dev.vars"))) {
    console.log("Creating .dev.vars from .dev.vars.example...");
    const example = existsSync(resolve(root, ".dev.vars.example"))
      ? "WEBHOOK_SECRET=e2e-test-webhook-secret-do-not-use-in-prod\nEMAIL_WEBHOOK_SECRET=e2e-test-email-webhook-secret-do-not-use-in-prod\nAPI_ENCRYPTION_KEY=e2e-test-encryption-key-32-chars-ok\nJWT_SECRET=e2e-test-jwt-secret-do-not-use-in-prod\n"
      : "";
    writeFileSync(resolve(root, ".dev.vars"), example);
  }

  // Seed KV with test API keys and obtain JWT token.
  // Prefer the deterministic local JWT mint; fall back to the bash setup
  // script (which can spin up a temporary wrangler dev server) if needed.
  console.log("Seeding E2E test API keys and obtaining JWT token...");
  try {
    execSync("node tests/e2e/generate-jwt.mjs", {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    console.warn("⚠ Local JWT mint failed — falling back to setup-auth.sh");
    execSync("bash tests/e2e/setup-auth.sh", { cwd: root, stdio: "inherit" });
  }

  // Read JWT token from file and expose as environment variable for tests
  if (existsSync(JWT_TOKEN_PATH)) {
    const token = readFileSync(JWT_TOKEN_PATH, "utf-8").trim();
    process.env.E2E_JWT_TOKEN = token;
    console.log("✓ E2E JWT token loaded into environment");
    // Clean up token file to prevent secrets from lingering on disk
    unlinkSync(JWT_TOKEN_PATH);
    console.log("✓ Cleaned up JWT token file");
  } else {
    console.warn(
      "⚠ No JWT token file found at tests/e2e/.jwt-token – JWT-based tests will be skipped",
    );
  }

  console.log("✓ E2E global setup complete");
}
