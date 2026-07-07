---
name: pr-resolver
description: Automated PR lifecycle management — analyze, review, fix CI failures, resolve merge conflicts, address PR comments, and merge until main CI is green. Use when user asks to "fix all PRs", "resolve open PRs", "fix CI on PRs", "merge all PRs", "clean up PRs", "PR housekeeping", or "fix PR 42". Triggers on any request to process PRs or resolve PR blockers automatically. Accepts no args (all PRs) or specific PR numbers. Works as GOAP swarm orchestrating parallel agents across multiple PRs.
license: MIT
metadata:
  author: do-deal-relay
  version: 1.0.0
---

# PR Resolver Skill

Orchestrate automated PR lifecycle management using GOAP swarm pattern across multiple pull requests.

## When to Use

- Multiple open PRs need attention
- CI is failing across PRs
- Merge conflicts need resolution
- PR comments need addressing
- Main branch CI is broken after merges

## Prerequisites

- `gh` CLI authenticated
- GitHub repo with open PRs
- GOAP agent available for orchestration
- Skills loaded: codacy-code-review, validation-gates, pev-loop, typescript-coding-standards

## Execution Workflow

### Step 1: Discover Open PRs

```bash
gh pr list --state open --json number,title,headRefName,mergeable,statusCheckRollup,reviews,comments,author --jq '.[] | {number, title, branch: .headRefName, mergeable, ci: [.statusCheckRollup[] | {name, status}], reviews: [.reviews[] | .state], comments: (.comments | length), author}'
```

### Step 2: Triage Each PR

Classify into categories:

| Category | Criteria | Action |
|----------|----------|--------|
| **READY** | CI green, mergeable, approvals | Merge immediately |
| **CI_FIX** | CI failing, mergeable | Fix CI, then merge |
| **CONFLICT** | Merge conflicts | Resolve conflicts, fix CI, merge |
| **COMMENT** | Unaddressed comments | Address comments, re-review |
| **BLOCKED** | Needs human, complex design | Document, skip |

### Step 3: GOAP Swarm Orchestration

Use GOAP agent with **SWARM** strategy:

```
Strategy: SWARM
- Many similar PR-fix tasks distributed across worker agents
- Each worker: diagnose → fix → verify → report
- Controller: tracks progress in plans/GOAP_STATE.md
```

#### Agent Assignment Matrix

| PR Issue | Agent | Skills Used |
|----------|-------|-------------|
| TypeScript CI failure | code-crafter | typescript-coding-standards |
| Test failure | test-runner | validation-gates |
| Lint/format issues | code-crafter | pre-commit |
| Merge conflict | code-crafter | pev-loop |
| Security finding | code-reviewer | guard-rails |
| PR comment response | code-reviewer | codacy-code-review |
| Coverage gap | test-runner | setup-coverage |

### Step 4: Fix Patterns

#### Pattern A: Fix Failing CI

```markdown
1. Fetch CI logs: gh pr checks <pr> --json conclusion,name --jq '.[] | select(.conclusion=="failure") | .name'
2. Identify root cause (test, lint, typecheck, build)
3. Checkout PR branch: gh pr checkout <pr>
4. Apply fix
5. Commit: fix(ci): resolve <specific-failure>
6. Push to PR branch
7. Verify: gh pr checks <pr>
```

#### Pattern B: Resolve Merge Conflicts

```markdown
1. Checkout PR: gh pr checkout <pr>
2. Fetch target: git fetch origin <target-branch>
3. Merge: git merge origin/<target-branch>
4. Resolve conflicts (analyze both sides)
5. Commit merge
6. Push to PR branch
7. Verify CI passes
```

#### Pattern C: Address PR Comments

```markdown
1. Fetch comments: gh pr view <pr> --json comments --jq '.comments[] | {author, body, path, line}'
2. Classify: question / requested-change / nit / discussion
3. For requested changes: implement fix
4. For questions: reply with explanation
5. For nits: fix if trivial
6. Commit fixes
7. Reply to comment thread
```

### Step 5: Verification Gates

After each fix, run verification:

```bash
# Typecheck
npx tsc --noEmit

# Tests
npx vitest run

# Lint
npx eslint .

# Format
npx prettier --check .

# Full gate
./scripts/pev-gates.sh
```

### Step 6: Merge

For PRs passing all gates:

```bash
gh pr merge <pr> --squash --auto --delete-branch
```

### Step 7: Post-Merge Verification

After merging PRs:

```bash
# Check main CI
gh run list --branch main --limit 5

# If main CI fails
git checkout main
git pull
# Fix issue
# Push to main
```

### Step 8: Loop Until Green

```
LOOP:
  1. Fetch open PRs
  2. If no PRs → DONE
  3. Triage PRs
  4. Fix READY + FIXABLE PRs (swarm)
  5. Verify CI
  6. Merge passing PRs
  7. Check main CI
  8. If main CI red → fix, push, goto 7
  9. If main CI green → goto 1
```

## Progress Tracking

Update `plans/GOAP_STATE.md` continuously:

```markdown
## PR Resolution Status - {date}

### Summary
- Total PRs: N
- Merged: N
- Fixed: N
- Blocked: N
- In Progress: N

### Per-PR Status
| PR | Title | Status | Agent | Fix Applied |
|----|-------|--------|-------|-------------|
| #123 | feat: add X | MERGED | code-crafter | Fixed type error |
| #124 | fix: Y | FIXING | test-runner | Test failing |
| #125 | refactor: Z | BLOCKED | - | Needs design review |
```

## Escalation Rules

Escalate to human when:
- PR requires design decision (not implementation)
- CI failure is in external dependency
- Merge conflict is architectural (both sides change same interface)
- PR comments request scope change
- Security vulnerability found in PR code
- 3+ attempts to fix same CI failure failed

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "This might merge a bad PR" | Every merge requires CI green + verification gates. No shortcuts. |
| "Automated conflict resolution is risky" | We analyze both sides, run tests after resolution, and escalate complex conflicts. |
| "Too many agents = chaos" | GOAP swarm with progress tracking ensures coordination. Each agent has clear task. |
| "What about code review?" | Code reviewer agent + codacy integration provides quality gate before merge. |

## Red Flags

- [ ] Merging PR without CI passing
- [ ] Resolving conflicts without running tests
- [ ] Ignoring PR comments from maintainers
- [ ] Skipping verification gates
- [ ] Not tracking progress in plans/ folder
- [ ] No escalation for design decisions
- [ ] Merging PRs that reduce coverage below threshold

Base directory for this skill: /home/daytona/codebase/.agents/skills/pr-resolver
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
