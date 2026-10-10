---
name: guard-rails
description: Safety and quality enforcement system for preventing errors and enforcing best practices. Use for automated safety checks, quality gates, policy enforcement, and preventing common mistakes in production systems.
---

# Guard Rails

Enforce safety and quality automatically through configurable guard rails.

## Quick Start

```typescript
import { GuardRails, Rule } from './guard-rails';

const guard = new GuardRails([
  Rule.noSecretsInCode(),
  Rule.requiredTests(),
  Rule.maxComplexity(10),
  Rule.bannedImports(['fs', 'child_process']),
]);

await guard.check(code);
```

## Rule Categories

| Category | Rules | Severity |
|----------|-------|----------|
| Security | no-secrets, no-eval, no-dynamic-import | error |
| Quality | test-coverage, complexity, duplicates | warning |
| Style | naming, formatting, imports | info |
| Performance | bundle-size, memory-limit, no-loops | warning |
| Safety | no-global-state, required-types, no-any | error |
| TypeScript | no-unused-imports, no-unnecessary-nullish, no-non-null-assertion | error |

## Rule Types

**Built-in Rules**:
```typescript
Rule.noSecretsInCode({ patterns: ['API_KEY', 'PASSWORD'] });
Rule.requiredTests({ minCoverage: 80, perFunction: true });
Rule.maxComplexity({ cyclomatic: 10, cognitive: 15 });
Rule.noFloatingPromises();
Rule.bannedSyntax(['eval', 'with', 'arguments.callee']);
```

**Custom Rules**:
```typescript
Rule.custom({
  name: 'no-console-in-prod',
  check: (code, ctx) => {
    if (ctx.isProduction && code.includes('console.log')) {
      return { pass: false, message: 'Remove console.log' };
    }
    return { pass: true };
  }
});
```

## Configuration

```typescript
interface GuardConfig {
  rules: Rule[];
  severity: 'strict' | 'normal' | 'relaxed';
  autofix: boolean;
  failOn: 'error' | 'warning' | 'never';
  ignore: string[];
  customRules: CustomRule[];
}
```

## Enforcement Modes

**Block Mode** - Fail immediately:
```typescript
const guard = new GuardRails(rules, { mode: 'block' });
const result = await guard.check(code);
if (!result.passed) throw new Error('Guard rails failed');
```

**Report Mode** - Log only:
```typescript
const guard = new GuardRails(rules, { mode: 'report' });
const result = await guard.check(code);
console.log(result.violations);
```

**Fix Mode** - Auto-correct:
```typescript
const guard = new GuardRails(rules, { mode: 'fix' });
const fixed = await guard.fix(code);
```

## Integration Points

**Pre-commit Hook**:
```typescript
// .git/hooks/pre-commit
guard.checkStagedFiles();
```

**CI Pipeline**:
```typescript
// github action
guard.checkChangedFiles({ since: 'origin/main' });
```

**Runtime**:
```typescript
// In production
if (env.NODE_ENV === 'production') {
  guard.enableStrictMode();
}
```

## TypeScript Guard Rules (Codacy Enforcement)

| Rule | Check | Fix |
|------|-------|-----|
| no-unused-imports | every named import is referenced | delete the unused import |
| no-non-null-assertion | no `expr!` outside `!==`/`!=` | type guard, optional chaining, or `??` fallback |
| no-unnecessary-undefined-check | no `[N] !== undefined` on indexed access | use `??` fallback (informational; `noUncheckedIndexedAccess` makes some checks required) |

```typescript
Rule.custom({
  name: 'no-non-null-assertion',
  check: (code) => /\w+![^=!]/.test(code)
    ? { pass: false, message: 'Non-null assertion (!) forbidden' }
    : { pass: true },
});
```

## Safety Policies

**Security Policy**:
```typescript
const security = GuardRails.security({
  noSecrets: true,
  noEval: true,
  noDynamicImports: true,
  requiredAudit: true
});
```

**Quality Policy**:
```typescript
const quality = GuardRails.quality({
  minCoverage: 80,
  maxComplexity: 10,
  noDuplicates: true,
  requiredDocs: true
});
```

## Merge Guardrail (NON-NEGOTIABLE)

**Rule: NEVER merge a PR with failing CI.** External quality gates are required and blocking.

```typescript
Rule.custom({
  name: 'no-merge-on-red-ci',
  check: (ctx) => {
    const required = [
      'CI Summary', 'Type Check', 'Format Check', 'Docs Validation',
      'Validation Gates', 'Unit Tests', 'E2E Tests', 'Smoke Tests',
      'Security Scan', 'Build', 'Quality Gate',
      'CodeQL (actions, javascript-typescript)', 'Codacy Static Code Analysis',
      'Workers Builds'
    ];
    for (const c of ctx.statusCheckRollup) {
      if (required.includes(c.name) && c.conclusion !== 'SUCCESS') {
        return { pass: false, message: `Blocked: ${c.name} is ${c.conclusion} — fix before merge` };
      }
    }
    return { pass: true };
  }
});
```

Pre-merge verification (required):
```bash
gh pr view <n> --json statusCheckRollup -q '.statusCheckRollup[] | "\(.name): \(.conclusion)"'
gh pr checks <n>  # must show 0 failures
# Do not use --admin or admin bypass
```

Policy:
- Any `FAILURE`, `ACTION_REQUIRED`, `TIMED_OUT`, `CANCELLED` blocks merge. `SKIPPED` only for non-required jobs like `auto-merge`.
- External analysis (Codacy, DeepSource, CodeQL) failures — including `ACTION_REQUIRED` or `Not up to standards` with critical/high findings — must be resolved or explicitly triaged with reviewed suppression before merge.
- Branch protection MUST require checks above; if missing, file ADR and block merge.

## Directory Hygiene Policy

| Rule | Pattern | Allowed Location | Severity |
|------|---------|------------------|----------|
| no-root-temp-files | `typecheck_*.txt`, `*.tmp`, `*.temp` | `temp/` | warning |
| root-folder-hygiene | Non-essential config/docs | Root (`/`) | warning |

## Results Format

```typescript
interface GuardResult {
  passed: boolean;
  violations: Violation[];
  fixed?: string;           // If autofix enabled
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

interface Violation {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  location: { line: number; column: number };
  fix?: string;
}
```

## Best Practices

1. **Start strict** - Add exceptions as needed
2. **Team consensus** - Define rules collaboratively
3. **Automate** - Run in CI, not just locally
4. **Review** - Periodic rule effectiveness review

See [templates/policy.ts](templates/policy.ts) and [examples/safety-check.ts](examples/safety-check.ts) for implementations.

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "Report mode is fine in production; nobody reads the logs anyway." | `enforceGuardRails` in `worker/lib/guard-rails.ts` throws a non-retryable `ValidationError` on fatal findings. Report mode lets unsafe deals through the validation stage. |
| "The safety scan covers the whole batch." | The processing stage in `runGuardRails` samples `Math.min(deals.length, 10)`; treating that sample as full coverage leaves injection in later deals unscanned. |
| "A red external check can be forced through with `--admin`." | The merge guardrail forbids admin bypass; any conclusion other than `SUCCESS` blocks merge. |
| "Directory hygiene warnings are cosmetic." | Root artifacts such as `typecheck_*.txt`, `*.tmp`, and `*.temp` are policy violations; they belong under `temp/`. |

## Red Flags

- [ ] `checkSafety` XSS or dangerous-URL-scheme findings downgraded from fatal in `runGuardRails`.
- [ ] A run exceeding `CONFIG.MAX_DEALS_PER_RUN` or `CONFIG.MAX_PAYLOAD_SIZE_BYTES` passed without the resource-limit check firing.
- [ ] PR merged while a required check from the merge guardrail list is not `SUCCESS`.
- [ ] `!` non-null assertions or unused imports merged despite the TypeScript guard rules.
- [ ] Root-level temp artifacts left outside `temp/` and left unreported.
