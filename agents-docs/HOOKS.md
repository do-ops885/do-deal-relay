# Hook Configuration and Verification

**System**: Deal Discovery Relay Worker
**Version: 0.1.1
**Last Updated\*\*: 2026-04-01

This guide covers git hooks for quality enforcement, configuration, and troubleshooting in the deal discovery system.

## Hook Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Git Hooks                           │
├─────────────────────────────────────────────────────────┤
│  pre-commit    → Quality gate (compilation, tests)     │
│  commit-msg    → Message format validation             │
│  pre-push      → Pre-deployment checks                 │
│  post-checkout → Environment setup                     │
│  post-merge    → Dependency updates                    │
└─────────────────────────────────────────────────────────┘
```

## Pre-Commit Hook

**Purpose**: Prevent commits that break quality standards

**Location**: `.git/hooks/pre-commit`

**Behavior**:

```bash
#!/usr/bin/env bash
./scripts/quality_gate.sh
exit $?
```

**What It Checks**:

| Check                  | Command                 | Failure Action |
| ---------------------- | ----------------------- | -------------- |
| TypeScript compilation | `npx tsc --noEmit`      | Block commit   |
| Unit tests             | `npm test`              | Block commit   |
| Code formatting        | `prettier --check`      | Block commit   |
| Secret detection       | `grep -r "ghp_\|sk-"`   | Block commit   |
| Root directory         | `scripts/check-root.sh` | Block commit   |

### Configuration

The pre-commit hook delegates to `scripts/quality_gate.sh`:

```bash
#!/bin/bash
# scripts/quality_gate.sh

set -e

echo "🔍 Running quality gates..."

# 1. TypeScript compilation
echo "→ TypeScript check..."
npx tsc --noEmit

# 2. Tests
echo "→ Running tests..."
npm test

# 3. Root directory validation
echo "→ Validating root directory..."
./scripts/check-root.sh

echo "✅ All quality gates passed"
```

### Customizing

To add a new check:

```bash
# Edit scripts/quality_gate.sh
echo "→ Custom check..."
./scripts/custom-check.sh || exit 1
```

### Emergency Bypass

```bash
# Skip hooks (emergency only)
git commit --no-verify -m "Emergency fix"

# Skip specific hook
git commit --no-verify
```

## Commit-Message Hook

**Purpose**: Enforce conventional commit format

**Location**: `.git/hooks/commit-msg`

**Checks**:

| Check               | Rule                           | Severity |
| ------------------- | ------------------------------ | -------- |
| Minimum length      | ≥10 characters                 | Error    |
| Maximum length      | ≤72 characters (warning)       | Warning  |
| Conventional format | `type(scope): description`     | Warning  |
| No WIP markers      | No `WIP:` or `DRAFT:` prefixes | Error    |
| No trailing period  | Don't end with `.`             | Warning  |
| Capitalization      | Start with uppercase           | Warning  |
| No conflict markers | No `<<<<<` or `=====`          | Error    |

### Conventional Commit Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:

| Type       | Use When                   |
| ---------- | -------------------------- |
| `feat`     | New feature                |
| `fix`      | Bug fix                    |
| `docs`     | Documentation only         |
| `style`    | Formatting, no code change |
| `refactor` | Code restructuring         |
| `test`     | Test changes               |
| `chore`    | Maintenance tasks          |
| `ci`       | CI/CD changes              |
| `build`    | Build system changes       |
| `perf`     | Performance improvement    |

**Examples**:

```
feat(discovery): add ProductHunt source adapter
fix(pipeline): handle missing expiry dates
docs(api): update endpoint descriptions
refactor(scoring): extract trust calculation
```

### Message Template

Create `.gitmessage`:

```
# <type>(<scope>): <description>
#
# Types: feat, fix, docs, style, refactor, test, chore, ci, build, perf
# Scope: discovery, pipeline, scoring, publish, notify, docs, test
#
# Body: Explain WHAT and WHY (not HOW)
#
# Footer: BREAKING CHANGE: or Fixes #123
```

Configure:

```bash
git config commit.template .gitmessage
```

## Pre-Push Hook

**Purpose**: Pre-deployment validation

**Location**: `.git/hooks/pre-push`

**Checks**:

| Check                | Command                    | Failure Action         |
| -------------------- | -------------------------- | ---------------------- |
| Remote branch status | `git fetch`                | Warn if behind         |
| Test coverage        | `npm run test:coverage`    | Block if <80%          |
| Security scan        | `npm audit`                | Block if high severity |
| Integration tests    | `npm run test:integration` | Block on failure       |

### Configuration

```bash
#!/bin/bash
# .git/hooks/pre-push

remote="$1"
url="$2"

echo "🔍 Pre-push checks..."

# Check if behind remote
echo "→ Checking remote status..."
if git fetch $remote && [ "$(git rev-list HEAD..$remote/main --count)" -gt 0 ]; then
  echo "⚠️ Your branch is behind $remote/main. Pull first."
  exit 1
fi

# Integration tests
echo "→ Running integration tests..."
npm run test:integration || exit 1

# Security audit
echo "→ Security audit..."
npm audit --audit-level=high || exit 1

echo "✅ Pre-push checks passed"
```

## Post-Checkout Hook

**Purpose**: Environment consistency after branch switch

**Location**: `.git/hooks/post-checkout`

**Actions**:

```bash
#!/bin/bash
# .git/hooks/post-checkout

prev_head=$1
new_head=$2
branch_checkout=$3

# Only run on branch checkout (not file checkout)
if [ $branch_checkout -eq 1 ]; then
  echo "🔄 Post-checkout setup..."

  # Reinstall dependencies if package.json changed
  if [ package.json -nt node_modules/.package-lock.json ]; then
    echo "→ Dependencies changed, running npm install..."
    npm install
  fi

  # Update skills if skills-lock.json changed
  if [ .agents/skills-lock.json -nt temp/skills-checked ]; then
    echo "→ Checking skill updates..."
    touch temp/skills-checked
  fi
fi
```

## Post-Merge Hook

**Purpose**: Handle merge aftermath

**Location**: `.git/hooks/post-merge`

**Actions**:

```bash
#!/bin/bash
# .git/hooks/post-merge

squash_merge=$1

echo "🔄 Post-merge setup..."

# Reinstall if needed
if [ package.json -nt node_modules/.package-lock.json ]; then
  echo "→ Dependencies changed, running npm install..."
  npm install
fi

# Run tests to verify merge
echo "→ Running tests..."
npm test
```

## Hook Installation

### Initial Setup

```bash
# Make hooks executable
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/commit-msg
chmod +x .git/hooks/pre-push
chmod +x .git/hooks/post-checkout
chmod +x .git/hooks/post-merge

# Verify installation
ls -la .git/hooks/
```

### From Scripts Directory

The project includes hook templates in `scripts/`:

```bash
# Install from scripts
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Team-Wide Installation

Add to `package.json`:

```json
{
  "scripts": {
    "postinstall": "./scripts/install-hooks.sh"
  }
}
```

Create `scripts/install-hooks.sh`:

```bash
#!/bin/bash
# scripts/install-hooks.sh

echo "📦 Installing git hooks..."

cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

cp scripts/commit-msg-hook.sh .git/hooks/commit-msg
chmod +x .git/hooks/commit-msg

cp scripts/pre-push-hook.sh .git/hooks/pre-push
chmod +x .git/hooks/pre-push

echo "✅ Hooks installed"
```

## Hook Verification

### Test Pre-Commit

```bash
# Create test file
echo "test" > test.txt
git add test.txt

# Attempt commit (should run hooks)
git commit -m "test: verify hooks"

# Clean up
git reset HEAD~1
rm test.txt
```

### Test Commit-Message

```bash
# Should fail (too short)
echo "test" > test.txt
git add test.txt
git commit -m "test"

# Should pass
git commit -m "test: verify commit message hook"
git reset HEAD~1
rm test.txt
```

### Test Pre-Push

```bash
# Create temp branch
git checkout -b test-hooks

# Make change, commit
echo "test" >> README.md
git add README.md
git commit -m "test: verify pre-push hook"

# Attempt push (should run hooks)
git push origin test-hooks

# Clean up
git checkout main
git branch -D test-hooks
git push origin --delete test-hooks
```

## Troubleshooting

### Hook Not Running

```bash
# Check if executable
ls -la .git/hooks/pre-commit

# Make executable
chmod +x .git/hooks/pre-commit

# Verify hook exists
cat .git/hooks/pre-commit
```

### Hook Running But Failing

```bash
# Run manually to see output
.git/hooks/pre-commit

# Run with debug
bash -x .git/hooks/pre-commit
```

### Bypass Not Working

```bash
# Correct syntax for bypass
git commit --no-verify -m "message"

# Not:
git commit -m "message" --no-verify  # Wrong position
```

### Slow Hooks

```bash
# Profile hook execution
time .git/hooks/pre-commit

# Check which step is slow (add timing to script)
echo "→ Step 1..."
time command1

echo "→ Step 2..."
time command2
```

### Hook Conflicts with IDE

Some IDEs have their own git integration:

```bash
# In IDE, disable built-in commit hooks
# Use command-line git for full hooks
```

## Pre-Commit Framework Integration

Alternative: Use `pre-commit` framework for multi-language hooks:

```bash
# Install framework
pip install pre-commit

# Create .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: check-yaml
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-added-large-files

  - repo: local
    hooks:
      - id: quality-gate
        name: Quality Gate
        entry: ./scripts/quality_gate.sh
        language: script
        pass_filenames: false
EOF

# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

See `.agents/skills/pre-commit/SKILL.md` for details.

## Best Practices

### 1. Keep Hooks Fast

| Hook          | Target Duration |
| ------------- | --------------- |
| pre-commit    | <30 seconds     |
| commit-msg    | <1 second       |
| pre-push      | <2 minutes      |
| post-checkout | <10 seconds     |

### 2. Fail Fast

```bash
#!/bin/bash
set -e  # Exit on first error

# Order: fastest checks first
check_formatting || exit 1
check_types || exit 1
check_tests || exit 1
```

### 3. Provide Clear Error Messages

```bash
# Good
echo "❌ TypeScript compilation failed"
echo "   Run 'npx tsc --noEmit' for details"
echo "   Or bypass with 'git commit --no-verify'"

# Bad
exit 1  # No context
```

### 4. Document Bypass Procedures

```bash
# In error messages
echo "To bypass (emergency only): git commit --no-verify"

# In documentation
# See HOOKS.md for bypass procedures
```

### 5. Version Control Hook Scripts

```bash
# Store hooks in scripts/
scripts/
├── pre-commit-hook.sh
├── commit-msg-hook.sh
└── install-hooks.sh

# Symlink from .git/hooks/
ln -s ../../scripts/pre-commit-hook.sh .git/hooks/pre-commit
```

## Quick Reference

### Common Commands

```bash
# Install hooks
chmod +x .git/hooks/*

# Test manually
.git/hooks/pre-commit
.git/hooks/commit-msg .git/COMMIT_EDITMSG

# Bypass (emergency)
git commit --no-verify
git push --no-verify

# Skip specific hook
SKIP=pre-commit git commit -m "message"
```

### Hook File Checklist

- [ ] File exists in `.git/hooks/`
- [ ] File is executable (`chmod +x`)
- [ ] Script has shebang (`#!/bin/bash` or `#!/usr/bin/env bash`)
- [ ] Error messages are clear
- [ ] Bypass procedure documented
- [ ] Runs quickly (< targets)

### Hook Decision Matrix

| Scenario       | Hook          | Action                   |
| -------------- | ------------- | ------------------------ |
| Code quality   | pre-commit    | Block if tests fail      |
| Message format | commit-msg    | Warn/Error on bad format |
| Pre-deployment | pre-push      | Run integration tests    |
| Environment    | post-checkout | Update dependencies      |
| After merge    | post-merge    | Verify merge health      |

## Related Documentation

- [HARNESS.md](./HARNESS.md) - System overview
- [SYSTEM_REFERENCE.md](./SYSTEM_REFERENCE.md) - Project architecture
- `.agents/skills/pre-commit/SKILL.md` - Pre-commit framework
- `scripts/quality_gate.sh` - Quality gate implementation
