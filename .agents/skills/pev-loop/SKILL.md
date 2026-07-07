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
