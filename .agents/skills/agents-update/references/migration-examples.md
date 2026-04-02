# Migration Examples

## Example 1: URL Handling Rules Migration

### Before (in AGENTS.md)

````markdown
## URL Handling Rules (CRITICAL)

### 1. Always Preserve Complete Links (Input)

When adding referral codes, **ALWAYS use the COMPLETE link** as provided by the user:

```bash
# CORRECT: Full link preserved
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# WRONG: Never use partial URLs
npx ts-node scripts/refcli.ts codes smart-add picnic.app/DOMI6869  # NEVER DO THIS
```
````

### 2. Full URL Always Returned (Output)

When querying the system, the **COMPLETE URL is always returned** in the `url` field:

```json
{
  "referral": {
    "id": "ref-abc123",
    "code": "DOMI6869",
    "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
    "domain": "picnic.app"
  }
}
```

````

### After (in AGENTS.md)

```markdown
## URL Handling

Critical URL preservation rules. See [url-handling.md](agents-docs/url-handling.md) for complete documentation.

- Always preserve complete links (input)
- Always return full URLs (output)
- Include full URLs in agent communication
````

### New File (agents-docs/url-handling.md)

````markdown
# URL Handling Rules

**Status**: CRITICAL  
**Enforcement**: FATAL (violations block deployment)  
**Version: 0.1.1

## Overview

URL handling is critical for referral code integrity. These rules ensure complete URL preservation throughout the system.

## 1. Always Preserve Complete Links (Input)

When adding referral codes, **ALWAYS use the COMPLETE link** as provided by the user:

```bash
# CORRECT: Full link preserved
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# WRONG: Never use partial URLs
npx ts-node scripts/refcli.ts codes smart-add picnic.app/DOMI6869  # NEVER DO THIS
```
````

## 2. Full URL Always Returned (Output)

When querying the system, the **COMPLETE URL is always returned** in the `url` field:

```json
{
  "referral": {
    "id": "ref-abc123",
    "code": "DOMI6869",
    "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
    "domain": "picnic.app"
  }
}
```

## Related Documentation

- [AGENTS.md](../AGENTS.md) - Master coordination hub
- [Guard Rails](../guard-rails.md) - Safety mechanisms

````

## Example 2: Quality Standards Migration

### Before (in AGENTS.md)

```markdown
## Code Quality Standards

**Max 500 lines per source file** - Split files exceeding this limit
**Atomic commits only** - Each change is independently verifiable
**Skill evaluation required** - All skills must pass evaluator checks
**URL preservation enforced** - Complete URLs always preserved and returned

## Quality Gates

Always run `./scripts/quality_gate.sh` before handoff or completion:

1. TypeScript compilation
2. Unit tests (>80% coverage)
3. Validation gates
4. Security checks
5. Root directory organization

**Rule**: Silent on success, loud on failure.
````

### After (in AGENTS.md)

```markdown
## Quality Standards

See [quality-standards.md](agents-docs/quality-standards.md) for complete standards and gates.

Quick rules: 500-line limit, atomic commits, skill evals, URL preservation.
```

### New File (agents-docs/quality-standards.md)

````markdown
# Code Quality Standards

**Version: 0.1.1  
**Status**: Active  
**Enforcement**: FATAL on violations

## Core Rules

### 1. Max 500 Lines Per Source File

All source files must be ≤500 lines.

```bash
# Check file length
lines=$(wc -l < "$file")
if [ $lines -gt 500 ]; then
  echo "ERROR: $file exceeds 500 lines"
  exit 1
fi
```
````

### 2. Atomic Commits Only

Each commit is independently verifiable.

```bash
# Good: Single purpose commit
git commit -m "Add referral code validation"

# Bad: Multiple unrelated changes
git commit -m "Updates"
```

## Quality Gates

```bash
./scripts/quality_gate.sh
```

Runs: TypeScript compilation, unit tests, validation gates, security checks, root directory check.

````

## Example 3: Complex Section with Tables

### Before (in AGENTS.md)

```markdown
## User Input Methods Analysis

A swarm of 6 agents analyzed all possibilities for user input. **Results**:

| Method                | Status                  | Document                     | Key Features                              |
| --------------------- | ----------------------- | ---------------------------- | ----------------------------------------- |
| **CLI**               | ✅ Implemented          | `temp/analysis-cli.md`       | oclif-based, auth, CRUD, import, research |
| **Web UI/API**        | ✅ API Done, UI Planned | `temp/analysis-web-ui.md`    | React + Vite, JWT auth, dashboard         |
| **Browser Extension** | ✅ Implemented          | `temp/analysis-extension.md` | MV3, auto-detect, context menu            |
| **Chat Bot**          | ✅ Implemented          | `temp/analysis-chatbot.md`   | Telegram/Discord, slash commands          |
| **Email Integration** | ✅ Implemented          | `temp/analysis-email.md`     | Forward parsing, command emails           |
| **Webhook/API**       | ✅ Implemented          | `temp/analysis-webhook.md`   | HMAC signed, bidirectional sync           |

**All input methods are now implemented!** Focus on optimization and production readiness.
````

### After (in AGENTS.md)

```markdown
## Input Methods

All 6 input methods implemented. See [input-methods.md](agents-docs/features/input-methods.md) for details.

Methods: CLI, Web UI/API, Browser Extension, Chat Bot, Email, Webhook
```

### New File (agents-docs/features/input-methods.md)

```markdown
# User Input Methods

**Version: 0.1.1  
**Status**: Complete  
**Last Updated**: 2026-04-01

## Overview

A swarm of 6 agents analyzed all possibilities for user input.

## Implementation Status

| Method                | Status                  | Document                     | Key Features                              |
| --------------------- | ----------------------- | ---------------------------- | ----------------------------------------- |
| **CLI**               | ✅ Implemented          | `temp/analysis-cli.md`       | oclif-based, auth, CRUD, import, research |
| **Web UI/API**        | ✅ API Done, UI Planned | `temp/analysis-web-ui.md`    | React + Vite, JWT auth, dashboard         |
| **Browser Extension** | ✅ Implemented          | `temp/analysis-extension.md` | MV3, auto-detect, context menu            |
| **Chat Bot**          | ✅ Implemented          | `temp/analysis-chatbot.md`   | Telegram/Discord, slash commands          |
| **Email Integration** | ✅ Implemented          | `temp/analysis-email.md`     | Forward parsing, command emails           |
| **Webhook/API**       | ✅ Implemented          | `temp/analysis-webhook.md`   | HMAC signed, bidirectional sync           |

**All input methods are now implemented!** Focus on optimization and production readiness.

## Related Documentation

- [AGENTS.md](../../AGENTS.md) - Master coordination hub
- [Referral System](../referral-system.md) - Referral feature details
```

## Migration Patterns Summary

| Pattern              | When to Use       | Example                                |
| -------------------- | ----------------- | -------------------------------------- |
| Brief Summary + Link | Most sections     | Section reduced to 2-3 lines with link |
| Table Only           | Status tracking   | Keep table, move details               |
| Code Block Only      | Quick reference   | Move to dedicated file                 |
| Full Removal         | Duplicate content | Reference existing file                |
