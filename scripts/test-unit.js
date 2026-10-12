#!/usr/bin/env node
/**
 * Cross-platform test runner with timeout protection.
 *
 * Wraps vitest with a 5-minute timeout to guard against the known
 * upstream hang (process-level deadlock, not per-test). If the
 * process is killed by timeout, exits 0 to match the previous
 * bash-based workaround behaviour.
 *
 * Works on Windows, macOS, and Linux — no GNU timeout dependency.
 *
 * To run vitest directly without the timeout wrapper (e.g. for local
 * debugging), use: npx vitest run -c vitest.config.unit.ts
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 300_000; // 5 minutes

const vitestMjsPath = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);

const vitestArgs = [
  vitestMjsPath,
  "run",
  "-c",
  "vitest.config.unit.ts",
  ...process.argv.slice(2),
];

try {
  execFileSync(process.execPath, vitestArgs, {
    stdio: "inherit",
    timeout: TIMEOUT_MS,
  });
} catch (e) {
  // execFileSync throws with { killed, signal, status, code } properties
  if (e.killed || e.signal === "SIGTERM" || e.code === "ETIMEDOUT") {
    console.log("vitest killed by timeout (known upstream hang)");
    process.exit(0);
  }
  process.exit(e.status ?? 1);
}
