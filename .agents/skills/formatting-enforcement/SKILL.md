---
name: formatting-enforcement
description: Enforce consistent code formatting with Prettier across the entire codebase to prevent CI failures. Use after every file edit before committing.
version: 0.1.0
author: agent
tags: [formatting, prettier, ci, quality]
---

# Formatting Enforcement

Prevents CI formatting failures by ensuring all code changes pass `prettier --check` before commits are pushed. This skill hardens the pre-commit hook (Gate 6) to **block** unformatted commits.

## Quick Start

```bash
# Format all files after any code edit
npx prettier --write .

# Verify formatting before commit
npx prettier --check .
```

## File Types Covered

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- JSON (`.json`)
- YAML (`.yml`, `.yaml`)
- Markdown (`.md`)

## Instructions

### 1. Format After Every Edit

```bash
npx prettier --write .
```

Run this after every file edit. The pre-commit hook blocks unformatted commits (Gate 6).

### 2. Verify Formatting

```bash
npx prettier --check .
```

All files must return `All matched files use Prettier code style!`. If not, the commit WILL be blocked.

### 3. Full Lint Check

```bash
npm run lint
```

Runs `tsc --noEmit && prettier --check .`. This mirrors CI exactly.

## CI Integration

The CI pipeline (`ci.yml`) runs `npx prettier --check .` on every PR. This is identical to the local pre-commit hook Gate 6. Formatting failures in CI indicate the agent skipped post-edit verification.

## Common Failure Patterns

| Pattern | Root Cause | Fix |
|:---|:---|:---|
| CI Format Check fails | Agent edited files without running prettier | `npx prettier --write .` |
| Pre-commit blocked | Staged files not formatted | `npx prettier --write .` |
| PR shows formatting diffs | Multiple phases touched same files | Format entire project, not just changed files |
| Legacy formatting drift | Earlier PRs merged without formatting | `npx prettier --write .` and commit separately |

## Guard Rail Reference

- **Gate 6** in `scripts/pre-commit-hook.sh` — blocks unformatted commits (was warning-only prior to 2026-07-30)
- **CI Format Check** in `.github/workflows/ci.yml` — mirrors Gate 6
- **GUARD_RAILS.md** — documents all 12+ guard rails

## Integration with AGENTS.md

The AGENTS.md **Formatting Mandate** rule enforces this skill. Agents MUST:

1. Run `npx prettier --write .` after every file edit
2. Run `npm run lint` before considering work complete
3. Never push code that fails `prettier --check`

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "Formatting is cosmetic, it can wait." | CI blocks unformatted code. Fixing formatting after CI fails wastes a full build cycle. |
| "I only changed one file, no need to format everything." | Other files may have drifted. `--write .` catches pre-existing issues in shared files. |
| "The pre-commit hook will catch formatting issues." | It does — but it blocks the commit. Formatting proactively avoids the block. |
| "I can fix formatting in a follow-up PR." | Formatting-only commits create noise. Integrate formatting into every change. |

## Red Flags

- [ ] Agent edited TypeScript/JS/JSON/YAML/MD files without running `npx prettier --write .` afterward
- [ ] CI Format Check is red on a PR — indicates the agent skipped verification
- [ ] Pre-commit hook blocked a commit — indicates the agent didn't format before staging
- [ ] A PR contains only formatting changes mixed with logic changes — separate formatting into a dedicated commit
- [ ] Multiple PRs show formatting diffs on the same file — indicates a merge conflict pattern

## Version History

- 0.1.0 (2026-07-30) — Initial release. Created after hardening Gate 6 to block unformatted commits.
