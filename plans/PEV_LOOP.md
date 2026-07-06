# Plan-Execute-Verify (PEV) Loop — do-deal-relay

**Version**: 1.0.0
**Date**: 2026-07-06
**Reference**: [Agentic Engineering: From Vibe Coding to PEV](https://professionaldeveloper.net/2026/06/21/agentic-engineering-from-vibe-coding-to-a-plan-execute-verify-discipline/)

## Overview

The PEV loop replaces "prompt and hope" with a disciplined cycle:

1. **Plan** — Turn fuzzy requests into explicit, reviewable specs
2. **Execute** — Write code in isolated environments (git worktrees)
3. **Verify** — Independent multi-check gate that the agent cannot bypass

Humans sit at three boundaries: plan approval, verify escalation, merge decision.

## Mapping to do-deal-relay

| PEV Phase | do-deal-relay Equivalent | Artifact |
|-----------|--------------------------|----------|
| Plan | GOAP decomposition + ADR | `plans/GOAP_STATE.md` + `plans/ADR-*.md` |
| Execute | Pipeline run (discover, validate, score) | `worker/pipeline/*.ts` |
| Verify | 9-gate validation | `worker/pipeline/validate-fast-path.ts` |

## Loop Structure

```
┌─────────────────────────────────────────────────────┐
│                    OUTER LOOP                       │
│  (stateless: fresh context per iteration)           │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐       │
│  │   PLAN   │──▶│ EXECUTE  │──▶│  VERIFY  │──┐    │
│  │          │   │          │   │          │  │    │
│  │ - spec   │   │ - code   │   │ - tests  │  │    │
│  │ - steps  │   │ - in     │   │ - lint   │  │    │
│  │ - goals  │   │   worktree│  │ - types  │  │    │
│  │ - criteria│  │          │   │ - security│ │    │
│  └──────────┘   └──────────┘   └──────────┘  │    │
│       ▲                                       │    │
│       └───── failure → structured feedback ───┘    │
│                                                     │
│  Stop conditions:                                   │
│  - All gates pass → create PR                       │
│  - Max iterations reached → escalate to human       │
│  - Budget exhausted → abort and log                 │
└─────────────────────────────────────────────────────┘
```

## Phase Details

### PLAN Phase

**Input**: Task description (e.g., "Add new broker source for Trading212")
**Output**: Structured spec in `plans/SPEC_TEMPLATE.md` format

Rules:
- Decompose into smallest steps that each leave the repo green
- State `non_goals` explicitly to bound scope
- Write `acceptance_criteria` as concrete, testable statements
- If ambiguous, populate `open_questions` instead of guessing
- Human reviews plan before execution begins

### EXECUTE Phase

**Input**: Approved spec
**Output**: Code changes in isolated git worktree

Rules:
- Each task runs in its own worktree (parallel-safe)
- Every tool call executes with `cwd=wt_path`
- `write_file` rejects paths resolving outside worktree
- Execution sandbox has least-privilege filesystem/network/credential access
- Progress logged to `plans/PROGRESS.json`

### VERIFY Phase

**Input**: Code changes + spec
**Output**: Pass/fail with structured findings

Gate pipeline (each is blocking):
1. `format` — Code formatting check
2. `lint` — Linting rules
3. `types` — Type checking
4. `tests` — Unit + integration tests with coverage floor
5. `security` — Security scanner (SSRF, credential leak, injection)
6. `deps` — Dependency audit
7. `schema` — Deal schema validation
8. `trust` — Trust score validation
9. `dedupe` — Deduplication check

Failure → extract specific failing tests/findings → feed back to PLAN phase.

## Human Boundaries

1. **Plan Approval** (highest ROI): Review approach + `non_goals` + `acceptance_criteria` — 30 seconds, catches expensive mistakes
2. **Verify Escalation**: When loop exhausts attempts or hits unresolvable failure — receive structured failure, not raw logs
3. **Merge Decision**: Passing gate produces a PR, never auto-merge — human owns accountability

## Audit Trail

Every PEV run emits an immutable record:
```json
{
  "run_id": "uuid",
  "task": "description",
  "plan": { "approach": "...", "steps": [...], "non_goals": [...] },
  "agent_actions": [...],
  "gate_results": { "tests": "pass", "security": "pass", ... },
  "merge_decision": "pending",
  "timestamp": "ISO8601"
}
```

## Integration with Existing Patterns

- **GOAP**: Plan phase uses GOAP decomposition for task breakdown
- **ADRs**: Complex architectural decisions produce ADRs in `plans/`
- **Validation Gates**: Verify phase runs the existing 9-gate validation
- **Trust Model**: Security gate uses existing trust scoring
- **Skills**: PEV loop instructions available as `.agents/skills/pev-loop/SKILL.md`
