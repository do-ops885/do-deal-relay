# Quality Standards

**Purpose**: Define code quality standards and quality gates for all agents working on this project.

---

## Code Quality Standards

### 1. Max 500 Lines Per Source File

All source files must remain under 500 lines. Files exceeding this limit must be split into smaller modules.

**Example - Before (Too Large):**

```typescript
// worker/lib/storage.ts - 650 lines ❌
// Contains: KV operations, R2 operations, cache logic, validation
```

**Example - After (Properly Split):**

```typescript
// worker/lib/storage/kv.ts      - 180 lines ✓
// worker/lib/storage/r2.ts      - 150 lines ✓
// worker/lib/storage/cache.ts   - 120 lines ✓
// worker/lib/storage/index.ts   - 80 lines ✓
```

### 2. Atomic Commits Only

Each commit must be independently verifiable. A single commit should represent one logical change.

**Example - Good Atomic Commits:**

```bash
git add worker/routes/referrals.ts
git commit -m "Add referral deactivation endpoint"

git add worker/lib/storage/
git commit -m "Split storage module into KV, R2, and cache submodules"

git add tests/referrals.test.ts
git commit -m "Add tests for referral lifecycle endpoints"
```

**Example - Bad (Non-Atomic) Commit:**

```bash
git add .
git commit -m "Various updates and fixes"  # ❌ Too vague, mixes concerns
```

### 3. Skill Evaluation Required

All skills in `.agents/skills/` must pass evaluator checks before being used in production.

**Running Skill Evaluation:**

```bash
# Evaluate a specific skill
npx ts-node scripts/eval-skill.ts skill-name

# Evaluate all skills
npx ts-node scripts/eval-skill.ts --all
```

**Requirements:**

- Skills must have corresponding test files
- Skills must pass structure validation
- Skills must have eval coverage documentation

### 4. URL Preservation Enforced

Complete URLs must always be preserved and returned. Never truncate or shorten URLs.

For detailed URL handling rules, see [URL Handling](./url-handling.md).

---

## Quality Gates

Always run the quality gate script before handoff or task completion:

```bash
./scripts/quality_gate.sh
```

### Quality Gate Steps

| Step                           | Description                                   | Command                         |
| ------------------------------ | --------------------------------------------- | ------------------------------- |
| 1. TypeScript Compilation      | Ensure all TypeScript compiles without errors | `npx tsc --noEmit`              |
| 2. Unit Tests                  | Run test suite with >80% coverage             | `npm run test:ci`               |
| 3. Validation Gates            | Run 10-gate validation pipeline               | `./scripts/validation_gates.sh` |
| 4. Security Checks             | Scan for secrets, vulnerabilities             | `./scripts/security_check.sh`   |
| 5. Root Directory Organization | Verify files are in proper subfolders         | `./scripts/check_root_dir.sh`   |

### Example Quality Gate Run

```bash
$ ./scripts/quality_gate.sh

[1/5] TypeScript compilation... ✓
[2/5] Unit tests (85% coverage)... ✓
[3/5] Validation gates... ✓
[4/5] Security checks... ✓
[5/5] Root directory organization... ✓

All quality gates passed! ✅
```

### Rule: Silent on Success, Loud on Failure

- **Success**: Minimal output, just confirmation
- **Failure**: Detailed error messages with file paths, line numbers, and suggested fixes

---

## Checklist for Agents

Before completing any task:

- [ ] Source files are under 500 lines
- [ ] Commits are atomic and well-described
- [ ] All skills pass evaluator checks (if modified)
- [ ] URLs are preserved in full (input and output)
- [ ] `./scripts/quality_gate.sh` passes
- [ ] No secrets or credentials in code

---

## Related Documentation

| Resource            | Location                           |
| ------------------- | ---------------------------------- |
| Quality Gate Script | `scripts/quality_gate.sh`          |
| Validation Gates    | `.agents/skills/validation-gates/` |
| Security Guidelines | `SECURITY.md`                      |
| Guard Rails         | `agents-docs/guard-rails.md`       |
