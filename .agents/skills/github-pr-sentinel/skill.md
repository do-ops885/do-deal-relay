# github-pr-sentinel

## Purpose
Automated GitHub PR quality gate that enforces code review standards, validates CI status, and ensures compliance with repository policies before merging.

## When to Use
- Before creating a pull request
- When reviewing pull requests created by others or AI agents
- As part of the pre-merge validation workflow

## Rules

### Pre-PR Checklist
Before creating a PR, ensure:
1. All 13 quality gates pass locally (`./scripts/quality_gate.sh`)
2. TypeScript strict mode compiles with zero errors
3. No test files import deleted/removed modules
4. Function signatures match across all call sites
5. Git merge base is current with `origin/main`

### CI Status Validation
- [ ] All required CI workflows pass (lint, test, build, validate)
- [ ] Code coverage meets minimum threshold (if applicable)
- [ ] No security vulnerabilities detected by CodeQL or gitleaks
- [ ] Dependabot alerts resolved or documented

### Code Review Standards
- [ ] Commit messages follow conventional commit format
- [ ] No speculative rewrites or cargo-cult changes
- [ ] Shared files protocol followed (check active PRs for conflicts)
- [ ] ADR updated if architecture changed
- [ ] Plan file updated with task completion status

### Merge Requirements
- [ ] At least one human approval for non-trivial changes
- [ ] All conversations resolved
- [ ] Branch is up-to-date with target branch
- [ ] Squash and merge for feature branches

## Scripts

### validate-pr.sh
```bash
#!/usr/bin/env bash
# Validates PR readiness before submission

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"

echo "🔍 Running PR Sentinel Validation..."

ERRORS=()

# Check 1: Quality gates
if ! ./scripts/quality_gate.sh >/dev/null 2>&1; then
    ERRORS+=("Quality gates failed. Run: ./scripts/quality_gate.sh")
fi

# Check 2: Git status
if [ -n "$(git status --porcelain)" ]; then
    ERRORS+=("Uncommitted changes detected. Commit or stash before creating PR.")
fi

# Check 3: Branch name convention
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
if [[ ! "$BRANCH_NAME" =~ ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)/ ]]; then
    WARNINGS+=("Branch name '$BRANCH_NAME' does not follow conventional format.")
fi

# Check 4: Merge base currency
git fetch origin main 2>/dev/null || true
MERGE_BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
MAIN_HEAD=$(git rev-parse origin/main 2>/dev/null || echo "")

if [ -n "$MERGE_BASE" ] && [ -n "$MAIN_HEAD" ] && [ "$MERGE_BASE" != "$MAIN_HEAD" ]; then
    WARNINGS+=("Branch is behind origin/main. Consider rebasing.")
fi

# Report results
if [ ${#ERRORS[@]} -ne 0 ]; then
    echo "❌ PR Validation Failed:"
    for err in "${ERRORS[@]}"; do
        echo "  - $err"
    done
    exit 1
fi

if [ ${#WARNINGS[@]} -ne 0 ]; then
    echo "⚠️  Warnings:"
    for warn in "${WARNINGS[@]}"; do
        echo "  - $warn"
    done
fi

echo "✅ PR Ready for Submission"
exit 0
```

## Integration Points

### With GOAP Workflow
- **Phase 3 (Execute)**: Run sentinel before committing final changes
- **Phase 4 (Synthesize)**: Document any lessons from PR review process

### With Quality Gates
The sentinel complements (does not replace) the 13 quality gates:
- Quality gates validate code correctness
- Sentinel validates PR process compliance

### With Atomic Commits
Each commit in the PR should be created via `./scripts/ai-commit.sh`

## Related Skills
- `atomic-commit` - For creating properly formatted commits
- `code-review-assistant` - For detailed code review guidance
- `github-workflow` - For understanding CI/CD pipelines
- `goap-agent` - For overall development workflow

## Version
1.0.0
