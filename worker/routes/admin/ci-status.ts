/**
 * Admin API Routes - CI Workflow Status
 *
 * GET /api/admin/ci-status — GitHub Actions summary for the repository
 * configured through `GITHUB_REPO`. This wires `worker/lib/github/workflows.ts`,
 * which shipped complete (runs, summary, wait) but had no production caller
 * until the missing-wiring sweep (2026-10-13).
 *
 * Query params:
 *   branch    branch to inspect (default: main)
 *   runs      recent runs to include, 1-20 (default: 10)
 *   wait      1 to poll until the matching runs complete
 *   commit    commit SHA to wait on when wait=1
 *   attempts  poll attempts when wait=1, 1-5 (default: 3)
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { getGitHubLogger } from "../../lib/github/core";
import {
  getWorkflowRuns,
  getWorkflowStatusSummary,
  waitForWorkflowsComplete,
} from "../../lib/github/workflows";

const BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,100}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;
const DEFAULT_RUNS = 10;
const MAX_RUNS = 20;
const DEFAULT_WAIT_ATTEMPTS = 3;
const MAX_WAIT_ATTEMPTS = 5;
const WAIT_POLL_INTERVAL_MS = 2000;

function clampInt(raw: string | null, fallback: number, max: number): number {
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

/**
 * GET /api/admin/ci-status — read-only GitHub Actions status for the repo.
 *
 * Returns 503 when the repo or token configuration is missing so operators
 * get an actionable error instead of a generic upstream failure.
 */
export async function handleCiStatus(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const repo = env.GITHUB_REPO;
  if (!repo) {
    return jsonResponse(
      {
        error: "GITHUB_REPO not configured",
        code: "GITHUB_REPO_NOT_CONFIGURED",
      },
      503,
      request,
      env,
    );
  }
  if (!env.GITHUB_TOKEN) {
    return jsonResponse(
      {
        error: "GITHUB_TOKEN not configured",
        code: "GITHUB_TOKEN_NOT_CONFIGURED",
      },
      503,
      request,
      env,
    );
  }

  const branch = url.searchParams.get("branch") || "main";
  if (!BRANCH_PATTERN.test(branch)) {
    return jsonResponse(
      { error: "Invalid branch name", code: "INVALID_BRANCH" },
      400,
      request,
      env,
    );
  }

  const commit = url.searchParams.get("commit");
  if (commit !== null && !COMMIT_PATTERN.test(commit)) {
    return jsonResponse(
      { error: "Invalid commit SHA", code: "INVALID_COMMIT" },
      400,
      request,
      env,
    );
  }

  const runsLimit = clampInt(
    url.searchParams.get("runs"),
    DEFAULT_RUNS,
    MAX_RUNS,
  );
  const wait = url.searchParams.get("wait") === "1";

  try {
    if (wait) {
      const waited = await waitForWorkflowsComplete(repo, branch, {
        maxAttempts: clampInt(
          url.searchParams.get("attempts"),
          DEFAULT_WAIT_ATTEMPTS,
          MAX_WAIT_ATTEMPTS,
        ),
        pollIntervalMs: WAIT_POLL_INTERVAL_MS,
        ...(commit !== null ? { targetCommitSha: commit } : {}),
      });
      return jsonResponse(
        {
          repo,
          branch,
          wait: true,
          success: waited.success,
          attempts: waited.attempts,
          summary: waited.status,
        },
        200,
        request,
        env,
      );
    }

    const [summary, runs] = await Promise.all([
      getWorkflowStatusSummary(repo, branch),
      getWorkflowRuns(repo, branch, runsLimit),
    ]);
    return jsonResponse({ repo, branch, summary, runs }, 200, request, env);
  } catch (error) {
    getGitHubLogger(env).error(
      "Failed to read CI workflow status",
      error instanceof Error ? error : new Error(String(error)),
      { repo, branch },
    );
    return jsonResponse(
      {
        error: "Failed to read CI workflow status",
        code: "GITHUB_UNAVAILABLE",
      },
      502,
      request,
      env,
    );
  }
}
