# Never-Bypass Validation System

**Purpose**: Prevent silent bypasses of quality guard rails with comprehensive audit trails and mandatory justification.

**Date**: 2026-04-01
**Status**: Active
\*\*Version: 0.1.1

---

## Overview

The Never-Bypass Validation System ensures that all attempts to bypass git guard rails are:

1. **Explicitly Confirmed** - User must type exact confirmation phrase
2. **Fully Justified** - Written reason required (min 20 characters)
3. **Completely Audited** - Logged with timestamp, user, justification, commit SHA
4. **Quota-Tracked** - Warnings after 3+ bypasses per day
5. **Hierarchically Enforced** - Critical errors can NEVER be bypassed

---

## Core Principle

> **Guard rails must ALWAYS run, even if bypassed.**

There is no "skip guard rails" shortcut. There is no environment variable to disable them. There is no "trust me" mode.

The only way past a guard rail failure is through explicit confirmation, written justification, and audit logging.

---

## Bypass Requirements

### Step 1: Explicit Confirmation

User must type **exactly**: `I understand and accept the risks`

```
╔════════════════════════════════════════════════════════════════╗
║           GUARD RAIL BYPASS REQUESTED                          ║
╚════════════════════════════════════════════════════════════════╝

Hook Type: pre-commit
Errors Found: 3

⚠️  WARNING: Bypassing guard rails is dangerous!

Bypassing means:
  • Code quality checks will be SKIPPED
  • Secrets may be committed accidentally
  • Tests will not run
  • Type errors may be pushed

This action will be LOGGED and AUDITED.

To proceed, type exactly: 'I understand and accept the risks' >
```

**Why exact phrase?**

- Prevents accidental bypasses
- Forces conscious acknowledgment of risk
- Cannot be scripted easily
- Creates cognitive pause

### Step 2: Written Justification

Minimum **20 characters** required. Must explain the specific reason for bypass.

**Valid Examples:**

```
✅ "Emergency hotfix for production outage - tested manually"
✅ "Template integration files - guard rails need updating"
✅ "Documentation only changes - no code impact"
✅ "Adding standard template files that trigger false positives"
```

**Invalid Examples:**

```
❌ "fixing stuff" (too short)
❌ "test" (too short)
❌ "" (empty)
❌ "asdf" (nonsensical)
```

**System enforces:**

- Minimum 20 characters
- 3 attempts to provide valid justification
- Prompts with examples if too short
- Logs justification verbatim

### Step 3: Audit Logging

All bypasses logged to two locations:

**Location 1: `.git/guard-rail-audit/bypasses.log`**

```
# Guard Rail Bypass Audit Log
# Format: TIMESTAMP | HOOK_TYPE | USER | REASON | COMMIT_SHA | VERIFIED_BY | BRANCH

2026-04-01T09:30:15Z | pre-commit | John Doe <john@example.com> | Emergency hotfix - tested manually | a1b2c3d | self | main
```

**Location 2: `temp/bypasses.log`**

```
# Guard Rail Bypass Log
[2026-04-01T09:30:15Z] pre-commit bypassed by John Doe on main: Emergency hotfix - tested manually
```

**Why both locations?**

- `.git/`: Permanent, survives git operations
- `temp/`: Visible in workspace, reminds team

### Step 4: Quota Tracking

System warns after **3+ bypasses per day**:

```
⚠️ WARNING: 4 bypasses today. Consider fixing the underlying issues.
```

**Why quota tracking?**

- Identifies patterns of bypass abuse
- Encourages fixing root causes
- Flags potential process issues

---

## Critical Errors (Non-Bypassable)

The following errors **CANNOT** be bypassed under any circumstances:

### 1. Direct Push to Main/Master

```
╔════════════════════════════════════════════════════════════════╗
║  CRITICAL ERROR: Direct push to main is FORBIDDEN              ║
╚════════════════════════════════════════════════════════════════╝

Pushing directly to main can:
  • Break production systems
  • Bypass all code review
  • Introduce untested code

Required workflow:
  1. Create a feature branch: git checkout -b feature/your-feature
  2. Make your changes and commit
  3. Push the feature branch: git push origin feature/your-feature
  4. Create a Pull Request on GitHub
  5. Get code review and approval
  6. Merge via GitHub (which runs all checks)

THIS GUARD RAIL CANNOT BE BYPASSED
```

**Why non-bypassable?**

- Protects production from direct changes
- Ensures code review process
- Prevents accidental force-pushes

### 2. Secret Detection

Hardcoded secrets, tokens, or credentials detected in staged changes.

```
✗ Potential secret detected matching pattern: ghp_...
✗ Secrets detected in staged changes!
   Remove secrets from files before committing.
```

**Why non-bypassable?**

- Secrets cannot be "un-leaked"
- Git history preserves leaked secrets forever
- Even if revoked, creates security incident

### 3. Hardcoded Credentials

Passwords, API keys, or private keys in code.

**Why non-bypassable?**

- Same reasoning as secret detection
- Permanent security vulnerability
- Compliance violation (SOC2, ISO27001)

---

## System Components

### 1. Audit System (`scripts/guard-rail-audit.sh`)

**Functions:**

- `init_audit_system()` - Creates audit directory
- `has_bypass_flag()` - Detects `--no-verify` usage
- `require_explicit_confirmation()` - Prompts for exact phrase
- `collect_justification()` - Gathers 20+ char reason
- `log_bypass()` - Writes to audit files
- `require_bypass_justification()` - Main orchestration

**Exports:**
All functions available to hooks via `source`

### 2. Pre-Commit Hook (`scripts/pre-commit-hook.sh`)

**Guard Rails:**

1. Blocked file patterns (_.pem, _.key, .env)
2. Secret detection (ghp\_, sk-, AKIA)
3. File size limits (500 LOC max)
4. Root directory organization
5. Code quality (trailing whitespace, JSON validity)
6. Syntax validation
7. Test coverage check

**Bypass Flow:**

```
Guard Rail Fails
    ↓
Check if --no-verify used
    ↓
YES → Require confirmation phrase
    ↓
Require 20+ char justification
    ↓
Log to .git/guard-rail-audit/bypasses.log
    ↓
Log to temp/bypasses.log
    ↓
Allow commit with warning
```

### 3. Pre-Push Hook (`scripts/pre-push-hook.sh`)

**Guard Rails:**

1. TypeScript compilation
2. Test suite execution
3. Validation script (validate-codes.sh)
4. Secret scan
5. Branch name check (CRITICAL for main/master)
6. Commit message check (WIP detection)
7. Skill symlink integrity
8. Uncommitted changes check

**Critical vs Standard Errors:**

```
┌─────────────────────┬──────────────────────┐
│   CRITICAL ERRORS   │   STANDARD ERRORS    │
│   (Non-Bypassable)  │   (Bypassable)       │
├─────────────────────┼──────────────────────┤
│ Direct push to main │ TypeScript errors    │
│ Secret detection     │ Test failures        │
│ Hardcoded creds    │ Validation warnings  │
│                     │ Branch naming issues │
│                     │ WIP commits          │
└─────────────────────┴──────────────────────┘
```

---

## Usage Examples

### Normal Workflow (No Bypass)

```bash
# Make changes
git add .
git commit -m "feat: add new feature"
# Guard rails run automatically
# ✓ ALL GUARD RAILS PASSED

git push origin feature/my-feature
# Guard rails run automatically
# ✓ ALL GUARD RAILS PASSED
```

### Bypass Required (Standard Errors)

```bash
git add .
git commit -m "feat: template integration"
# Guard rails fail (template files in root)

# Must bypass with justification
git commit --no-verify -m "feat: template integration"

╔════════════════════════════════════════════════════════════════╗
║           GUARD RAIL BYPASS REQUESTED                          ║
╚════════════════════════════════════════════════════════════════╝

Hook Type: pre-commit
Errors Found: 1

⚠️  WARNING: Bypassing guard rails is dangerous!

To proceed, type exactly: 'I understand and accept the risks' >
I understand and accept the risks

────────────────────────────────────────────────────────────
JUSTIFICATION REQUIRED
────────────────────────────────────────────────────────────

You must provide a reason for bypassing pre-commit guard rails.
Minimum length: 20 characters

Enter justification: Template integration files from official template

📝 BYPASS LOGGED
   Audit file: .git/guard-rail-audit/bypasses.log
   Timestamp: 2026-04-01T09:30:15Z
   Justification: Template integration files from official template

⚠️ Bypass authorized. Proceeding with operation...
```

### Blocked (Critical Errors)

```bash
git push origin main

╔════════════════════════════════════════════════════════════════╗
║  CRITICAL ERROR: Direct push to main is FORBIDDEN                ║
╚════════════════════════════════════════════════════════════════╝

THIS GUARD RAIL CANNOT BE BYPASSED

✗ PUSH BLOCKED
```

Even with `--no-verify`:

```bash
git push --no-verify origin main

╔════════════════════════════════════════════════════════════════╗
║  CRITICAL ERRORS CANNOT BE BYPASSED                            ║
╚════════════════════════════════════════════════════════════════╝

The following critical errors must be fixed:
  • CRITICAL: Direct push to main branch detected!
```

---

## Configuration

### Audit Directory

Default: `.git/guard-rail-audit/`

Can be overridden via environment variable:

```bash
export AUDIT_DIR="/custom/audit/path"
```

### Justification Length

Default: 20 characters

Can be overridden:

```bash
export BYPASS_MIN_JUSTIFICATION_LENGTH=50
```

### Bypass Quota Warning

Default: 3 bypasses/day

Not configurable - enforced by system

---

## Monitoring and Alerts

### Daily Bypass Report

Check bypass frequency:

```bash
# Today's bypasses
grep "$(date +%Y-%m-%d)" .git/guard-rail-audit/bypasses.log | wc -l

# All bypasses
cat .git/guard-rail-audit/bypasses.log
```

### CI/CD Integration

Upload bypass logs in CI:

```yaml
- name: Upload Bypass Logs
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: guard-rail-bypasses
    path: .git/guard-rail-audit/bypasses.log
```

### Alerting Rules

Recommend alerting on:

- > 5 bypasses/day
- Any bypass on main branch
- Secret detection attempts (even if blocked)

---

## Troubleshooting

### Bypass Not Working

**Problem:** `git commit --no-verify` not triggering bypass flow

**Solution:**

1. Check hook is installed:
   ```bash
   ls -la .git/hooks/pre-commit
   ```
2. Check hook is executable:
   ```bash
   chmod +x .git/hooks/pre-commit
   ```
3. Check audit system exists:
   ```bash
   ls scripts/guard-rail-audit.sh
   ```

### Audit Log Not Created

**Problem:** `.git/guard-rail-audit/` directory missing

**Solution:**

```bash
# Manually create
mkdir -p .git/guard-rail-audit
echo "# Guard Rail Bypass Audit Log" > .git/guard-rail-audit/bypasses.log
```

Or trigger any bypass to auto-create.

### Too Many Bypasses

**Problem:** Team is bypassing frequently

**Solutions:**

1. Review why guard rails are failing
2. Fix false positives in guard rail rules
3. Add documentation for common bypass scenarios
4. Consider pairing/mobbing for bypass decisions

---

## Philosophy

### Trust but Verify

The system trusts developers to know when bypass is appropriate, but verifies:

- They understand the risks (confirmation phrase)
- They can explain the reason (justification)
- Their action is recorded (audit log)

### Fail Loud, Not Silent

Guard rails are designed to be **loud**:

- Block with clear messages
- Require explicit acknowledgment
- Log for accountability
- Never silently pass

### Safety Over Speed

When in doubt:

- Block and require justification
- Err on side of too strict
- Allow bypass with accountability
- Never allow silent bypasses

---

## Related Documentation

- **LESSON-015**: Guard Rail Bypass Policy (in LESSONS.md)
- **AGENTS.md**: Quality Gates section
- **scripts/pre-commit-hook.sh**: Implementation
- **scripts/pre-push-hook.sh**: Implementation
- **scripts/guard-rail-audit.sh**: Audit system

---

**Version: 0.1.1
**Last Updated**: 2026-04-01
**Maintainer**: Agent System
**Status\*\*: Production
