# Swarm Execution Plan

## Agent Dispatch Sequence

1. **PR #225 (P0)** — Add Dependabot configuration validation and tests
   - Human-authored, CONFLICTING merge state, CI ACTION_REQUIRED
   - Codacy review: 2 critical + 1 high issues
   - Must be resolved FIRST (blocks all overlapping PRs)

2. **PRs #210, #208, #206 (P1)** — npm dependency bumps
   - Blocked by PR #225 (package.json overlap)
   - After #225 is stabilized, rebase onto stabilize/pr-225

3. **PRs #223, #220 (P1)** — GitHub Actions bumps
   - Blocked by PR #225 (workflow file overlap)
   - After #225 is stabilized, rebase onto stabilize/pr-225

4. **PR #219 (P1)** — actions/stale bump
   - Blocked by PR #220 (cleanup.yml overlap)
   - After PR #220 is done

5. **PR #216 (P1)** — pre-commit-hooks bump
   - No file overlap with any other PR
   - Can be processed in parallel with other non-blocked PRs

## Concurrency Rules
- All dependabot PRs with overlapping files MUST be sequenced after PR #225
- PR #219 must follow PR #220 (cleanup.yml overlap)
- PR #216 has no overlaps → can be run in parallel with anything

## Cross-PR Chains
```
PR #225 (P0) ──blocks──► PR #210 (package.json)
PR #225 (P0) ──blocks──► PR #208 (package.json)
PR #225 (P0) ──blocks──► PR #206 (package.json)
PR #225 (P0) ──blocks──► PR #223 (ci.yml, nightly.yml)
PR #225 (P0) ──blocks──► PR #220 (deploy workflows)
PR #220 ────blocks──► PR #219 (cleanup.yml)
PR #216 ────no blocks──► (independent)
```

## Agent Assignments

| Agent ID | PR # | Priority | Branch Name | Blocked By |
|----------|------|----------|-------------|------------|
| agent-1 | 225 | P0 | stabilize/pr-225 | — (first) |
| agent-2 | 210 | P1 | stabilize/pr-210 | PR #225 |
| agent-3 | 208 | P1 | stabilize/pr-208 | PR #225 |
| agent-4 | 206 | P1 | stabilize/pr-206 | PR #225 |
| agent-5 | 223 | P1 | stabilize/pr-223 | PR #225 |
| agent-6 | 220 | P1 | stabilize/pr-220 | PR #225 |
| agent-7 | 219 | P1 | stabilize/pr-219 | PR #220 |
| agent-8 | 216 | P1 | stabilize/pr-216 | — (parallel) |
