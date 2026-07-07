---
name: goap-agent
description: Orchestrate swarm-based execution of complex multi-step tasks using Goal-Oriented Action Planning.
---

# GOAP Agent Skill — Goal-Oriented Action Planning

## Purpose
Orchestrate swarm-based execution of complex multi-step programming tasks using Goal-Oriented Action Planning. Decompose large tasks into atomic, independently verifiable units and coordinate parallel agent execution.

## When to Use
- Multi-step feature implementation (5+ independent tasks)
- Batch code quality fixes (lint errors, type fixes, file splits)
- CI pipeline fixes requiring multiple file changes
- Swarm execution per GOAP Swarm Protocols in AGENTS.md

## Workflow

### Phase 1: Analyze
1. Read `plans/GOAP_STATE.md` to understand current inventory
2. Read relevant ADRs in `plans/ADR-*.md`
3. Run `./scripts/pev-gates.sh` to assess current state
4. Identify all actionable items that are:
   - Not marked DEFERRED or BLOCKED
   - Not marked NO-FIX
   - Have clear acceptance criteria

### Phase 2: Decompose
1. Break findings into atomic tasks
2. Classify by priority (P0 > P1 > P2 > P3)
3. Group independent tasks for parallel execution
4. Sequence dependent tasks
5. Write task spec using `plans/SPEC_TEMPLATE.md`

### Phase 3: Execute (Swarm)
1. Dispatch parallel agents for independent tasks
2. Each agent: read → edit → verify → report
3. Use atomic commits per task
4. Run validation after each task
5. Respect the MAX_LINES_PER_SOURCE_FILE=500 constraint

### Phase 4: Verify
1. Run `./scripts/pev-gates.sh` after all changes
2. Typecheck: `npx tsc --noEmit`
3. Unit tests: `npm run test:unit`
4. Format: `npm run fmt:check`
5. Markdown lint: `npm run lint:md`

### Phase 5: Synthesize
1. Update `plans/GOAP_STATE.md` with completed items
2. Update `plans/PROGRESS-*.md` with timestamp
3. Append to `agents-docs/LEARNINGS.md` if new patterns discovered
4. Append metrics to `.agents/metrics.jsonl`

## Agent Swarm Configuration

| Task Type | Agent Skill | Verification |
|-----------|------------|-------------|
| Code fix | typescript-coding-standards | typecheck + tests |
| PR review | codacy-code-review | lint |
| Test writing | validation-gates | test runner |
| Refactoring | pev-loop | typecheck + tests + format |
| Security fix | guard-rails | security scan |

## Quality Requirements
- Every commit must pass `./scripts/pev-gates.sh`
- No file exceeds 500 lines
- No `as any` casts (use proper types)
- Atomic commits with conventional commit messages
- All tests pass before merge

## Reference
- `AGENTS.md` — Coordination hub
- `plans/PEV_LOOP.md` — Plan-Execute-Verify spec
- `plans/GOAP_STATE.md` — Task inventory
- `agents-docs/hard-constraints.md` — Hard limits

## Rationalizations
- "This is one small change, no plan needed" — skipping the plan phase for ostensibly trivial tasks leads to scope creep and missed acceptance criteria. Always start with a spec.
- "Tests already cover this, skip verification" — the goal of verification is independent confirmation, not duplication of the author's reasoning.
- "Concurrent agents will figure it out" — parallel tasks must have non-overlapping file scopes; otherwise the swarm produces a merge conflict, not a feature.
- "The deferral rationale still applies" — items deferred >30 days ago require re-verification per the AGENTS.md Re-Verification Protocol.
- "PR is small, skip CI wait" — CI catches formatting, type, and dependency issues invisible to the author.

## Red Flags
- Editing `worker/index.ts`, `worker/config.ts`, or `worker/lib/security.ts` without coordinating with other swarm members (operational safety rule).
- Skipping the `MAX_LINES_PER_SOURCE_FILE=500` check and growing files beyond 500 lines.
- Producing `as any` casts or removing type annotations to make typecheck pass.
- Running agents in parallel against overlapping files or shared hot paths.
- Posting metrics to `.agents/metrics.jsonl` for an incomplete or abstained run instead of following the abstention format.
- Treating `BLOCKED` tasks as `done` without an ADR documenting the unfixability.
