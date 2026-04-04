#!/usr/bin/env node
/**
 * CLI for multi-agent workflow execution
 *
 * Coordinates the 4-phase workflow:
 * 1. Codebase Verification → 2. Evals & Tests → 3. Git Workflow → 4. Issue Fixer
 *
 * Usage:
 *   node scripts/multi-agent-cli.js [phase]
 *   node scripts/multi-agent-cli.js --execute    # Run full workflow
 *   node scripts/multi-agent-cli.js --plan      # Show execution plan
 */

import { MultiAgentOrchestrator } from "../worker/lib/multi-agent/orchestrator";
import { execSync } from "child_process";
import { setGitHubToken } from "../worker/lib/github";

const REPO_OWNER = "do-ops885";
const REPO_NAME = "do-deal-relay";

interface CliArgs {
  phase?: number;
  execute: boolean;
  plan: boolean;
  dryRun: boolean;
  skipPhases?: number[];
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    execute: false,
    plan: false,
    dryRun: false,
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute" || arg === "-e") {
      args.execute = true;
    } else if (arg === "--plan" || arg === "-p") {
      args.plan = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--skip" && argv[i + 1]) {
      args.skipPhases = argv[++i].split(",").map(Number);
    } else if (!isNaN(Number(arg))) {
      args.phase = Number(arg);
    }
  }

  return args;
}

function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN;
}

async function executeGitWorkflow(): Promise<void> {
  const token = getGitHubToken();
  if (token) {
    setGitHubToken(token);
    console.log("✓ GitHub token configured");
  } else {
    console.log(
      "⚠ GITHUB_TOKEN not set - workflow status polling will be skipped",
    );
  }

  // Check git status
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    const hasChanges = status.trim().length > 0;

    if (!hasChanges) {
      console.log("✓ No changes to commit");
      console.log("Git workflow skipped - working tree clean");
      return;
    }

    console.log(
      `Found ${status.trim().split("\n").filter(Boolean).length} changed files`,
    );
  } catch (error) {
    console.error("Failed to check git status:", error);
    process.exit(1);
  }

  // Stage changes
  console.log("→ Staging changes...");
  try {
    execSync("git add -A", { stdio: "inherit" });
    console.log("✓ Changes staged");
  } catch (error) {
    console.error("Failed to stage changes:", error);
    process.exit(1);
  }

  // Create commit
  console.log("→ Creating commit...");
  try {
    execSync('git commit -m "chore: Update codebase"', { stdio: "inherit" });
    console.log("✓ Commit created");
  } catch (error) {
    console.error("Failed to create commit:", error);
    process.exit(1);
  }

  // Get commit SHA
  const commitSha = execSync("git rev-parse HEAD", {
    encoding: "utf-8",
  }).trim();
  console.log(`Commit: ${commitSha.substring(0, 7)}`);

  // Push to origin
  console.log("→ Pushing to origin/main...");
  try {
    execSync("git push origin main", { stdio: "inherit" });
    console.log("✓ Pushed to origin");
  } catch (error) {
    console.error("Failed to push:", error);
    process.exit(1);
  }

  // Poll GitHub Actions if token available
  if (token) {
    console.log("→ Polling GitHub Actions status...");

    const { waitForWorkflowsComplete, getWorkflowRuns } =
      await import("../worker/lib/github");

    const result = await waitForWorkflowsComplete(
      `${REPO_OWNER}/${REPO_NAME}`,
      "main",
      {
        maxAttempts: 18,
        pollIntervalMs: 10000,
        targetCommitSha: commitSha,
      },
    );

    const status = result.status;
    console.log(`\n📊 CI Status:`);
    console.log(
      `   Passed: ${status.successful_runs}/${status.completed_runs}`,
    );
    console.log(`   Failed: ${status.failed_runs}`);
    console.log(`   Polls: ${result.attempts}`);

    if (result.success) {
      console.log("\n✅ All CI checks passed!");
    } else {
      console.log("\n❌ CI checks failed");
      console.log("\nNote: Run locally with fixes, commit, push again");
      process.exit(1);
    }
  } else {
    console.log("\n⚠ Skipping CI poll - GITHUB_TOKEN not set");
    console.log(
      "Manually verify CI passed at: https://github.com/do-ops885/do-deal-relay/actions",
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log("=== Multi-Agent Workflow CLI ===\n");

  if (args.plan) {
    const orchestrator = new MultiAgentOrchestrator();
    const plan = orchestrator.createPlan();

    console.log("Execution Plan:\n");
    console.log(`Workflow ID: ${plan.plan_id}`);
    console.log(
      `Estimated Duration: ${Math.round(plan.estimated_duration_ms / 60000)} minutes\n`,
    );

    console.log("Phases:");
    for (const phase of plan.phases) {
      console.log(
        `  Phase ${phase.phase}: ${phase.agent_id} (${Math.round(phase.estimated_duration_ms / 60000)} min)`,
      );
    }

    console.log("\nRisk Assessment:");
    for (const factor of plan.risk_assessment.factors) {
      console.log(
        `  [${factor.level.toUpperCase()}] ${factor.category}: ${factor.description}`,
      );
    }

    return;
  }

  if (args.dryRun) {
    console.log("Running in DRY-RUN mode...\n");
    const orchestrator = new MultiAgentOrchestrator({ dryRun: true });
    const result = await orchestrator.execute();

    console.log(`\nResult: ${result.status}`);
    console.log(`Duration: ${Math.round(result.duration_ms / 1000)}s`);
    console.log(`Phases: ${result.phases.length}`);

    return;
  }

  if (args.execute) {
    console.log("Executing full workflow...\n");

    await executeGitWorkflow();

    return;
  }

  // Default: show help
  console.log(`Usage: node scripts/multi-agent-cli.js [options]
  
Options:
  --execute, -e      Execute git workflow (stage, commit, push, poll CI)
  --plan, -p         Show execution plan
  --dry-run          Run in simulation mode
  --skip phases      Skip specific phases (comma-separated)
  [phase]            Run only specified phase (1-4)

Examples:
  node scripts/multi-agent-cli.js --plan
  node scripts/multi-agent-cli.js --execute
  node scripts/multi-agent-cli.js --dry-run
`);
}

main().catch(console.error);
