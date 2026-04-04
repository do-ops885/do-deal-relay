# Enhanced Local Guard Rails

**Created**: 2026-04-04
**Purpose**: Match GitHub Actions CI locally to prevent commits/pushes that would fail in CI
**Location**: `scripts/pre-commit-hook.sh`, `scripts/pre-push-hook.sh`

---

## Overview

These enhanced guard rails run the **same checks as GitHub Actions CI** locally before allowing commits and pushes. This prevents:
- Broken code from reaching the repository
- CI failures after push
- Wasted CI time on simple mistakes
- Security leaks (secrets detection)

---

## Pre-Commit Guard Rails (10 Gates)

**Runs on**: `git commit`
**Install**: `cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`

| Gate | Purpose | Matches CI |
|------|---------|------------|
| 1 | Blocked File Patterns | ✅ Custom (env files, keys, PEMs) |
| 2 | Secret Detection | ✅ security-scan job |
| 3 | File Size Limits (10MB max) | ✅ Custom |
| 4 | Line Count Limits (500 max) | ✅ validate-codes job |
| 5 | Dependency Directory Check | ✅ Custom |
| 6 | Code Quality (TypeScript + Tests) | ✅ lint + test jobs |
| 7 | JSON/YAML Syntax Validation | ✅ yaml-lint job |
| 8 | Root Directory Organization | ✅ Custom |
| 9 | Directory Organization | ✅ Custom |
| 10 | GitHub Actions Workflow Validation | ✅ actionlint |

### Secret Detection Patterns (17 patterns)

- GitHub tokens: `ghp_`, `gho_`, `ghs_`
- Stripe keys: `sk-`, `sk_live_`, `sk_test_`
- AWS keys: `AKIA`, `ASIA`
- Bearer tokens: `bearer <token>`
- Private keys: `BEGIN (RSA\|EC\|DSA\|OPENSSH) PRIVATE KEY`
- API key assignments: `api_key = "value"`
- Password assignments: `password = "value"`
- Secret assignments: `secret = "value"`
- Generic high-entropy strings (40+ chars base64)

### Blocked File Patterns

```
*.env*, *.key, *.pem, *.p12, *.pfx
*secret*, *password*, *credential*
node_modules/, coverage/, dist/, build/
```

---

## Pre-Push Guard Rails (9 Gates)

**Runs on**: `git push`
**Install**: `cp scripts/pre-push-hook.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push`

| Gate | Purpose | Matches CI |
|------|---------|------------|
| 1 | TypeScript Compilation | ✅ lint job |
| 2 | Test Suite (with worker crash handling) | ✅ test job |
| 3 | Validation Gates (9 gates) | ✅ validate-codes job |
| 4 | Security Scan (full repo) | ✅ security-scan job |
| 5 | Quality Gate | ✅ quality-gate job |
| 6 | Branch Name & Main Protection | ✅ Custom |
| 7 | Recent Commits Check | ✅ Custom |
| 8 | Dependency Security Audit | ✅ dependency-check job |
| 9 | Build Verification | ✅ build-check job |

### Main Branch Protection

The pre-push hook includes special protection for the `main` branch:
- Detects direct pushes to `main`
- Requires confirmation phrase: "I understand pushing to main"
- Logs all main push attempts to `temp/main-push-audit.log`
- Recommends feature branch workflow

### Branch Naming Convention

Allowed patterns:
- `feature/description`
- `fix/bug-name`
- `hotfix/critical-fix`
- `chore/task-name`
- `docs/update-name`
- `refactor/module-name`
- `test/test-name`
- `style/formatting`
- `perf/optimization`
- `ci/workflow-name`
- `build/script-name`

---

## CI vs Local Guard Rails Mapping

### GitHub Actions CI Jobs → Local Hooks

| CI Job | File | Local Equivalent | Status |
|--------|------|------------------|--------|
| Quality Gate | `ci.yml` | `quality_gate.sh` + pre-commit/pre-push | ✅ Matched |
| Unit Tests | `ci.yml` | `run-tests-ci.sh` in pre-push | ✅ Matched |
| Validation Gates | `ci.yml` | `validate-codes.sh` in pre-push | ✅ Matched |
| Security Scan | `ci.yml` | Secret patterns in pre-commit/pre-push | ✅ Matched |
| Lint & Format | `ci.yml` | Prettier + TypeScript in pre-commit | ✅ Matched |
| Build Check | `ci.yml` | `npm run build` in pre-push | ✅ Matched |
| Secret Scan | `security.yml` | TruffleHog patterns in pre-push | ✅ Matched |
| Dependency Check | `security.yml` | `npm audit` in pre-push | ✅ Matched |
| YAML Lint | `yaml-lint.yml` | Python YAML validation in pre-commit | ✅ Matched |

---

## Usage

### Automatic Installation

The hooks are already installed in `.git/hooks/` in this repository.

### Manual Installation

```bash
# Pre-commit hook
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Pre-push hook
cp scripts/pre-push-hook.sh .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

### Bypass (Emergency Only)

```bash
# Bypass pre-commit
git commit --no-verify -m "message"

# Bypass pre-push
git push --no-verify
```

⚠️ **Warning**: Bypassing hooks allows code that may fail in CI.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All guard rails passed |
| 1 | Commit/push blocked due to errors |
| 2 | Quality gate failed (specific) |

---

## Output Examples

### ✅ All Guard Rails Passed

```
🛡️  Running pre-commit guard rails (matching GitHub Actions CI)...

Guard Rail 1: Blocked File Patterns
✓ No blocked file patterns found

Guard Rail 2: Secret Detection
✓ No secrets detected (17 patterns checked)

...

==================================
Guard Rails Summary
==================================
Errors: 0
Warnings: 0

✓ ALL GUARD RAILS PASSED
Safe to commit!
```

### ⚠️ Commit Allowed with Warnings

```
🛡️  Running pre-commit guard rails (matching GitHub Actions CI)...

...

Guard Rail 4: Line Count Limits
⚠ tests/unit/storage.test.ts has 685 lines (max 500)

==================================
Guard Rails Summary
==================================
Errors: 0
Warnings: 1

⚠ COMMIT ALLOWED WITH WARNINGS
Review 1 warning(s) above before pushing.
```

### ❌ Commit Blocked

```
🛡️  Running pre-commit guard rails (matching GitHub Actions CI)...

Guard Rail 2: Secret Detection
✗ Potential secret detected (pattern 1):
  api_key = "sk-live-1234567890abcdef"
✗ COMMIT BLOCKED: Secrets detected in staged changes

==================================
Guard Rails Summary
==================================
Errors: 2

✗ COMMIT BLOCKED
Fix the 2 error(s) above before committing.

To bypass (not recommended): git commit --no-verify
```

---

## Maintenance

### Updating Guard Rails

When GitHub Actions workflows change, update the corresponding local guard rails:

1. Check `.github/workflows/*.yml` for new checks
2. Add matching checks to `scripts/pre-commit-hook.sh` or `scripts/pre-push-hook.sh`
3. Update this documentation
4. Test with `./.git/hooks/pre-commit` and `./.git/hooks/pre-push`

### Adding New Secret Patterns

Edit `SECRET_PATTERNS` array in both hooks:

```bash
SECRET_PATTERNS=(
    "existing-pattern"
    "new-pattern-here"  # Add your pattern
)
```

---

## Troubleshooting

### Hook Not Running

```bash
# Check if hooks are executable
ls -la .git/hooks/pre-commit .git/hooks/pre-push

# Re-install if needed
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### actionlint Not Installed

```bash
# Install actionlint for workflow validation
go install github.com/rhysd/actionlint/cmd/actionlint@latest

# Or use Docker
docker run --rm -v $PWD:/repo rhysd/actionlint:latest
```

### Tests Taking Too Long

Pre-push tests can be slow. To skip temporarily:

```bash
SKIP_TESTS=1 git push
```

---

## Related Files

- `scripts/quality_gate.sh` - Full quality gate (all CI checks)
- `scripts/validate-codes.sh` - 9 validation gates
- `scripts/run-tests-ci.sh` - Test runner with worker crash handling
- `.github/workflows/ci.yml` - GitHub Actions CI pipeline
- `.github/workflows/security.yml` - Security scanning workflows
