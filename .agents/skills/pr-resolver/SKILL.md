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

### 5. MERGE
```bash
gh pr merge <number> --squash --delete-branch
```

### 6. LOOP
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
