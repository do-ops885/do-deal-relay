---
description: Run verification gates on current changes
subtask: true
---

# Verify Command

Run independent verification gates on current changes. Agent never self-certifies.

## Usage

```
/verify [full|quick]
```

- `full`: Run all 9 gates (default)
- `quick`: Run format, typecheck, lint, tests only

## Gate Pipeline

Each gate is blocking — failure stops the pipeline:

### 1. Format Check
```bash
npm run fmt:check
```

### 2. Type Check
```bash
npm run typecheck
```

### 3. Lint
```bash
npx tsc --noEmit
```

### 4. Unit Tests
```bash
npm run test:unit
```
Coverage floor: 80%

### 5. Security Scan
```bash
grep -r 'password\|secret\|api_key\|token' --include='*.ts' --include='*.js' worker/
```
Checks for: SSRF, credential leakage, injection patterns

### 6. Dependency Audit
```bash
npm audit --audit-level=high
```

### 7. Schema Validation
```bash
npm run validate
```

### 8. Trust Score Validation
Verifies trust scores are within [0, 1] bounds

### 9. Deduplication Check
Verifies no duplicate deals in output

## Output

```
╔══════════════════════════════════════════════╗
║              Gate Results                   ║
╚══════════════════════════════════════════════╝
✓ format: pass
✓ typecheck: pass
✓ lint: pass
✓ tests:unit: pass
✗ security: fail
  Potential credential leakage detected
```

## Failure Handling

If any gate fails:
1. Report specific failing gate and details
2. Provide structured failure for re-planning
3. Do NOT auto-fix — agent must re-plan

## Integration

- Part of PEV loop (`.agents/skills/pev-loop/SKILL.md`)
- Uses `scripts/pev-gates.sh`
- Results feed back to PLAN phase
- Human escalation after 3 failed iterations
