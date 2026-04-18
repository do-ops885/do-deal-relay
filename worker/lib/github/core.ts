import { CONFIG } from "../../config";
import type { Snapshot, Env } from "../../types";
import { CircuitBreaker, createGitHubCircuitBreaker } from "../circuit-breaker";
import { createGitHubCache } from "../cache";
import { createStructuredLogger } from "../logger";
import type { GitHubCommit, GitHubContent } from "./types";

interface GitHubCacheEnv {
  DEALS_PROD: KVNamespace;
}

export async function safeResponseJson<T>(response: Response): Promise<T> {
  if (typeof response.json === "function") {
    return (await response.json()) as T;
  }
  if (typeof response.text === "function") {
    const text = await response.text();
    return JSON.parse(text) as T;
  }
  throw new Error("Response does not have json() or text() methods");
}

let githubToken: string | undefined;
let githubCircuitBreaker: CircuitBreaker | undefined;
let githubCache: ReturnType<typeof createGitHubCache> | undefined;

export function getGitHubLogger(env?: Env) {
  const loggerEnv =
    env ||
    ({
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

export function initGitHubCircuitBreaker(env?: GitHubCacheEnv): void {
  githubCircuitBreaker = createGitHubCircuitBreaker(env as Env);
  if (env) {
    githubCache = createGitHubCache(env as Env);
  }
}

export function setGitHubToken(token: string): void {
  githubToken = token;
}

export function resetGitHubToken(): void {
  githubToken = undefined;
}

export function getGitHubConfig() {
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

export async function getFileContent(
  repo: string,
  path: string,
  branch: string = "main",
): Promise<GitHubContent | null> {
  const cacheKey = `file_content:${repo}:${path}:${branch}`;
  if (githubCache) {
    const cached = await githubCache.get<GitHubContent>(cacheKey);
    if (cached) return cached;
  }
  const { baseUrl, headers } = getGitHubConfig();
  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(
      `${baseUrl}/repos/${repo}/contents/${path}?ref=${branch}`,
      { headers },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    const data = await safeResponseJson<{ content: string; sha: string }>(response);
    return { content: data.content, sha: data.sha };
  };
  try {
    let result = cb ? await cb.execute(execute) : await execute();
    if (result && githubCache) await githubCache.set(cacheKey, result);
    return result;
  } catch (error) {
    getGitHubLogger().error("Failed to get file content", error instanceof Error ? error : new Error(String(error)), { repo, path, branch });
    throw error;
  }
}

export async function commitFile(
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string = "main",
  sha?: string,
): Promise<string> {
  const { baseUrl, headers } = getGitHubConfig();
  const encodedContent = btoa(unescape(encodeURIComponent(content)));
  const body: Record<string, string> = { message, content: encodedContent, branch };
  if (sha) body.sha = sha;
  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(`${baseUrl}/repos/${repo}/contents/${path}`, {
      method: "PUT", headers, body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub commit failed: ${response.status} - ${error}`);
    }
    const data = await safeResponseJson<{ commit: { sha: string } }>(response);
    return data?.commit?.sha || "";
  };
  try {
    let result = cb ? await cb.execute(execute) : await execute();
    if (githubCache) {
      await githubCache.delete(`file_content:${repo}:${path}:${branch}`);
      await githubCache.delete(`commits:${repo}:${path}:*`);
    }
    return result;
  } catch (error) {
    getGitHubLogger().error("Failed to commit file", error instanceof Error ? error : new Error(String(error)), { repo, path, branch });
    throw error;
  }
}

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
  const existing = await getFileContent(repo, CONFIG.SNAPSHOT_FILE);
  return commitFile(repo, CONFIG.SNAPSHOT_FILE, content, message, "main", existing?.sha);
}

export async function createGitHubIssue(
  repo: string, type: string, run_id: string,
  details: { severity: "info" | "warning" | "critical"; message: string; context?: Record<string, unknown>; },
): Promise<number> {
  const { baseUrl, headers } = getGitHubConfig();
  const title = `[NOTIFY] ${type} - ${run_id}`;
  const body = `## Notification\n\n**Type**: ${type}\n**Severity**: ${details.severity}\n**Run ID**: ${run_id}\n**Timestamp**: ${new Date().toISOString()}\n\n### Message\n${details.message}\n\n### Context\n\`\`\`json\n${JSON.stringify(details.context || {}, null, 2)}\n\`\`\`\n\n---\n*This issue was automatically created by the Deal Discovery System.*`;
  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(`${baseUrl}/repos/${repo}/issues`, {
      method: "POST", headers, body: JSON.stringify({ title, body, labels: [type, details.severity, "automated"] }),
    });
    if (!response.ok) throw new Error(`Failed to create issue: ${response.status}`);
    const data = await safeResponseJson<{ number: number }>(response);
    return data?.number || 0;
  };
  try {
    return cb ? await cb.execute(execute) : await execute();
  } catch (error) {
    getGitHubLogger().error("Failed to create notification issue", error instanceof Error ? error : new Error(String(error)), { repo, type, run_id });
    throw error;
  }
}

export async function getRecentCommits(
  repo: string, path: string, count: number = 10,
): Promise<GitHubCommit[]> {
  const cacheKey = `commits:${repo}:${path}:${count}`;
  if (githubCache) {
    const cached = await githubCache.get<GitHubCommit[]>(cacheKey);
    if (cached) return cached;
  }
  const { baseUrl, headers } = getGitHubConfig();
  const cb = githubCircuitBreaker;
  const execute = async () => {
    const response = await fetch(`${baseUrl}/repos/${repo}/commits?path=${path}&per_page=${count}`, { headers });
    if (!response.ok) throw new Error(`Failed to get commits: ${response.status}`);
    const data = await safeResponseJson<Array<{ sha: string; commit: { message: string; author: any; }; }>>(response);
    return data.map((c) => ({ sha: c.sha, message: c.commit.message, author: c.commit.author }));
  };
  try {
    let result = cb ? await cb.execute(execute) : await execute();
    if (githubCache) await githubCache.set(cacheKey, result);
    return result;
  } catch (error) {
    getGitHubLogger().error("Failed to get recent commits", error instanceof Error ? error : new Error(String(error)), { repo, path, count });
    return [];
  }
}

export async function isSnapshotCommitted(repo: string, snapshot_hash: string): Promise<boolean> {
  const commits = await getRecentCommits(repo, CONFIG.SNAPSHOT_FILE, 20);
  return commits.some((c) => c.message.includes(snapshot_hash));
}

export async function verifyCommit(repo: string, expectedSha: string): Promise<boolean> {
  const commits = await getRecentCommits(repo, CONFIG.SNAPSHOT_FILE, 1);
  return commits.length > 0 && commits[0].sha === expectedSha;
}
