import { CONFIG } from "../config";
import type { Snapshot } from "../types";
import { CircuitBreaker, createGitHubCircuitBreaker } from "./circuit-breaker";
import { createGitHubCache } from "./cache";

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

/**
 * Initialize GitHub circuit breaker and cache
 */
export function initGitHubCircuitBreaker(env?: {
  DEALS_PROD: KVNamespace;
}): void {
  githubCircuitBreaker = createGitHubCircuitBreaker(
    env as Parameters<typeof createGitHubCircuitBreaker>[0],
  );

  // Initialize cache if env provided
  if (env) {
    githubCache = createGitHubCache(env as any);
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
    console.error("Failed to get file content:", error);
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
      const error = await response.text();
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
    console.error("Failed to commit file:", error);
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
    console.error("Failed to create notification issue:", error);
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
    console.error("Failed to get recent commits:", error);
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
