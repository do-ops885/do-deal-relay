---
name: guard-rails
description: Safety and quality enforcement system for preventing errors and enforcing best practices. Use for automated safety checks, quality gates, policy enforcement, and preventing common mistakes in production systems.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# Guard Rails

Enforce safety and quality automatically through configurable guard rails.

## Quick Start

```typescript
import { GuardRails, Rule } from "./guard-rails";

const guard = new GuardRails([
  Rule.noSecretsInCode(),
  Rule.requiredTests(),
  Rule.maxComplexity(10),
  Rule.bannedImports(["fs", "child_process"]),
]);

await guard.check(code);
```

## Rule Categories

| Category    | Rules                                   | Severity |
| ----------- | --------------------------------------- | -------- |
| Security    | no-secrets, no-eval, no-dynamic-import  | error    |
| Quality     | test-coverage, complexity, duplicates   | warning  |
| Style       | naming, formatting, imports             | info     |
| Performance | bundle-size, memory-limit, no-loops     | warning  |
| Safety      | no-global-state, required-types, no-any | error    |

## Rule Types

**Built-in Rules**:

```typescript
Rule.noSecretsInCode({ patterns: ["API_KEY", "PASSWORD"] });
Rule.requiredTests({ minCoverage: 80, perFunction: true });
Rule.maxComplexity({ cyclomatic: 10, cognitive: 15 });
Rule.noFloatingPromises();
Rule.bannedSyntax(["eval", "with", "arguments.callee"]);
```

**Custom Rules**:

```typescript
Rule.custom({
  name: "no-console-in-prod",
  check: (code, ctx) => {
    if (ctx.isProduction && code.includes("console.log")) {
      return { pass: false, message: "Remove console.log" };
    }
    return { pass: true };
  },
});
```

## Configuration

```typescript
interface GuardConfig {
  rules: Rule[];
  severity: "strict" | "normal" | "relaxed";
  autofix: boolean;
  failOn: "error" | "warning" | "never";
  ignore: string[];
  customRules: CustomRule[];
}
```

## Enforcement Modes

**Block Mode** - Fail immediately:

```typescript
const guard = new GuardRails(rules, { mode: "block" });
const result = await guard.check(code);
if (!result.passed) throw new Error("Guard rails failed");
```

**Report Mode** - Log only:

```typescript
const guard = new GuardRails(rules, { mode: "report" });
const result = await guard.check(code);
console.log(result.violations);
```

**Fix Mode** - Auto-correct:

```typescript
const guard = new GuardRails(rules, { mode: "fix" });
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
guard.checkChangedFiles({ since: "origin/main" });
```

**Runtime**:

```typescript
// In production
if (env.NODE_ENV === "production") {
  guard.enableStrictMode();
}
```

## Safety Policies

**Security Policy**:

```typescript
const security = GuardRails.security({
  noSecrets: true,
  noEval: true,
  noDynamicImports: true,
  requiredAudit: true,
});
```

**Quality Policy**:

```typescript
const quality = GuardRails.quality({
  minCoverage: 80,
  maxComplexity: 10,
  noDuplicates: true,
  requiredDocs: true,
});
```

## Results Format

```typescript
interface GuardResult {
  passed: boolean;
  violations: Violation[];
  fixed?: string; // If autofix enabled
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

interface Violation {
  rule: string;
  severity: "error" | "warning" | "info";
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
5. **Track warnings** - All warnings must be documented in `plans/` directory:
   - Create `plans/<topic>-plan.md` for each category of warnings
   - Document issue, impact, solution, priority, assigned agent, ETA
   - Reference plan files in AGENTS.md and LESSONS.md
   - Update plans as warnings are resolved

See [templates/policy.ts](templates/policy.ts) and [examples/safety-check.ts](examples/safety-check.ts) for implementations.
