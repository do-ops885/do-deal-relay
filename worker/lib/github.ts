import { CONFIG } from '../config';
import type { Snapshot } from '../types';

// ============================================================================
// GitHub API Integration
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

/**
 * Get GitHub API base URL and headers
 */
function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  return {
    baseUrl: 'https://api.github.com',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
  };
}

/**
 * Get current file content from GitHub
 */
export async function getFileContent(
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<GitHubContent | null> {
  const { baseUrl, headers } = getGitHubConfig();

  try {
    const response = await fetch(
      `${baseUrl}/repos/${repo}/contents/${path}?ref=${branch}`,
      { headers }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.content,
      sha: data.sha,
    };
  } catch (error) {
    console.error('Failed to get file content:', error);
    throw error;
  }
}

/**
 * Create or update file in GitHub
 */
export async function commitFile(
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string = 'main',
  sha?: string
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

  try {
    const response = await fetch(
      `${baseUrl}/repos/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub commit failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.commit.sha;
  } catch (error) {
    console.error('Failed to commit file:', error);
    throw error;
  }
}

/**
 * Commit deals.json snapshot to GitHub
 */
export async function commitSnapshot(
  repo: string,
  snapshot: Snapshot,
  stats: { total: number; active: number }
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

  return commitFile(repo, CONFIG.SNAPSHOT_FILE, content, message, 'main', sha);
}

/**
 * Create GitHub Issue for notification
 */
export async function createNotificationIssue(
  repo: string,
  type: string,
  run_id: string,
  details: {
    severity: 'info' | 'warning' | 'critical';
    message: string;
    context?: Record<string, unknown>;
  }
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

  try {
    const response = await fetch(
      `${baseUrl}/repos/${repo}/issues`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          body,
          labels: [type, details.severity, 'automated'],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create issue: ${response.status}`);
    }

    const data = await response.json();
    return data.number;
  } catch (error) {
    console.error('Failed to create notification issue:', error);
    throw error;
  }
}

/**
 * Get recent commits for idempotency check
 */
export async function getRecentCommits(
  repo: string,
  path: string,
  count: number = 10
): Promise<GitHubCommit[]> {
  const { baseUrl, headers } = getGitHubConfig();

  try {
    const response = await fetch(
      `${baseUrl}/repos/${repo}/commits?path=${path}&per_page=${count}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error(`Failed to get commits: ${response.status}`);
    }

    const data = await response.json();
    return data.map((commit: { sha: string; commit: { message: string; author: { name: string; email: string; date: string } } }) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author,
    }));
  } catch (error) {
    console.error('Failed to get recent commits:', error);
    return [];
  }
}

/**
 * Check if snapshot was already committed
 */
export async function isSnapshotCommitted(
  repo: string,
  snapshot_hash: string
): Promise<boolean> {
  const commits = await getRecentCommits(repo, CONFIG.SNAPSHOT_FILE, 20);
  return commits.some((c) => c.message.includes(snapshot_hash));
}

/**
 * Verify commit SHA matches
 */
export async function verifyCommit(
  repo: string,
  expectedSha: string
): Promise<boolean> {
  const commits = await getRecentCommits(repo, CONFIG.SNAPSHOT_FILE, 1);
  if (commits.length === 0) return false;
  return commits[0].sha === expectedSha;
}
