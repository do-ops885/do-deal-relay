/**
 * Multi-Agent Workflow Types
 *
 * Type definitions for the 4-phase coordinated workflow system.
 *
 * Phases:
 * 1. Codebase Verification - Check URL patterns, file structure
 * 2. Evals & Tests - Run TypeScript, tests, validation gates
 * 3. Git Workflow - Stage, commit, push changes
 * 4. Issue Fixer - Identify and fix pre-existing issues
 */

// ============================================================================
// Phase Results
// ============================================================================

export type PhaseStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "partial"
  | "skipped";

export interface PhaseResult {
  phase: number;
  name: string;
  status: PhaseStatus;
  duration_ms: number;
  started_at: string;
  completed_at?: string;
  checks: PhaseCheck[];
  findings: PhaseFinding[];
  errors: PhaseError[];
  metadata?: Record<string, unknown>;
}

export interface PhaseCheck {
  name: string;
  status: "passed" | "failed" | "skipped" | "warning" | "partial";
  message: string;
  details?: Record<string, unknown>;
}

export interface PhaseFinding {
  type: "info" | "warning" | "error" | "success";
  category: string;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface PhaseError {
  code: string;
  message: string;
  recoverable: boolean;
  retry_count: number;
  context?: Record<string, unknown>;
}

// ============================================================================
// Workflow Configuration
// ============================================================================

export interface WorkflowConfig {
  workflow_id: string;
  started_at: string;
  phases: PhaseConfig[];
  retry_policy: RetryPolicy;
  handoff_strategy: HandoffStrategy;
  quality_gates: QualityGate[];
}

export interface PhaseConfig {
  phase: number;
  name: string;
  enabled: boolean;
  timeout_ms: number;
  retry_on_failure: boolean;
  max_retries: number;
  dependencies: number[];
  agent_type: AgentType;
}

export interface RetryPolicy {
  max_attempts: number;
  backoff_ms: number;
  backoff_multiplier: number;
  max_backoff_ms: number;
  retryable_errors: string[];
}

export type HandoffStrategy = "sequential" | "parallel" | "converging";
export type AgentType =
  | "verifier"
  | "tester"
  | "git"
  | "fixer"
  | "orchestrator";

export interface QualityGate {
  gate_id: string;
  phase: number;
  name: string;
  criteria: GateCriteria[];
  required: boolean;
}

export interface GateCriteria {
  metric: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "matches";
  value: unknown;
  weight: number;
}

// ============================================================================
// Agent Interface
// ============================================================================

export interface AgentContext {
  workflow_id: string;
  phase: number;
  attempt: number;
  previous_results: PhaseResult[];
  config: WorkflowConfig;
  env: Record<string, string>;
}

export interface Agent {
  id: string;
  type: AgentType;
  name: string;
  version: string;
  execute(context: AgentContext): Promise<PhaseResult>;
}

// ============================================================================
// Workflow State
// ============================================================================

export interface WorkflowState {
  workflow_id: string;
  status: WorkflowStatus;
  current_phase: number;
  phases: PhaseResult[];
  started_at: string;
  updated_at: string;
  completed_at?: string;
  metadata: WorkflowMetadata;
}

export type WorkflowStatus =
  | "initialized"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowMetadata {
  total_duration_ms: number;
  phases_passed: number;
  phases_failed: number;
  phases_partial: number;
  commits_created: string[];
  issues_fixed: string[];
  files_modified: string[];
}

// ============================================================================
// Codebase Verification Types
// ============================================================================

export interface URLPatternCheck {
  pattern: string;
  category:
    | "localhost"
    | "dynamic"
    | "production"
    | "documentation"
    | "placeholder";
  files: string[];
  status: "correct" | "incorrect" | "warning";
  message: string;
}

export interface FileStructureCheck {
  path: string;
  expected: boolean;
  exists: boolean;
  size_bytes?: number;
  issues: string[];
}

// ============================================================================
// Test & Validation Types
// ============================================================================

export interface TestSuiteResult {
  name: string;
  status: "passed" | "failed" | "skipped" | "timeout";
  duration_ms: number;
  tests_total: number;
  tests_passed: number;
  tests_failed: number;
  tests_skipped: number;
  output?: string;
  error?: string;
}

export interface ValidationGateResult {
  gate_id: string;
  name: string;
  status: "passed" | "failed" | "warning";
  checks: GateCheck[];
}

export interface GateCheck {
  check_id: string;
  name: string;
  status: "passed" | "failed" | "warning";
  message: string;
  value?: unknown;
  threshold?: unknown;
}

// ============================================================================
// Git Workflow Types
// ============================================================================

export interface GitOperation {
  type: "stage" | "commit" | "push" | "branch" | "merge" | "tag";
  status: "pending" | "success" | "failed";
  message?: string;
  output?: string;
  error?: string;
}

export interface CommitInfo {
  hash: string;
  message: string;
  files_changed: number;
  additions: number;
  deletions: number;
  timestamp: string;
}

// ============================================================================
// Issue Fixer Types
// ============================================================================

export interface DetectedIssue {
  id: string;
  type: "dependency" | "config" | "code" | "test" | "security" | "performance";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  files: string[];
  auto_fixable: boolean;
  fix_strategy?: string;
  lesson_id?: string;
}

export interface FixAttempt {
  issue_id: string;
  attempt: number;
  status: "pending" | "in_progress" | "success" | "failed";
  strategy: string;
  commands: string[];
  result?: string;
  error?: string;
}

// ============================================================================
// Orchestrator Types
// ============================================================================

export interface OrchestratorPlan {
  plan_id: string;
  workflow_id: string;
  created_at: string;
  phases: PlannedPhase[];
  estimated_duration_ms: number;
  risk_assessment: RiskAssessment;
}

export interface PlannedPhase {
  phase: number;
  agent_id: string;
  estimated_duration_ms: number;
  dependencies: number[];
  fallback_strategy: FallbackStrategy;
}

export interface RiskAssessment {
  overall_risk: "low" | "medium" | "high";
  factors: RiskFactor[];
  mitigation_strategies: string[];
}

export interface RiskFactor {
  category: string;
  level: "low" | "medium" | "high";
  description: string;
}

export type FallbackStrategy =
  | "skip"
  | "retry"
  | "manual_intervention"
  | "continue_with_warnings";

// ============================================================================
// Events & Notifications
// ============================================================================

export interface WorkflowEvent {
  event_id: string;
  workflow_id: string;
  timestamp: string;
  type: WorkflowEventType;
  phase?: number;
  message: string;
  data?: Record<string, unknown>;
}

export type WorkflowEventType =
  | "workflow_started"
  | "phase_started"
  | "phase_completed"
  | "phase_failed"
  | "phase_retry"
  | "quality_gate_passed"
  | "quality_gate_failed"
  | "handoff_completed"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_cancelled";

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  workflow_id: "multi-agent-4-phase",
  started_at: new Date().toISOString(),
  phases: [
    {
      phase: 1,
      name: "Codebase Verification",
      enabled: true,
      timeout_ms: 300000, // 5 minutes
      retry_on_failure: false,
      max_retries: 0,
      dependencies: [],
      agent_type: "verifier",
    },
    {
      phase: 2,
      name: "Evals & Tests",
      enabled: true,
      timeout_ms: 600000, // 10 minutes
      retry_on_failure: true,
      max_retries: 2,
      dependencies: [1],
      agent_type: "tester",
    },
    {
      phase: 3,
      name: "Git Workflow",
      enabled: true,
      timeout_ms: 300000, // 5 minutes
      retry_on_failure: true,
      max_retries: 1,
      dependencies: [2],
      agent_type: "git",
    },
    {
      phase: 4,
      name: "Issue Fixer",
      enabled: true,
      timeout_ms: 600000, // 10 minutes
      retry_on_failure: true,
      max_retries: 2,
      dependencies: [3],
      agent_type: "fixer",
    },
  ],
  retry_policy: {
    max_attempts: 3,
    backoff_ms: 1000,
    backoff_multiplier: 2,
    max_backoff_ms: 30000,
    retryable_errors: ["timeout", "network_error", "transient_failure"],
  },
  handoff_strategy: "sequential",
  quality_gates: [
    {
      gate_id: "gate-1",
      phase: 1,
      name: "Codebase Structure Check",
      criteria: [
        { metric: "incorrect_urls", operator: "eq", value: 0, weight: 1.0 },
        {
          metric: "missing_critical_files",
          operator: "eq",
          value: 0,
          weight: 1.0,
        },
      ],
      required: true,
    },
    {
      gate_id: "gate-2",
      phase: 2,
      name: "Test Quality Check",
      criteria: [
        {
          metric: "typescript_compiles",
          operator: "eq",
          value: true,
          weight: 1.0,
        },
        { metric: "tests_pass_rate", operator: "gte", value: 0.8, weight: 0.8 },
      ],
      required: true,
    },
    {
      gate_id: "gate-3",
      phase: 3,
      name: "Git Operations Check",
      criteria: [
        { metric: "commits_created", operator: "gte", value: 1, weight: 1.0 },
        { metric: "push_success", operator: "eq", value: true, weight: 1.0 },
      ],
      required: true,
    },
    {
      gate_id: "gate-4",
      phase: 4,
      name: "Issue Resolution Check",
      criteria: [
        { metric: "critical_issues", operator: "eq", value: 0, weight: 1.0 },
        {
          metric: "auto_fix_success_rate",
          operator: "gte",
          value: 0.5,
          weight: 0.6,
        },
      ],
      required: false,
    },
  ],
};
