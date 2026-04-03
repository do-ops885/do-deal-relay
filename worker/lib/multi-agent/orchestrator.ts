/**
 * Multi-Agent Workflow Orchestrator
 *
 * Coordinates 4-phase workflow execution:
 * 1. Codebase Verification → 2. Evals & Tests → 3. Git Workflow → 4. Issue Fixer
 *
 * Features:
 * - Sequential handoff between phases
 * - Retry logic with exponential backoff
 * - Quality gates at each phase boundary
 * - Event emission for progress tracking
 * - Comprehensive logging and reporting
 */

import { CodebaseVerificationAgent } from "./agents/phase1-verifier";
import { EvalsAndTestsAgent } from "./agents/phase2-tester";
import { GitWorkflowAgent } from "./agents/phase3-git";
import { IssueFixerAgent } from "./agents/phase4-fixer";
import type {
  Agent,
  AgentContext,
  PhaseResult,
  WorkflowState,
  WorkflowConfig,
  WorkflowEvent,
  WorkflowStatus,
  WorkflowMetadata,
  OrchestratorPlan,
} from "./types";
import { DEFAULT_WORKFLOW_CONFIG } from "./types";

export interface OrchestratorOptions {
  workflow_id?: string;
  config?: Partial<WorkflowConfig>;
  env?: Record<string, string>;
  onEvent?: (event: WorkflowEvent) => void;
  skipPhases?: number[];
  dryRun?: boolean;
}

export interface OrchestratorResult {
  success: boolean;
  workflow_id: string;
  status: WorkflowStatus;
  phases: PhaseResult[];
  metadata: WorkflowMetadata;
  duration_ms: number;
  events: WorkflowEvent[];
}

export class MultiAgentOrchestrator {
  private agents: Map<number, Agent> = new Map();
  private config: WorkflowConfig;
  private events: WorkflowEvent[] = [];
  private onEvent?: (event: WorkflowEvent) => void;
  private skipPhases: Set<number>;
  private dryRun: boolean;

  constructor(options: OrchestratorOptions = {}) {
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...options.config };
    this.onEvent = options.onEvent;
    this.skipPhases = new Set(options.skipPhases || []);
    this.dryRun = options.dryRun || false;

    // Initialize agents
    this.agents.set(1, new CodebaseVerificationAgent());
    this.agents.set(2, new EvalsAndTestsAgent());
    this.agents.set(3, new GitWorkflowAgent());
    this.agents.set(4, new IssueFixerAgent());

    // Update workflow ID if provided
    if (options.workflow_id) {
      this.config.workflow_id = options.workflow_id;
    }
  }

  /**
   * Execute the complete 4-phase workflow
   */
  async execute(): Promise<OrchestratorResult> {
    const workflow_id = this.config.workflow_id;
    const start_time = Date.now();
    const phases: PhaseResult[] = [];

    this.emitEvent({
      event_id: this.generateId(),
      workflow_id,
      timestamp: new Date().toISOString(),
      type: "workflow_started",
      message: "Starting 4-phase multi-agent workflow",
      data: {
        config: this.config,
        skip_phases: Array.from(this.skipPhases),
        dry_run: this.dryRun,
      },
    });

    try {
      // Execute each phase sequentially
      for (let phase = 1; phase <= 4; phase++) {
        if (this.skipPhases.has(phase)) {
          this.emitEvent({
            event_id: this.generateId(),
            workflow_id,
            timestamp: new Date().toISOString(),
            type: "phase_started",
            phase,
            message: `Phase ${phase} skipped`,
          });
          continue;
        }

        const phaseResult = await this.executePhase(phase, phases);
        phases.push(phaseResult);

        // Check if we should continue
        if (phaseResult.status === "failed") {
          const phaseConfig = this.config.phases.find((p) => p.phase === phase);

          if (
            phaseConfig?.retry_on_failure &&
            phaseResult.errors.some((e) => e.recoverable)
          ) {
            // Retry logic
            const retryResult = await this.retryPhase(phase, phases);
            phases[phases.length - 1] = retryResult;

            if (retryResult.status === "failed") {
              return this.createResult(
                workflow_id,
                "failed",
                phases,
                start_time,
              );
            }
          } else {
            return this.createResult(workflow_id, "failed", phases, start_time);
          }
        }

        // Quality gate check
        const gateResult = this.checkQualityGate(phase, phaseResult);
        this.emitEvent({
          event_id: this.generateId(),
          workflow_id,
          timestamp: new Date().toISOString(),
          type: gateResult.passed
            ? "quality_gate_passed"
            : "quality_gate_failed",
          phase,
          message: gateResult.message,
          data: gateResult.details,
        });

        if (!gateResult.passed && gateResult.required) {
          return this.createResult(workflow_id, "failed", phases, start_time);
        }

        // Handoff event
        if (phase < 4) {
          this.emitEvent({
            event_id: this.generateId(),
            workflow_id,
            timestamp: new Date().toISOString(),
            type: "handoff_completed",
            phase,
            message: `Handoff from Phase ${phase} to Phase ${phase + 1} completed`,
          });
        }
      }

      return this.createResult(workflow_id, "completed", phases, start_time);
    } catch (error) {
      this.emitEvent({
        event_id: this.generateId(),
        workflow_id,
        timestamp: new Date().toISOString(),
        type: "workflow_failed",
        message: `Workflow failed with error: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.stack : String(error) },
      });

      return this.createResult(workflow_id, "failed", phases, start_time);
    }
  }

  /**
   * Execute a single phase with the appropriate agent
   */
  private async executePhase(
    phase: number,
    previousResults: PhaseResult[],
  ): Promise<PhaseResult> {
    const workflow_id = this.config.workflow_id;
    const agent = this.agents.get(phase);

    if (!agent) {
      throw new Error(`No agent found for phase ${phase}`);
    }

    this.emitEvent({
      event_id: this.generateId(),
      workflow_id,
      timestamp: new Date().toISOString(),
      type: "phase_started",
      phase,
      message: `Starting Phase ${phase}: ${agent.name}`,
    });

    const context: AgentContext = {
      workflow_id,
      phase,
      attempt: 1,
      previous_results: previousResults,
      config: this.config,
      env: {},
    };

    if (this.dryRun) {
      // Return simulated success in dry run mode
      const result: PhaseResult = {
        phase,
        name: agent.name,
        status: "passed",
        duration_ms: 0,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        checks: [
          {
            name: "Dry Run",
            status: "passed",
            message: "Phase executed in dry-run mode",
          },
        ],
        findings: [],
        errors: [],
      };

      this.emitEvent({
        event_id: this.generateId(),
        workflow_id,
        timestamp: new Date().toISOString(),
        type: "phase_completed",
        phase,
        message: `Phase ${phase} completed (dry-run) with status: ${result.status}`,
        data: { status: result.status, duration_ms: result.duration_ms },
      });

      return result;
    }

    const startTime = Date.now();
    const result = await agent.execute(context);
    const duration_ms = Date.now() - startTime;

    this.emitEvent({
      event_id: this.generateId(),
      workflow_id,
      timestamp: new Date().toISOString(),
      type: result.status === "failed" ? "phase_failed" : "phase_completed",
      phase,
      message: `Phase ${phase} completed with status: ${result.status}`,
      data: {
        status: result.status,
        duration_ms,
        checks: result.checks.length,
      },
    });

    return { ...result, duration_ms };
  }

  /**
   * Retry a failed phase with exponential backoff
   */
  private async retryPhase(
    phase: number,
    previousResults: PhaseResult[],
  ): Promise<PhaseResult> {
    const workflow_id = this.config.workflow_id;
    const phaseConfig = this.config.phases.find((p) => p.phase === phase);
    const maxRetries =
      phaseConfig?.max_retries || this.config.retry_policy.max_attempts;

    for (let attempt = 2; attempt <= maxRetries; attempt++) {
      this.emitEvent({
        event_id: this.generateId(),
        workflow_id,
        timestamp: new Date().toISOString(),
        type: "phase_retry",
        phase,
        message: `Retrying Phase ${phase}, attempt ${attempt}/${maxRetries}`,
        data: { attempt, max_retries: maxRetries },
      });

      // Calculate backoff
      const backoff = Math.min(
        this.config.retry_policy.backoff_ms *
          Math.pow(this.config.retry_policy.backoff_multiplier, attempt - 2),
        this.config.retry_policy.max_backoff_ms,
      );

      await this.sleep(backoff);

      const agent = this.agents.get(phase);
      if (!agent) continue;

      const context: AgentContext = {
        workflow_id,
        phase,
        attempt,
        previous_results: previousResults,
        config: this.config,
        env: {},
      };

      const result = await agent.execute(context);

      if (result.status !== "failed") {
        return result;
      }
    }

    // Return last failed result
    return previousResults[previousResults.length - 1];
  }

  /**
   * Check quality gate criteria for a phase
   */
  private checkQualityGate(
    phase: number,
    phaseResult: PhaseResult,
  ): {
    passed: boolean;
    required: boolean;
    message: string;
    details: Record<string, unknown>;
  } {
    const gate = this.config.quality_gates.find((g) => g.phase === phase);

    if (!gate) {
      return {
        passed: true,
        required: false,
        message: "No quality gate defined",
        details: {},
      };
    }

    const results: boolean[] = [];

    for (const criterion of gate.criteria) {
      let value: unknown;

      // Extract metric from phase result
      switch (criterion.metric) {
        case "incorrect_urls":
          value = phaseResult.findings.filter(
            (f) => f.category === "url_pattern" && f.type === "error",
          ).length;
          break;
        case "missing_critical_files":
          value = phaseResult.findings.filter(
            (f) => f.category === "file_structure" && f.type === "error",
          ).length;
          break;
        case "typescript_compiles":
          value = phaseResult.metadata?.typescript_clean ?? false;
          break;
        case "tests_pass_rate":
          const total = (phaseResult.metadata?.total_tests as number) || 0;
          const passed = (phaseResult.metadata?.tests_passed as number) || 0;
          value = total > 0 ? passed / total : 0;
          break;
        case "commits_created":
          value = (phaseResult.metadata?.commits_created as number) || 0;
          break;
        case "push_success":
          value = phaseResult.metadata?.push_success === true;
          break;
        case "critical_issues":
          value = phaseResult.findings.filter((f) => f.type === "error").length;
          break;
        case "auto_fix_success_rate":
          const attempted = (phaseResult.metadata?.auto_fixable as number) || 0;
          const fixed = (phaseResult.metadata?.fixed as number) || 0;
          value = attempted > 0 ? fixed / attempted : 0;
          break;
        default:
          value = phaseResult.metadata?.[criterion.metric];
      }

      // Evaluate criterion
      let criterionPassed = false;
      switch (criterion.operator) {
        case "eq":
          criterionPassed = value === criterion.value;
          break;
        case "neq":
          criterionPassed = value !== criterion.value;
          break;
        case "gt":
          criterionPassed = (value as number) > (criterion.value as number);
          break;
        case "gte":
          criterionPassed = (value as number) >= (criterion.value as number);
          break;
        case "lt":
          criterionPassed = (value as number) < (criterion.value as number);
          break;
        case "lte":
          criterionPassed = (value as number) <= (criterion.value as number);
          break;
        case "contains":
          criterionPassed =
            Array.isArray(value) && value.includes(criterion.value);
          break;
        case "matches":
          criterionPassed =
            typeof value === "string" &&
            new RegExp(criterion.value as string).test(value);
          break;
      }

      results.push(criterionPassed);
    }

    const allPassed = results.every((r) => r);

    return {
      passed: allPassed,
      required: gate.required,
      message: allPassed
        ? `Quality gate "${gate.name}" passed`
        : `Quality gate "${gate.name}" failed`,
      details: {
        gate_id: gate.gate_id,
        criteria_passed: results.filter((r) => r).length,
        criteria_total: gate.criteria.length,
        required: gate.required,
      },
    };
  }

  /**
   * Create final orchestrator result
   */
  private createResult(
    workflow_id: string,
    status: WorkflowStatus,
    phases: PhaseResult[],
    startTime: number,
  ): OrchestratorResult {
    const duration_ms = Date.now() - startTime;

    const metadata: WorkflowMetadata = {
      total_duration_ms: duration_ms,
      phases_passed: phases.filter((p) => p.status === "passed").length,
      phases_failed: phases.filter((p) => p.status === "failed").length,
      phases_partial: phases.filter((p) => p.status === "partial").length,
      commits_created: phases
        .filter((p) => p.phase === 3)
        .flatMap((p) => (p.metadata?.commits_created as string[]) || []),
      issues_fixed: phases
        .filter((p) => p.phase === 4)
        .flatMap((p) => (p.metadata?.fixed as string[]) || []),
      files_modified: [],
    };

    return {
      success: status === "completed",
      workflow_id,
      status,
      phases,
      metadata,
      duration_ms,
      events: this.events,
    };
  }

  /**
   * Emit workflow event
   */
  private emitEvent(event: WorkflowEvent): void {
    this.events.push(event);
    this.onEvent?.(event);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get execution plan without running
   */
  createPlan(): OrchestratorPlan {
    return {
      plan_id: this.generateId(),
      workflow_id: this.config.workflow_id,
      created_at: new Date().toISOString(),
      phases: this.config.phases.map((p) => ({
        phase: p.phase,
        agent_id: p.agent_type,
        estimated_duration_ms: p.timeout_ms,
        dependencies: p.dependencies,
        fallback_strategy: p.retry_on_failure ? "retry" : "skip",
      })),
      estimated_duration_ms: this.config.phases.reduce(
        (sum, p) => sum + p.timeout_ms,
        0,
      ),
      risk_assessment: {
        overall_risk: "medium",
        factors: [
          {
            category: "test_environment",
            level: "high",
            description: "Known Vitest pool crashes in test environment",
          },
          {
            category: "dependency_sync",
            level: "medium",
            description: "package-lock.json may need regeneration",
          },
        ],
        mitigation_strategies: [
          "Use retry logic for transient failures",
          "Document known issues in LESSONS.md",
          "Skip tests in problematic environments",
        ],
      },
    };
  }
}
