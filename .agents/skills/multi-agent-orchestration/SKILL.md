---
name: multi-agent-orchestration
description: Supervisor + worker patterns for complex tasks requiring specialized roles. Use when coordinating multiple agents, splitting author/tester/reviewer roles, or orchestrating parallel execution across independent tasks.
---

# Multi-Agent Orchestration Skill

Coordinate specialized agents with clear role separation and conflict-of-interest prevention.

## When to Use

- Tasks requiring 5+ independent subtasks
- Work needing separation of author/tester roles
- Complex pipelines with verification requirements
- Parallel execution across git worktrees
- Security-sensitive code requiring independent review

## Role Definitions

### Planner
**Owns**: Spec, approach, non_goals, acceptance_criteria
**Does NOT**: Write code
**Artifact**: `plans/SPEC_TEMPLATE.md`

### Author
**Owns**: Implementation against the approved spec
**Does NOT**: Write acceptance tests
**Artifact**: Code changes in isolated context

### Tester
**Owns**: Tests derived from acceptance criteria
**Does NOT**: See author's implementation details
**Artifact**: Test files, coverage reports
**Key Rule**: Tests verify intended behavior, not what author happened to build

### Reviewer
**Owns**: Code + tests against the spec
**Does NOT**: Approve own work
**Artifact**: Review findings, rejection reasons
**Can reject back to Planner with reasons**

### Security
**Owns**: Vulnerability scanning, credential detection, injection checks
**Does NOT**: Bypass security gates for convenience
**Artifact**: Security report with severity ratings
**Tool**: `worker/pipeline/security-gate.ts`

## Conflict-of-Interest Prevention

The single most important rule: **author and tester must be different agents/roles**.

If author writes tests:
- Tests measure author's confidence, not correctness
- "Passes its own tests, fails in prod" becomes common
- Self-grading is not verification

If tester writes from acceptance criteria:
- Tests verify intended behavior regardless of implementation
- Author cannot predict what tester will check
- Failures are genuine, not performative

## Execution Patterns

### Sequential (Simple)
```
Planner → Author → Tester → Reviewer → Security → PR
```
Use for: Tasks with clear dependencies, single code path

### Parallel Workers (Complex)
```
Planner → [Author1, Author2, Author3] → Tester → Reviewer → Security → PR
```
Use for: Independent subtasks, multiple modules, batch updates

### Supervisor + Worker
```
Supervisor → [Worker1, Worker2, Worker3] → Supervisor merges results
```
Use for: Long-running tasks, cross-repo coordination, dynamic delegation

## Orchestration Commands

### Delegation Routing
- **Self-Execute**: 1 trivial isolated edit
- **Delegate**: 2+ files, architectural changes, judgment required
- **Swarm**: 5+ similar independent tasks (batch updates)

### Agent Selection
Use existing opencode agents based on task type:
- `code-crafter`: Implementation, refactoring, bug fixes
- `code-reviewer`: Review, quality checks, security audit
- `test-runner`: Test execution, coverage analysis
- `research-agent`: Codebase exploration, pattern finding
- `analysis-swarm`: Complex architectural decisions

## Verification Integration

Every orchestration must end with verification:

1. Run `./scripts/pev-gates.sh` (all gates blocking)
2. Security gate via `worker/pipeline/security-gate.ts`
3. Independent tester via `worker/pipeline/independent-tester.ts`
4. Human review at boundaries (plan, escalation, merge)

## State Management

For multi-step orchestrations:
- State in `plans/PROGRESS.json` (not context window)
- Git commits as checkpoints
- Fresh context per iteration (stateless outer loop)
- Audit trail in `DEALS_LOG` KV namespace

## Cost Controls

- Set max iterations per task (default: 3)
- Set budget caps per agent run
- Track API calls per pipeline run
- Alert on budget exhaustion

## Anti-Patterns

- **Single agent doing everything**: Separates concerns poorly
- **Premature orchestration**: Start simple, add roles when failure modes demand
- **Human in inner loop**: Reviewer rubber-stamps under volume
- **Optional verification**: All gates are blocking, not advisory
- **Shared context between roles**: Each role gets focused, isolated context

## References

- `plans/PEV_LOOP.md` — Full PEV specification
- `.agents/skills/pev-loop/SKILL.md` — PEV loop instructions
- `.agents/skills/goap-agent/SKILL.md` — GOAP decomposition
- `.agents/skills/parallel-execution/SKILL.md` — Parallel patterns
- `.opencode/agents/` — Available agent definitions
