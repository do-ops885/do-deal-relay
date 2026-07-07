---
name: pev-loop
description: Implement the Plan-Execute-Verify loop for non-trivial tasks with atomic commits and independent verification.
---

# PEV Loop Skill — Plan-Execute-Verify

## Purpose
Implement the Plan-Execute-Verify loop for all non-trivial tasks in the do-deal-relay codebase. Supports both agent-driven and human-supervised execution.

Reference: `plans/PEV_LOOP.md`

## Phase 1: PLAN
1. Read `plans/GOAP_STATE.md` for current inventory
2. Read relevant ADRs in `plans/ADR-*.md`
3. Write a structured spec using `plans/SPEC_TEMPLATE.md`
4. Define `approach`, `non_goals`, and `acceptance_criteria`
5. Get human approval before execution

## Phase 2: EXECUTE
1. Create a feature branch from develop
2. Implement changes in isolated context
3. Use atomic commits (one per logical change)
4. Never self-certify — verification is separate

## Phase 3: VERIFY
Run `./scripts/pev-gates.sh` which checks:
1. Format — Prettier
2. Typecheck — `tsc --noEmit`
3. Lint — TypeScript + Markdown
4. Tests — Unit tests
5. Schema — Deal validation
6. Security — Secret detection
7. Dependencies — npm audit

## Human Boundaries
1. **Plan Approval**: Human reviews approach before execution
2. **Verify Escalation**: Human resolves gate failures the agent cannot fix
3. **Merge Decision**: Human approves the final PR merge

## Loop Control
- Stop on: all gates pass
- Retry on: transient failures (network, timeouts)
- Escalate on: unrecoverable failures (type errors requiring design changes)

## Rationalizations
- "Plan is overkill — I already know the change" — without `approach`, `non_goals`, `acceptance_criteria`, the verifier has no contract to check against.
- "I'll verify my own changes" — self-certification defeats the purpose; `./scripts/pev-gates.sh` must be independent of the executor.
- "Atomic commits slow me down" — non-atomic commits make bisect, revert, and code review materially harder.
- "Tests aren't needed for a docs/config change" — all changes run through the full gate suite; TypeScript and ShellCheck catches apply even to config files.
- "The branch is short-lived, skip the plan approval" — human approval is the highest-ROI check; required for any non-trivial work.

## Red Flags
- Executing before a plan exists in `plans/` referencing `plans/SPEC_TEMPLATE.md`.
- Batching `./scripts/pev-gates.sh` in the same commit as the implementation that it is supposed to verify.
- Multiple unrelated logical changes in a single commit (signals the commit should have been split).
- Re-running flaky tests until they pass instead of fixing root cause.
- Hidden merge of develop into main without CI green, or force-pushing past pre-commit hooks.
