# Formatting Enforcement Skill

## Purpose
Prevent CI formatting failures by ensuring all code changes pass `prettier --check` before commits are pushed.

## When to Use
- **After EVERY file edit**: Run `npx prettier --write .` before committing
- **Before commit**: The pre-commit hook runs `npx prettier --check` and BLOCKS unformatted commits

## Instructions

### 1. Format All Files
```bash
npx prettier --write .
```

### 2. Verify Formatting
```bash
npx prettier --check .
```
All files must return "All matched files use Prettier code style!" — if not, the commit WILL be blocked.

### 3. CI Format Check
The CI pipeline runs `npx prettier --check .` on every PR. This is identical to the local pre-commit hook Gate 6. Formatting failures in CI indicate the agent skipped post-edit verification.

## File Types Covered
- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- JSON (`.json`)
- YAML (`.yml`, `.yaml`)
- Markdown (`.md`)

## Common Failure Patterns

| Pattern | Root Cause | Fix |
|:---|:---|:---|
| CI Format Check fails | Agent edited files without running prettier | `npx prettier --write .` |
| Pre-commit blocked | Staged files not formatted | Same as above |
| PR shows formatting diffs | Multiple phases touched same files | Format entire project, not just changed files |

## Integration with AGENTS.md
The AGENTS.md **Formatting Mandate** rule enforces this skill. Agents MUST:
1. Run `npx prettier --write .` after every file edit
2. Run `npm run lint` (which includes `prettier --check .`) before considering work complete
3. Never push code that fails `prettier --check`

## Guard Rail Reference
- **Gate 6** in `scripts/pre-commit-hook.sh` — blocks unformatted commits
- **CI Format Check** in `.github/workflows/ci.yml` — mirrors Gate 6
- **GUARD_RAILS.md** — documents all 12+ guard rails
