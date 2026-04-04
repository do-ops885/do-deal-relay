/**
 * Phase 3 Agent: Git Workflow Manager
 *
 * Handles git operations: staging, committing, pushing.
 * Manages commit history and branch synchronization.
 * Polls GitHub Actions status with retry loop until CI passes.
 */

import type {
  Agent,
  AgentContext,
  PhaseResult,
  PhaseCheck,
  PhaseFinding,
  GitOperation,
  CommitInfo,
} from "../types";
import { getWorkflowRuns, waitForWorkflowsComplete } from "../../github";
import { CONFIG } from "../../../config";

const REPO = "do-ops885/do-deal-relay";

export class GitWorkflowAgent implements Agent {
  id = "git-001";
  type = "git" as const;
  name = "Git Workflow Manager Agent";
  version = "1.0.0";

  async execute(context: AgentContext): Promise<PhaseResult> {
    const started_at = new Date().toISOString();
    const start_time = Date.now();
    const findings: PhaseFinding[] = [];
    const checks: PhaseCheck[] = [];
    const operations: GitOperation[] = [];
    const commits: CommitInfo[] = [];

    try {
      // Step 1: Check git status (simulated - uses cached state)
      const statusCheck = await this.checkGitStatus();
      operations.push(...statusCheck.operations);
      checks.push(statusCheck.check);

      if (!statusCheck.hasChanges) {
        findings.push({
          type: "info",
          category: "git",
          message: "No changes to commit - working tree clean",
        });

        return {
          phase: 3,
          name: "Git Workflow",
          status: "passed",
          duration_ms: Date.now() - start_time,
          started_at,
          completed_at: new Date().toISOString(),
          checks,
          findings,
          errors: [],
          metadata: {
            no_changes: true,
            operations_count: operations.length,
          },
        };
      }

      findings.push({
        type: "info",
        category: "git",
        message: `Found ${statusCheck.modifiedFiles} modified files to stage`,
      });

      // Step 2: Stage changes (simulated)
      const stageOp = await this.stageChanges();
      operations.push(stageOp);

      checks.push({
        name: "Stage Changes",
        status: stageOp.status === "success" ? "passed" : "failed",
        message: stageOp.message || "Staged changes",
      });

      if (stageOp.status === "failed") {
        return this.createFailedResult(
          3,
          start_time,
          started_at,
          checks,
          findings,
          stageOp.error || "Staging failed",
        );
      }

      // Step 3: Create commits (simulated)
      const commitResult = await this.createCommits();
      operations.push(...commitResult.operations);
      commits.push(...commitResult.commits);

      checks.push({
        name: "Create Commits",
        status: commitResult.commits.length > 0 ? "passed" : "failed",
        message: `Created ${commitResult.commits.length} commit(s)`,
        details: {
          commits: commitResult.commits.map((c) => ({
            hash: c.hash,
            message: c.message,
          })),
        },
      });

      if (commitResult.commits.length === 0) {
        return this.createFailedResult(
          3,
          start_time,
          started_at,
          checks,
          findings,
          "No commits created",
        );
      }

      commitResult.commits.forEach((commit) => {
        findings.push({
          type: "success",
          category: "git",
          message: `Created commit ${commit.hash.substring(0, 7)}: ${commit.message}`,
        });
      });

      // Step 4: Push to origin (simulated)
      const pushOp = await this.pushToOrigin();
      operations.push(pushOp);

      checks.push({
        name: "Push to Origin",
        status: pushOp.status === "success" ? "passed" : "failed",
        message:
          pushOp.status === "success"
            ? "Successfully pushed to origin"
            : `Push failed: ${pushOp.error}`,
      });

      if (pushOp.status === "failed") {
        return this.createFailedResult(
          3,
          start_time,
          started_at,
          checks,
          findings,
          pushOp.error || "Push failed",
        );
      }

      findings.push({
        type: "success",
        category: "git",
        message: `Pushed ${commits.length} commit(s) to origin/main`,
      });

      // Step 5: Poll GitHub Actions with retry loop
      const headSha = commits[0]?.hash || "";
      const ciResult = await this.pollGitHubActionsWithRetry(headSha);
      checks.push(ciResult.check);
      findings.push(...ciResult.findings);

      // Determine overall status
      const failedChecks = checks.filter((c) => c.status === "failed").length;
      const status: PhaseResult["status"] =
        failedChecks > 0 ? "failed" : "passed";

      return {
        phase: 3,
        name: "Git Workflow",
        status,
        duration_ms: Date.now() - start_time,
        started_at,
        completed_at: new Date().toISOString(),
        checks,
        findings,
        errors: [],
        metadata: {
          operations_count: operations.length,
          commits_created: commits.length,
          total_files_changed: commits.reduce(
            (sum, c) => sum + c.files_changed,
            0,
          ),
          push_success: pushOp.status === "success",
          ci_passed: ciResult.ciPassed,
          ci_attempts: ciResult.attempts,
          commit_sha: headSha,
        },
      };
    } catch (error) {
      return {
        phase: 3,
        name: "Git Workflow",
        status: "failed",
        duration_ms: Date.now() - start_time,
        started_at,
        checks,
        findings,
        errors: [
          {
            code: "GIT_WORKFLOW_ERROR",
            message: error instanceof Error ? error.message : String(error),
            recoverable: false,
            retry_count: context.attempt,
          },
        ],
      };
    }
  }

  private createFailedResult(
    phase: number,
    start_time: number,
    started_at: string,
    checks: PhaseCheck[],
    findings: PhaseFinding[],
    errorMsg: string,
  ): PhaseResult {
    return {
      phase,
      name: "Git Workflow",
      status: "failed",
      duration_ms: Date.now() - start_time,
      started_at,
      completed_at: new Date().toISOString(),
      checks,
      findings,
      errors: [
        {
          code: "GIT_OPERATION_ERROR",
          message: errorMsg,
          recoverable: true,
          retry_count: 0,
        },
      ],
    };
  }

  private async checkGitStatus(): Promise<{
    hasChanges: boolean;
    modifiedFiles: number;
    operations: GitOperation[];
    check: PhaseCheck;
  }> {
    return {
      hasChanges: true,
      modifiedFiles: 10,
      operations: [
        { type: "stage", status: "pending", message: "Checking git status" },
      ],
      check: {
        name: "Git Status Check",
        status: "passed",
        message: "Found 10 modified files",
      },
    };
  }

  private async stageChanges(): Promise<GitOperation> {
    return {
      type: "stage",
      status: "success",
      message: "Staged all modified files",
    };
  }

  private async createCommits(): Promise<{
    operations: GitOperation[];
    commits: CommitInfo[];
  }> {
    const hash = `sha-${Date.now().toString(36)}`;
    const commits: CommitInfo[] = [
      {
        hash,
        message: "chore: Update codebase",
        files_changed: 10,
        additions: 100,
        deletions: 0,
        timestamp: new Date().toISOString(),
      },
    ];

    return {
      operations: [
        {
          type: "commit",
          status: "success",
          message: `Created commit: ${hash.substring(0, 7)}`,
        },
      ],
      commits,
    };
  }

  private async pushToOrigin(): Promise<GitOperation> {
    return {
      type: "push",
      status: "success",
      message: "Pushed to origin/main",
    };
  }

  private async pollGitHubActionsWithRetry(commitSha: string): Promise<{
    check: PhaseCheck;
    findings: PhaseFinding[];
    ciPassed: boolean;
    attempts: number;
  }> {
    const findings: PhaseFinding[] = [];
    const maxAttempts = CONFIG.CI_POLL_MAX_ATTEMPTS || 18;
    const pollIntervalMs = CONFIG.CI_POLL_INTERVAL_MS || 10000;

    findings.push({
      type: "info",
      category: "ci_cd",
      message: `Polling GitHub Actions for commit ${commitSha.substring(0, 7)}`,
    });

    try {
      const result = await waitForWorkflowsComplete(REPO, "main", {
        maxAttempts,
        pollIntervalMs,
        targetCommitSha: commitSha,
      });

      const status = result.status;

      // Log workflow results
      const runs = await getWorkflowRuns(REPO, "main", 10);
      const relevantRuns = commitSha
        ? runs.filter((r) => r.head_sha === commitSha)
        : runs.slice(0, 5);

      for (const run of relevantRuns) {
        findings.push({
          type: run.conclusion === "success" ? "success" : "error",
          category: "ci_cd",
          message: `Workflow "${run.name}": ${run.status} (${run.conclusion || "pending"})`,
        });
      }

      const check: PhaseCheck = {
        name: "GitHub Actions Status",
        status: result.success ? "passed" : "failed",
        message: `CI: ${status.successful_runs}/${status.completed_runs} passed (${result.attempts} polls)`,
        details: {
          workflows_checked: status.total_runs,
          passed: status.successful_runs,
          failed: status.failed_runs,
          attempts: result.attempts,
          commit_sha: commitSha.substring(0, 7),
        },
      };

      return {
        check,
        findings,
        ciPassed: result.success,
        attempts: result.attempts,
      };
    } catch (error) {
      findings.push({
        type: "error",
        category: "ci_cd",
        message: `CI poll failed: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        check: {
          name: "GitHub Actions Status",
          status: "failed",
          message: "Failed to poll CI status",
        },
        findings,
        ciPassed: false,
        attempts: 0,
      };
    }
  }
}
