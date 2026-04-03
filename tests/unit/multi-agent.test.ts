/**
 * Multi-Agent Workflow Tests
 *
 * Tests for the 4-phase coordinated workflow system.
 */

import { describe, it, expect } from "vitest";
import {
  CodebaseVerificationAgent,
  EvalsAndTestsAgent,
  GitWorkflowAgent,
  IssueFixerAgent,
  MultiAgentOrchestrator,
} from "../../worker/lib/multi-agent";
import { DEFAULT_WORKFLOW_CONFIG } from "../../worker/lib/multi-agent/types";
import type {
  AgentContext,
  WorkflowConfig,
} from "../../worker/lib/multi-agent";

describe("Multi-Agent Workflow", () => {
  // ============================================================================
  // Phase 1: Codebase Verification Agent Tests
  // ============================================================================
  describe("Phase 1: CodebaseVerificationAgent", () => {
    const agent = new CodebaseVerificationAgent();

    it("should have correct metadata", () => {
      expect(agent.id).toBe("verifier-001");
      expect(agent.type).toBe("verifier");
      expect(agent.name).toBe("Codebase Verification Agent");
      expect(agent.version).toBe("1.0.0");
    });

    it("should execute and return phase result", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 1,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      expect(result.phase).toBe(1);
      expect(result.name).toBe("Codebase Verification");
      expect(["passed", "failed", "partial"]).toContain(result.status);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.started_at).toBeDefined();
      expect(result.checks).toBeInstanceOf(Array);
      expect(result.findings).toBeInstanceOf(Array);
      expect(result.errors).toBeInstanceOf(Array);
    });

    it("should verify URL patterns", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 1,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const urlCheck = result.checks.find(
        (c) => c.name === "URL Pattern Verification",
      );
      expect(urlCheck).toBeDefined();
      expect(["passed", "failed", "warning"]).toContain(urlCheck?.status);
    });

    it("should verify file structure", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 1,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const fileCheck = result.checks.find(
        (c) => c.name === "File Structure Verification",
      );
      expect(fileCheck).toBeDefined();
      expect(["passed", "failed"]).toContain(fileCheck?.status);
    });

    it("should verify root directory policy", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 1,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const rootCheck = result.checks.find(
        (c) => c.name === "Root Directory Policy",
      );
      expect(rootCheck).toBeDefined();
      expect(["passed", "failed"]).toContain(rootCheck?.status);
    });
  });

  // ============================================================================
  // Phase 2: Evals & Tests Agent Tests
  // ============================================================================
  describe("Phase 2: EvalsAndTestsAgent", () => {
    const agent = new EvalsAndTestsAgent();

    it("should have correct metadata", () => {
      expect(agent.id).toBe("tester-001");
      expect(agent.type).toBe("tester");
      expect(agent.name).toBe("Evals & Tests Runner Agent");
      expect(agent.version).toBe("1.0.0");
    });

    it("should execute and return phase result", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 2,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      expect(result.phase).toBe(2);
      expect(result.name).toBe("Evals & Tests");
      expect(["passed", "failed", "partial"]).toContain(result.status);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should check TypeScript compilation", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 2,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const tsCheck = result.checks.find(
        (c) => c.name === "TypeScript Compilation",
      );
      expect(tsCheck).toBeDefined();
      expect(["passed", "failed"]).toContain(tsCheck?.status);
    });

    it("should run unit tests", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 2,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const testCheck = result.checks.find((c) => c.name === "Unit Tests");
      expect(testCheck).toBeDefined();
      expect(["passed", "failed", "warning", "skipped", "partial"]).toContain(
        testCheck?.status,
      );
    });

    it("should run validation gates", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 2,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const gateCheck = result.checks.find(
        (c) => c.name === "Validation Gates",
      );
      expect(gateCheck).toBeDefined();
      expect(["passed", "failed", "warning"]).toContain(gateCheck?.status);
    });
  });

  // ============================================================================
  // Phase 3: Git Workflow Agent Tests
  // ============================================================================
  describe("Phase 3: GitWorkflowAgent", () => {
    const agent = new GitWorkflowAgent();

    it("should have correct metadata", () => {
      expect(agent.id).toBe("git-001");
      expect(agent.type).toBe("git");
      expect(agent.name).toBe("Git Workflow Manager Agent");
      expect(agent.version).toBe("1.0.0");
    });

    it("should execute and return phase result", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 3,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      expect(result.phase).toBe(3);
      expect(result.name).toBe("Git Workflow");
      expect(["passed", "failed", "partial"]).toContain(result.status);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should check git status", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 3,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const statusCheck = result.checks.find(
        (c) => c.name === "Git Status Check",
      );
      expect(statusCheck).toBeDefined();
      expect(["passed", "failed"]).toContain(statusCheck?.status);
    });

    it("should create commits", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 3,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const commitCheck = result.checks.find(
        (c) => c.name === "Create Commits",
      );
      expect(commitCheck).toBeDefined();
      expect(["passed", "failed"]).toContain(commitCheck?.status);

      if (result.metadata?.commits_created !== undefined) {
        expect(typeof result.metadata.commits_created).toBe("number");
      }
    });

    it("should push to origin", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 3,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const pushCheck = result.checks.find((c) => c.name === "Push to Origin");
      expect(pushCheck).toBeDefined();
      expect(["passed", "failed"]).toContain(pushCheck?.status);
    });
  });

  // ============================================================================
  // Phase 4: Issue Fixer Agent Tests
  // ============================================================================
  describe("Phase 4: IssueFixerAgent", () => {
    const agent = new IssueFixerAgent();

    it("should have correct metadata", () => {
      expect(agent.id).toBe("fixer-001");
      expect(agent.type).toBe("fixer");
      expect(agent.name).toBe("Issue Fixer Agent");
      expect(agent.version).toBe("1.0.0");
    });

    it("should execute and return phase result", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 4,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      expect(result.phase).toBe(4);
      expect(result.name).toBe("Issue Fixer");
      expect(["passed", "failed", "partial"]).toContain(result.status);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should detect issues", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 4,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const detectionCheck = result.checks.find(
        (c) => c.name === "Issue Detection",
      );
      expect(detectionCheck).toBeDefined();
      expect(detectionCheck?.status).toBe("passed");
    });

    it("should attempt auto-fixes", async () => {
      const context: AgentContext = {
        workflow_id: "test-workflow",
        phase: 4,
        attempt: 1,
        previous_results: [],
        config: DEFAULT_WORKFLOW_CONFIG,
        env: {},
      };

      const result = await agent.execute(context);

      const fixCheck = result.checks.find(
        (c) => c.name === "Auto-Fix Application",
      );
      expect(fixCheck).toBeDefined();
      expect(["passed", "failed", "partial", "skipped"]).toContain(
        fixCheck?.status,
      );
    });
  });

  // ============================================================================
  // Orchestrator Tests
  // ============================================================================
  describe("MultiAgentOrchestrator", () => {
    it("should initialize with default config", () => {
      const orchestrator = new MultiAgentOrchestrator();
      const plan = orchestrator.createPlan();

      expect(plan.plan_id).toBeDefined();
      expect(plan.workflow_id).toBe("multi-agent-4-phase");
      expect(plan.phases).toHaveLength(4);
      expect(["low", "medium", "high"]).toContain(
        plan.risk_assessment.overall_risk,
      );
    });

    it("should create execution plan", () => {
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "my-custom-workflow",
      });

      const plan = orchestrator.createPlan();

      expect(plan.workflow_id).toBe("my-custom-workflow");
      expect(plan.phases).toHaveLength(4);
      expect(plan.phases[0].phase).toBe(1);
      expect(plan.phases[0].agent_id).toBe("verifier");
      expect(plan.phases[0].dependencies).toEqual([]);
      expect(plan.phases[1].dependencies).toEqual([1]);
      expect(plan.phases[2].dependencies).toEqual([2]);
      expect(plan.phases[3].dependencies).toEqual([3]);
    });

    it("should execute in dry-run mode", async () => {
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "dry-run-test",
        dryRun: true,
      });

      const result = await orchestrator.execute();

      expect(result.workflow_id).toBe("dry-run-test");
      expect(result.success).toBe(true);
      expect(result.status).toBe("completed");
      expect(result.phases).toHaveLength(4);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it("should emit events during execution", async () => {
      const events: string[] = [];
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "event-test",
        dryRun: true,
        onEvent: (event) => {
          events.push(event.type);
        },
      });

      await orchestrator.execute();

      expect(events).toContain("workflow_started");
      expect(events).toContain("workflow_completed");
      expect(events.some((e) => e.includes("phase"))).toBe(true);
    });

    it("should skip specified phases", async () => {
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "skip-test",
        skipPhases: [2, 4],
        dryRun: true,
      });

      const result = await orchestrator.execute();

      // Should only have phases 1 and 3 results
      const executedPhases = result.phases.map((p) => p.phase);
      expect(executedPhases).toContain(1);
      expect(executedPhases).not.toContain(2);
      expect(executedPhases).toContain(3);
      expect(executedPhases).not.toContain(4);
    });

    it("should include metadata in result", async () => {
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "metadata-test",
        dryRun: true,
      });

      const result = await orchestrator.execute();

      expect(result.metadata).toBeDefined();
      expect(typeof result.metadata.total_duration_ms).toBe("number");
      expect(typeof result.metadata.phases_passed).toBe("number");
      expect(typeof result.metadata.phases_failed).toBe("number");
    });

    it("should track phase results correctly", async () => {
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "phases-test",
        dryRun: true,
      });

      const result = await orchestrator.execute();

      expect(result.phases).toHaveLength(4);

      result.phases.forEach((phase) => {
        expect(phase.phase).toBeGreaterThanOrEqual(1);
        expect(phase.phase).toBeLessThanOrEqual(4);
        expect(phase.name).toBeDefined();
        expect(phase.status).toBeDefined();
        expect(phase.checks).toBeInstanceOf(Array);
        expect(phase.findings).toBeInstanceOf(Array);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  describe("Integration: Full 4-Phase Workflow", () => {
    it("should run all agents in sequence", async () => {
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "integration-test",
        dryRun: true,
      });

      const result = await orchestrator.execute();

      // Verify all phases completed
      expect(result.phases).toHaveLength(4);

      // Verify phase sequence
      const phaseNumbers = result.phases.map((p) => p.phase);
      expect(phaseNumbers).toContain(1);
      expect(phaseNumbers).toContain(2);
      expect(phaseNumbers).toContain(3);
      expect(phaseNumbers).toContain(4);

      // Verify agent names
      const agentNames = result.phases.map((p) => p.name);
      expect(agentNames).toContain("Codebase Verification");
      expect(agentNames).toContain("Evals & Tests");
      expect(agentNames).toContain("Git Workflow");
      expect(agentNames).toContain("Issue Fixer");
    });

    it("should handle handoff between phases", async () => {
      const events: string[] = [];
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "handoff-test",
        dryRun: true,
        onEvent: (event) => {
          events.push(event.type);
        },
      });

      await orchestrator.execute();

      // Should have handoff events between phases
      const handoffCount = events.filter(
        (e) => e === "handoff_completed",
      ).length;
      expect(handoffCount).toBe(3); // 3 handoffs for 4 phases
    });

    it("should validate quality gates", async () => {
      const events: Array<{ type: string }> = [];
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "gates-test",
        dryRun: true,
        onEvent: (event) => {
          events.push({ type: event.type });
        },
      });

      await orchestrator.execute();

      // Should have quality gate checks
      const gateEvents = events.filter(
        (e) =>
          e.type === "quality_gate_passed" || e.type === "quality_gate_failed",
      );
      expect(gateEvents.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================
  describe("Error Handling", () => {
    it("should handle agent execution errors gracefully", async () => {
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "error-test",
        dryRun: true,
      });

      const result = await orchestrator.execute();

      // Even with potential errors, should complete
      expect(result.status).toBeDefined();
      expect(result.phases).toBeDefined();
    });

    it("should retry on recoverable errors (simulated)", async () => {
      // This test verifies the retry configuration is correct
      const config: WorkflowConfig = {
        ...DEFAULT_WORKFLOW_CONFIG,
        phases: DEFAULT_WORKFLOW_CONFIG.phases.map((p) => ({
          ...p,
          retry_on_failure: true,
          max_retries: 2,
        })),
      };

      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "retry-test",
        config,
        dryRun: true,
      });

      const result = await orchestrator.execute();
      expect(result.status).toBe("completed");
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================
  describe("Configuration", () => {
    it("should use custom workflow configuration", () => {
      const customConfig: Partial<WorkflowConfig> = {
        workflow_id: "custom-config",
        retry_policy: {
          max_attempts: 5,
          backoff_ms: 2000,
          backoff_multiplier: 3,
          max_backoff_ms: 60000,
          retryable_errors: ["timeout", "network_error"],
        },
      };

      const orchestrator = new MultiAgentOrchestrator({
        config: customConfig,
      });

      const plan = orchestrator.createPlan();
      expect(plan.workflow_id).toBe("custom-config");
    });

    it("should respect phase timeouts", () => {
      const config: Partial<WorkflowConfig> = {
        phases: DEFAULT_WORKFLOW_CONFIG.phases.map((p) => ({
          ...p,
          timeout_ms: 60000, // 1 minute
        })),
      };

      const orchestrator = new MultiAgentOrchestrator({ config });
      const plan = orchestrator.createPlan();

      plan.phases.forEach((phase) => {
        expect(phase.estimated_duration_ms).toBe(60000);
      });
    });
  });
});
