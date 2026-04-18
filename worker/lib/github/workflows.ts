import {
  getGitHubConfig,
  safeResponseJson,
  getGitHubLogger,
  githubCircuitBreaker,
} from "./core";
import type { WorkflowRun, WorkflowStatus } from "./types";

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
    if (!response.ok)
      throw new Error(`Failed to get workflow runs: ${response.status}`);
    const data = await safeResponseJson<{ workflow_runs: any[] }>(response);
    return (data?.workflow_runs || []).map((run) => ({
      id: run.id,
      name: run.name,
      head_sha: run.head_sha,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      created_at: run.created_at,
      updated_at: run.updated_at,
    }));
  };
  try {
    return cb ? await cb.execute(execute) : await execute();
  } catch (error) {
    getGitHubLogger().error(
      "Failed to get workflow runs",
      error instanceof Error ? error : new Error(String(error)),
      { repo, branch },
    );
    throw error;
  }
}

export async function getWorkflowStatusSummary(
  repo: string,
  branch: string = "main",
): Promise<WorkflowStatus> {
  const runs = await getWorkflowRuns(repo, branch, 10);
  return {
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
}

export async function waitForWorkflowsComplete(
  repo: string,
  branch: string = "main",
  options: {
    maxAttempts?: number;
    pollIntervalMs?: number;
    targetCommitSha?: string;
  } = {},
): Promise<{ success: boolean; status: WorkflowStatus; attempts: number }> {
  const { maxAttempts = 30, pollIntervalMs = 10000, targetCommitSha } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const runs = await getWorkflowRuns(repo, branch, 20);
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
      return { success: status.failed_runs === 0, status, attempts: attempt };
    }
    if (attempt < maxAttempts)
      await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  const runs = await getWorkflowRuns(repo, branch, 20);
  const relevantRuns = targetCommitSha
    ? runs.filter((r) => r.head_sha === targetCommitSha)
    : runs;
  const status = {
    total_runs: relevantRuns.length,
    completed_runs: relevantRuns.filter((r) => r.status === "completed").length,
    successful_runs: relevantRuns.filter((r) => r.conclusion === "success")
      .length,
    failed_runs: relevantRuns.filter(
      (r) => r.conclusion === "failure" || r.conclusion === "timed_out",
    ).length,
    pending_runs: relevantRuns.filter(
      (r) => r.status === "queued" || r.status === "in_progress",
    ).length,
    latest_run: relevantRuns[0],
  };
  return { success: false, status, attempts: maxAttempts };
}
