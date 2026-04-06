import { CONFIG } from "../config";
import type { Snapshot, Env } from "../types";
import { CircuitBreaker, createGitHubCircuitBreaker } from "./circuit-breaker";
import { createGitHubCache } from "./cache";
import { createStructuredLogger } from "./logger";

// ============================================================================
// Types
// ============================================================================

interface GitHubCacheEnv {
  DEALS_PROD: KVNamespace;
}

// ============================================================================
// Safe JSON Response Parser
// Handles cases where response.json() might not be available (e.g., in tests)
// ============================================================================

async function safeResponseJson<T>(response: Response): Promise<T> {
  // Check if response.json is a function
  if (typeof response.json === "function") {
    return (await response.json()) as T;
  }

  // Fallback: try to read text and parse as JSON
  // Note: This is a fallback for test environments where response.json() might not be available.
  // In production, GitHub API responses are typically small (<1MB) for the endpoints we use.
  if (typeof response.text === "function") {
    const text = await response.text();
    return JSON.parse(text) as T;
  }

  // Last resort: try to access the response body directly
  throw new Error("Response does not have json() or text() methods");
}

// ============================================================================
// GitHub API Integration with Caching
// ============================================================================

interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
}

interface GitHubContent {
  content: string;
  sha: string;
}

// Store token for the session (set by worker/index.ts)
let githubToken: string | undefined;
let githubCircuitBreaker: CircuitBreaker | undefined;
let githubCache: ReturnType<typeof createGitHubCache> | undefined;

// ============================================================================
// Logger Helper
// ============================================================================

function getGitHubLogger(env?: Env) {
  // Create a minimal env object for logger since we don't have full Env here
  const loggerEnv = env || ({
    DEALS_LOG: {
      put: async () => {},
      get: async () => null,
    } as unknown as KVNamespace,
    DEALS_PROD: {} as KVNamespace,
    DEALS_STAGING: {} as KVNamespace,
    DEALS_SOURCES: {} as KVNamespace,
    GITHUB_TOKEN: githubToken || "",
  } as Env);
  return createStructuredLogger(loggerEnv, "github", `gh-${Date.now()}`);
}

/**
 * Initialize GitHub circuit breaker and cache
 */
export function initGitHubCircuitBreaker(env?: GitHubCacheEnv): void {
  githubCircuitBreaker = createGitHubCircuitBreaker(env as Env);

  // Initialize cache if env provided
  if (env) {
    githubCache = createGitHubCache(env as Env);
  }
}

/**
 * Set GitHub token for API calls
 */
export function setGitHubToken(token: string): void {
  githubToken = token;
}

/**
 * Reset GitHub token (for testing)
 */
export function resetGitHubToken(): void {
  githubToken = undefined;
}

/**
 * Get GitHub API base URL and headers
 */
function getGitHubConfig() {
  if (!githubToken) {
    throw new Error(
      "GITHUB_TOKEN not configured. Call setGitHubToken() first.",
    );
  }

  return {
    baseUrl: "https://api.github.com",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
  };
}

/**
 * Get current file content from GitHub (with caching)
 */
export async function getFileContent(
  repo: string,
  path: string,
  branch: string = "main",
): Promise<GitHubContent | null> {
  const cacheKey = `file_content:${repo}:${path}:${branch}`;

  // Try cache first
  if (githubCache) {
    const cached = await githubCache.get<GitHubContent>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const { baseUrl, headers } = getGitHubConfig();

  // Use circuit breaker if available
  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(
      `${baseUrl}/repos/${repo}/contents/${path}?ref=${branch}`,
      { headers },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await safeResponseJson<{ content: string; sha: string }>(
      response,
    );
    return {
      content: data.content,
      sha: data.sha,
    };
  };

  try {
    let result: GitHubContent | null;
    if (cb) {
      result = await cb.execute(execute);
    } else {
      result = await execute();
    }

    // Cache successful result
    if (result && githubCache) {
      await githubCache.set(cacheKey, result);
    }

    return result;
  } catch (error) {
    const logger = getGitHubLogger();
    logger.error(
      "Failed to get file content",
      error instanceof Error ? error : new Error(String(error)),
      {
        repo,
        path,
        branch,
      },
    );
    throw error;
  }
}

/**
 * Create or update file in GitHub (invalidates cache)
 */
export async function commitFile(
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string = "main",
  sha?: string,
): Promise<string> {
  const { baseUrl, headers } = getGitHubConfig();

  // Encode content to base64
  const encodedContent = btoa(unescape(encodeURIComponent(content)));

  const body: Record<string, string> = {
    message,
    content: encodedContent,
    branch,
  };

  if (sha) {
    body.sha = sha;
  }

  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(`${baseUrl}/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Check Content-Length before reading to avoid memory issues with large error responses
      const contentLength = response.headers.get("content-length");
      const maxErrorSize = 1024 * 1024; // 1MB limit for error responses

      let error: string;
      if (contentLength && parseInt(contentLength, 10) > maxErrorSize) {
        error = "Error response too large to display";
      } else {
        error = await response.text();
      }
      throw new Error(`GitHub commit failed: ${response.status} - ${error}`);
    }

    const data = await safeResponseJson<{ commit: { sha: string } }>(response);
    return data?.commit?.sha || "";
  };

  try {
    let result: string;
    if (cb) {
      result = await cb.execute(execute);
    } else {
      result = await execute();
    }

    // Invalidate file content cache
    if (githubCache) {
      await githubCache.delete(`file_content:${repo}:${path}:${branch}`);
      // Also invalidate commits cache since we added a new commit
      await githubCache.delete(`commits:${repo}:${path}:*`);
    }

    return result;
  } catch (error) {
    const logger = getGitHubLogger();
    logger.error(
      "Failed to commit file",
      error instanceof Error ? error : new Error(String(error)),
      {
        repo,
        path,
        branch,
      },
    );
    throw error;
  }
}

/**
 * Commit deals.json snapshot to GitHub
 */
export async function commitSnapshot(
  repo: string,
  snapshot: Snapshot,
  stats: { total: number; active: number },
): Promise<string> {
  const content = JSON.stringify(snapshot, null, 2);
  const message = `[AUTO] Update deals - ${snapshot.run_id}

- Total: ${stats.total}
- Active: ${stats.active}
- Snapshot: ${snapshot.snapshot_hash}

[skip ci]`;

  // Try to get existing file SHA
  const existing = await getFileContent(repo, CONFIG.SNAPSHOT_FILE);
  const sha = existing?.sha;

  return commitFile(repo, CONFIG.SNAPSHOT_FILE, content, message, "main", sha);
}

/**
 * Create GitHub Issue for notification
 */
export async function createGitHubIssue(
  repo: string,
  type: string,
  run_id: string,
  details: {
    severity: "info" | "warning" | "critical";
    message: string;
    context?: Record<string, unknown>;
  },
): Promise<number> {
  const { baseUrl, headers } = getGitHubConfig();

  const title = `[NOTIFY] ${type} - ${run_id}`;
  const body = `## Notification

**Type**: ${type}
**Severity**: ${details.severity}
**Run ID**: ${run_id}
**Timestamp**: ${new Date().toISOString()}

### Message
${details.message}

### Context
\`\`\`json
${JSON.stringify(details.context || {}, null, 2)}
\`\`\`

---
*This issue was automatically created by the Deal Discovery System.*
`;

  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(`${baseUrl}/repos/${repo}/issues`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title,
        body,
        labels: [type, details.severity, "automated"],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create issue: ${response.status}`);
    }

    const data = await safeResponseJson<{ number: number }>(response);
    return data?.number || 0;
  };

  try {
    if (cb) {
      return await cb.execute(execute);
    }
    return await execute();
  } catch (error) {
    const logger = getGitHubLogger();
    logger.error(
      "Failed to create notification issue",
      error instanceof Error ? error : new Error(String(error)),
      {
        repo,
        type,
        run_id,
      },
    );
    throw error;
  }
}

/**
 * Get recent commits for idempotency check (with caching)
 */
export async function getRecentCommits(
  repo: string,
  path: string,
  count: number = 10,
): Promise<GitHubCommit[]> {
  const cacheKey = `commits:${repo}:${path}:${count}`;

  // Try cache first
  if (githubCache) {
    const cached = await githubCache.get<GitHubCommit[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const { baseUrl, headers } = getGitHubConfig();

  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(
      `${baseUrl}/repos/${repo}/commits?path=${path}&per_page=${count}`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to get commits: ${response.status}`);
    }

    const data = await safeResponseJson<
      Array<{
        sha: string;
        commit: {
          message: string;
          author: {
            name: string;
            email: string;
            date: string;
          };
        };
      }>
    >(response);
    return data.map((commit) => ({
      sha: commit?.sha || "",
      message: commit?.commit?.message || "",
      author: commit?.commit?.author || { name: "", email: "", date: "" },
    }));
  };

  try {
    let result: GitHubCommit[];
    if (cb) {
      result = await cb.execute(execute);
    } else {
      result = await execute();
    }

    // Cache successful result
    if (githubCache) {
      await githubCache.set(cacheKey, result);
    }

    return result;
  } catch (error) {
    const logger = getGitHubLogger();
    logger.error(
      "Failed to get recent commits",
      error instanceof Error ? error : new Error(String(error)),
      {
        repo,
        path,
        count,
      },
    );
    return [];
  }
}

/**
 * Check if snapshot was already committed
 */
export async function isSnapshotCommitted(
  repo: string,
  snapshot_hash: string,
): Promise<boolean> {
  const commits = await getRecentCommits(repo, CONFIG.SNAPSHOT_FILE, 20);
  return commits.some((c) => c.message.includes(snapshot_hash));
}

/**
 * Verify commit SHA matches
 */
export async function verifyCommit(
  repo: string,
  expectedSha: string,
): Promise<boolean> {
  const commits = await getRecentCommits(repo, CONFIG.SNAPSHOT_FILE, 1);
  if (commits.length === 0) return false;
  return commits[0].sha === expectedSha;
}

// ============================================================================
// GitHub Actions Workflow Status
// ============================================================================

export interface WorkflowRun {
  id: number;
  name: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStatus {
  total_runs: number;
  completed_runs: number;
  successful_runs: number;
  failed_runs: number;
  pending_runs: number;
  latest_run?: WorkflowRun;
}

/**
 * Get workflow runs for a repository
 */
export async function getWorkflowRuns(
  repo: string,
  branch: string = "main",
  perPage: number = 10,
): Promise<WorkflowRun[]> {
  const { baseUrl, headers } = getGitHubConfig();

  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(
      `${baseUrl}/repos/${repo}/actions/runs?branch=${branch}&per_page=${perPage}`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to get workflow runs: ${response.status}`);
    }

    const data = await safeResponseJson<{
      workflow_runs: Array<{
        id: number;
        name: string;
        head_sha: string;
        status: string;
        conclusion: string | null;
        html_url: string;
        created_at: string;
        updated_at: string;
      }>;
    }>(response);

    return (data?.workflow_runs || []).map((run) => ({
      id: run.id,
      name: run.name,
      head_sha: run.head_sha,
      status: run.status as WorkflowRun["status"],
      conclusion: run.conclusion as WorkflowRun["conclusion"],
      html_url: run.html_url,
      created_at: run.created_at,
      updated_at: run.updated_at,
    }));
  };

  try {
    if (cb) {
      return await cb.execute(execute);
    }
    return await execute();
  } catch (error) {
    const logger = getGitHubLogger();
    logger.error(
      "Failed to get workflow runs",
      error instanceof Error ? error : new Error(String(error)),
      { repo, branch },
    );
    throw error;
  }
}

/**
 * Get status summary for all workflows
 */
export async function getWorkflowStatusSummary(
  repo: string,
  branch: string = "main",
): Promise<WorkflowStatus> {
  const runs = await getWorkflowRuns(repo, branch, 10);

  const status: WorkflowStatus = {
    total_runs: runs.length,
    completed_runs: runs.filter((r) => r.status === "completed").length,
    successful_runs: runs.filter((r) => r.conclusion === "success").length,
    failed_runs: runs.filter(
      (r) => r.conclusion === "failure" || r.conclusion === "timed_out",
    ).length,
    pending_runs: runs.filter(
      (r) => r.status === "queued" || r.status === "in_progress",
    ).length,
    latest_run: runs[0],
  };

  return status;
}

/**
 * Wait for all workflows to complete and check final status
 */
export async function waitForWorkflowsComplete(
  repo: string,
  branch: string = "main",
  options: {
    maxAttempts?: number;
    pollIntervalMs?: number;
    targetCommitSha?: string;
  } = {},
): Promise<{
  success: boolean;
  status: WorkflowStatus;
  attempts: number;
}> {
  const { maxAttempts = 30, pollIntervalMs = 10000, targetCommitSha } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const runs = await getWorkflowRuns(repo, branch, 20);

    // Filter to relevant runs (optional commit SHA filter)
    const relevantRuns = targetCommitSha
      ? runs.filter((r) => r.head_sha === targetCommitSha)
      : runs;

    if (relevantRuns.length === 0 && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    const completed = relevantRuns.filter((r) => r.status === "completed");
    const inProgress = relevantRuns.filter(
      (r) => r.status === "queued" || r.status === "in_progress",
    );

    // If all relevant workflows completed
    if (inProgress.length === 0 && completed.length > 0) {
      const status: WorkflowStatus = {
        total_runs: relevantRuns.length,
        completed_runs: completed.length,
        successful_runs: completed.filter((r) => r.conclusion === "success")
          .length,
        failed_runs: completed.filter(
          (r) => r.conclusion === "failure" || r.conclusion === "timed_out",
        ).length,
        pending_runs: 0,
        latest_run: relevantRuns[0],
      };

      return {
        success: status.failed_runs === 0,
        status,
        attempts: attempt,
      };
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  // Max attempts reached - check what we have
  const runs = await getWorkflowRuns(repo, branch, 20);
  const relevantRuns = targetCommitSha
    ? runs.filter((r) => r.head_sha === targetCommitSha)
    : runs;

  return {
    success: false,
    status: {
      total_runs: relevantRuns.length,
      completed_runs: relevantRuns.filter((r) => r.status === "completed")
        .length,
      successful_runs: relevantRuns.filter((r) => r.conclusion === "success")
        .length,
      failed_runs: relevantRuns.filter(
        (r) => r.conclusion === "failure" || r.conclusion === "timed_out",
      ).length,
      pending_runs: relevantRuns.filter(
        (r) => r.status === "queued" || r.status === "in_progress",
      ).length,
      latest_run: relevantRuns[0],
    },
    attempts: maxAttempts,
  };
}
