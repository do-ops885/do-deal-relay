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

---

## URL Handling Rules (CRITICAL)

### 1. Always Preserve Complete Links (Input)

When adding referral codes, **ALWAYS use the COMPLETE link** as provided by the user:

```bash
# CORRECT: Full link preserved
npx ts-node scripts/cli/index.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# WRONG: Never use partial URLs
npx ts-node scripts/cli/index.ts codes smart-add picnic.app/DOMI6869  # NEVER DO THIS
```

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

**All API endpoints return full URLs:**

| Endpoint                               | URL Field                            |
| -------------------------------------- | ------------------------------------ |
| `GET /api/referrals`                   | List includes complete `url` field   |
| `GET /api/referrals/:code`             | Returns full `url`                   |
| `POST /api/referrals`                  | Created referral includes full `url` |
| `POST /api/referrals/:code/deactivate` | Returns full `url`                   |
| `POST /api/referrals/:code/reactivate` | Returns full `url`                   |

### 3. Agent Communication

When one agent queries the system and shares results with other agents, **the full URL must always be included**:

```
Agent A: Query system for picnic.app referrals
System: Returns { url: "https://picnic.app/de/freunde-rabatt/DOMI6869", ... }
Agent A: Shares with Agent B
Agent B: Receives FULL URL, not shortened version
```

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
