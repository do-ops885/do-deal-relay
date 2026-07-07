---
description: Analyze and resolve all open PRs - fix CI, resolve conflicts, address comments. Uses GOAP orchestrator with agent swarm.
subtask: true
---

# PR Resolver Command

Automated PR lifecycle management: analyze, review, fix, resolve, and merge all open PRs until CI passes on main.

## Usage

```
/pr-resolver              # All open PRs
/pr-resolver 42 58 123    # Specific PR numbers
/pr-resolver --dry-run    # Preview without changes
```

## What Happens

1. **DISCOVER**: Fetch all open PRs from GitHub
2. **ANALYZE**: Review each PR for CI status, conflicts, comments
3. **FIX**: Resolve issues in parallel using GOAP swarm
4. **VERIFY**: Run CI checks after each fix
5. **MERGE**: Merge PRs that pass all gates
6. **LOOP**: Repeat until all PRs resolved or main CI is green

## Execution Flow

### Phase 1: Discovery
```bash
gh pr list --state open --json number,title,headRefName,mergeable,statusCheckRollup,reviews,comments
```

### Phase 2: Triage (per PR)
For each PR, classify into:
- **READY**: CI green, no conflicts, approvals received
- **FIXABLE**: CI failing or conflicts resolvable automatically
- **BLOCKED**: Requires human intervention (review comments, complex conflicts)

### Phase 3: GOAP Swarm Execution

Load `pr-resolver` skill and delegate to GOAP agent:

```
Strategy: SWARM (many similar tasks across PRs)
Quality Gates: CI pass, no merge conflicts, comments addressed
Progress: plans/GOAP_STATE.md
```

### Swarm Agent Assignment

| Task | Agent Type | Skill |
|------|------------|-------|
| Fix failing CI | code-crafter | typescript-coding-standards |
| Resolve merge conflicts | code-crafter | pev-loop |
| Address PR comments | code-reviewer | codacy-code-review |
| Run tests | test-runner | validation-gates |
| Review changes | code-reviewer | guard-rails |

### Phase 4: Verification

After each fix:
```bash
./scripts/pev-gates.sh
gh pr checks <pr-number>
```

### Phase 5: Merge

For PRs passing all gates:
```bash
gh pr merge <pr-number> --squash --auto
```

### Phase 6: Loop

After merge:
1. Check if main CI is green
2. If green: done
3. If red: identify failing test, fix, push to main
4. Repeat from Phase 1 if new PRs exist

## Progress Tracking

Update `plans/GOAP_STATE.md` with:
```markdown
## PR Resolution Status
- [ ] PR #N: title - status
- [ ] PR #N: title - status
```

## Skills Used

- **goap-agent**: Orchestrates the entire workflow
- **pr-resolver**: PR-specific analysis and fix patterns
- **codacy-code-review**: Enriches review with quality data
- **validation-gates**: Runs verification gates
- **pev-loop**: Plan-Execute-Verify for complex fixes
- **typescript-coding-standards**: Code style compliance
- **guard-rails**: Safety and quality enforcement

## Human Boundaries

- **Merge conflicts requiring manual resolution**: Escalate
- **CI failures from external dependencies**: Document and skip
- **PR comments requesting design changes**: Escalate
- **Complex architectural decisions**: Escalate

## Example

```
/pr-resolver 42 58 123
```

Produces:
1. `plans/GOAP_STATE.md` updated with PR list
2. Swarm agents fixing CI issues in parallel
3. Merged PRs with green CI
4. Summary report in `plans/PR-RESOLUTION-{date}.md`
