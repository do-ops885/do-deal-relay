#!/usr/bin/env node
/**
 * Cross-platform test runner with timeout protection.
 *
 * Wraps vitest with a 5-minute timeout to guard against the known
 * upstream hang (process-level deadlock, not per-test). If the
 * process is killed by timeout, logs an error, appends a notice to
 * GITHUB_STEP_SUMMARY if present, and exits with a non-zero code.
 *
 * Works on Windows, macOS, and Linux — no GNU timeout dependency.
 *
 * To run vitest directly without the timeout wrapper (e.g. for local
 * debugging), use: npx vitest run -c vitest.config.unit.ts
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const TIMEOUT_MS = 300_000; // 5 minutes

const args = process.argv.slice(2);
const result = spawnSync(
  "vitest",
  ["run", "-c", "vitest.config.unit.ts", ...args],
  {
    stdio: "inherit",
    timeout: TIMEOUT_MS,
  },
);

if (result.error) {
  // spawnSync reports timeout via error with code ETIMEDOUT and signal SIGTERM
  if (result.error.code === "ETIMEDOUT" || result.signal === "SIGTERM") {
    const errorMsg = "vitest killed by timeout (known upstream hang)";
    console.error(errorMsg);

    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        const summaryMsg = `### ❌ Unit Tests Failed\n\n**Error:** ${errorMsg}\n`;
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMsg, "utf8");
      } catch (summaryErr) {
        console.error("Failed to write to GITHUB_STEP_SUMMARY:", summaryErr);
      }
    }

    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);
