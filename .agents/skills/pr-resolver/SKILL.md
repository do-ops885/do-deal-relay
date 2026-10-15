---
name: pr-resolver
description: Automate the PR lifecycle — always push the branch, open the PR, and validate checks green; discover, fix CI failures, resolve conflicts, address reviews, and merge passing PRs.
---

# PR Resolver Skill — GOAP Swarm Orchestrator

## Purpose
Automate the full PR lifecycle: discover open PRs, analyze CI status, fix failures, address review comments, resolve merge conflicts, and merge passing PRs.

Reference: `plans/GOAP_STATE.md` — PR Resolver Status section

## Workflow

### 1. DISCOVER
```bash
gh pr list --state open --json number,title,statusCheckRollup,labels
```

### 2. ANALYZE
Classify PRs into:
- **READY**: CI passes, no conflicts → merge immediately
- **FIXABLE**: CI fails, can fix → dispatch fix agents
- **BLOCKED**: External issue, needs human → document and skip

### 3. FIX (GOAP Swarm)
Dispatch parallel agents per PR issue:

| Task | Agent Skill | Tools |
|------|------------|-------|
| Fix failing CI | typescript-coding-standards | `tsc --noEmit`, `prettier` |
| Resolve merge conflicts | pev-loop | `git merge`, conflict resolution |
| Address PR comments | codacy-code-review | Code review patterns |
| Run tests | validation-gates | `npm run test:unit` |
| Review changes | guard-rails | Security scan, lint |

### 4. VERIFY
```bash
./scripts/pev-gates.sh
```

### 5. PUSH AND OPEN PR (always, never ask)
After VERIFY is green, always push the branch and open a PR — or reuse the existing PR for the branch. Never stop at a local commit and never ask the user whether to push or open the PR; pushing and validating is the default completion path, not an optional extra.
```bash
git push -u origin <branch>
gh pr create --title "<plain text, max 150 chars>" --body "What/Why/Impact, max 1000 chars"  # skip when a PR already exists for the branch
gh pr checks <number>  # poll until zero failures
gh pr view <number> --json statusCheckRollup -q '.statusCheckRollup[] | "\(.name): \(.conclusion)"'
```
Only report completion when every required check concludes SUCCESS (SKIPPED is acceptable solely for non-required jobs such as auto-merge). On any FAILURE, ACTION_REQUIRED, TIMED_OUT, or CANCELLED, fix it in the same PR — never open a follow-up PR to repair CI.

### 6. MERGE
```bash
gh pr merge <number> --squash --delete-branch
```

### 7. LOOP
Repeat until all mergable PRs are merged and main CI is green.

## Agent Swarm Configuration

```yaml
strategy: parallel
agents:
  - type: code-crafter
    skill: typescript-coding-standards
    tasks: [ci-fix, lint-fix]
  - type: code-reviewer
    skill: guard-rails
    tasks: [review, security-scan]
  - type: test-runner
    skill: validation-gates
    tasks: [unit-tests, integration-tests]
```

## Rationalizations
- "CI is flaky, just retry the merge" — flaky CI indicates a real bug; merging without green creates a regression risk on main.
- "Just merge and fix later in a follow-up" — follow-ups stack up and rarely get prioritized; merge only when CI is green.
- "Auto-merge for trusted maintainers" — auto-merge bypasses the gate suite; every PR must run the full pipeline.
- "Conflict is trivial, force-push the resolution" — silent conflict resolution hides semantic differences; require explicit resolution commits.
- "Skip review comments that look nitpicky" — review comments are signal; AGENTS.md lists Operational Safety comments as blockers.
- "Local commit is enough; ask the user before pushing or opening the PR" — a local commit leaves CI, CodeQL, and E2E unrun and the work unreviewable; pushing the branch and opening the PR is the completion path, not an optional extra.

## Red Flags
- Merging a PR while any of `Type Check`, `Unit Tests`, `Quality Gate`, or `Validate Skills` is failing.
- Force-pushing over other contributors' commits without their approval.
- Bot-author PRs that bypass the human merge decision (Human Boundaries rule 3).
- Resolving a CI failure by reverting the very file the PR modified.
- Skipping `--delete-branch` after merge, leaving stale head pointers.
- Stopping at a local commit or asking the user whether to push or open the PR instead of doing it unprompted once local gates pass.
