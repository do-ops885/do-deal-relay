/**
 * Multi-Agent Workflow System
 *
 * Coordinated 4-phase workflow execution with specialized agents:
 *
 * - Phase 1: Codebase Verification Agent
 * - Phase 2: Evals & Tests Runner Agent
 * - Phase 3: Git Workflow Manager Agent
 * - Phase 4: Issue Fixer Agent
 *
 * Orchestrator coordinates handoff between phases with:
 * - Retry logic with exponential backoff
 * - Quality gates at phase boundaries
 * - Event-driven progress tracking
 * - Comprehensive logging and reporting
 *
 * Usage:
 * ```typescript
 * import { MultiAgentOrchestrator } from "./multi-agent";
 *
 * const orchestrator = new MultiAgentOrchestrator({
 *   workflow_id: "my-workflow-001",
 *   onEvent: (event) => console.log(event.type, event.message),
 * });
 *
 * const result = await orchestrator.execute();
 * console.log(`Workflow ${result.status} in ${result.duration_ms}ms`);
 * ```
 */

// Agents
export { CodebaseVerificationAgent } from "./agents/phase1-verifier";
export { EvalsAndTestsAgent } from "./agents/phase2-tester";
export { GitWorkflowAgent } from "./agents/phase3-git";
export { IssueFixerAgent } from "./agents/phase4-fixer";

// Orchestrator
export { MultiAgentOrchestrator } from "./orchestrator";
export type { OrchestratorOptions, OrchestratorResult } from "./orchestrator";

// Types
export type {
  // Core types
  PhaseStatus,
  PhaseResult,
  PhaseCheck,
  PhaseFinding,
  PhaseError,

  // Configuration
  WorkflowConfig,
  PhaseConfig,
  RetryPolicy,
  HandoffStrategy,
  AgentType,
  QualityGate,
  GateCriteria,

  // Agent interface
  Agent,
  AgentContext,

  // Workflow state
  WorkflowState,
  WorkflowStatus,
  WorkflowMetadata,

  // Specialized types
  URLPatternCheck,
  FileStructureCheck,
  TestSuiteResult,
  ValidationGateResult,
  GateCheck,
  GitOperation,
  CommitInfo,
  DetectedIssue,
  FixAttempt,
  OrchestratorPlan,
  WorkflowEvent,
  WorkflowEventType,
} from "./types";

// Values (not types)
export { DEFAULT_WORKFLOW_CONFIG } from "./types";
