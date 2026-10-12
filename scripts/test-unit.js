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
import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const TIMEOUT_MS = 300_000; // 5 minutes

const args = process.argv.slice(2);
const extraArgs =
  args.length > 0
    ? " " + args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`).join(" ")
    : "";

try {
  execSync(`vitest run -c vitest.config.unit.ts${extraArgs}`, {
    stdio: "inherit",
    timeout: TIMEOUT_MS,
  });
} catch (e) {
  // execSync throws with { killed, signal, status } properties
  if (e.killed || e.signal === "SIGTERM") {
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
  process.exit(e.status ?? 1);
}
