---
name: validation-gates
description: Multi-gate validation framework for progressive quality assurance. Use for implementing 10-gate validation pipelines, quality checkpoints, and automated quality gates in CI/CD workflows.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# Validation Gates

Implement progressive quality assurance through configurable validation gates.

## Quick Start

```typescript
import { ValidationPipeline, Gate } from './validation-gates';

const pipeline = new ValidationPipeline([
  Gate.syntax(),
  Gate.tests({ coverage: 80 }),
  Gate.security(),
  Gate.performance(),
]);

const result = await pipeline.run(code);
```

## Gate Types

| Gate | Purpose | Config Options |
|------|---------|----------------|
| syntax | Code compilation/parsing | language, strict |
| lint | Style enforcement | rules, fix |
| tests | Test execution | coverage, timeout |
| security | Vulnerability scan | level, ignore |
| performance | Speed benchmarks | threshold, metrics |
| integration | System tests | endpoints, data |
| docs | Documentation check | required, paths |
| deps | Dependency audit | outdated, vulns |
| size | Bundle size check | maxBytes, gzip |
| final | Pre-deployment | all-pass |

## The 10-Gate System

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  Gate 1 │ → │  Gate 2 │ → │  Gate 3 │ → │  Gate 4 │ → │  Gate 5 │
│ Syntax  │   │  Lint   │   │  Tests  │   │ Security│   │Perform. │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
     ↓
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  Gate 6 │ → │  Gate 7 │ → │  Gate 8 │ → │  Gate 9 │ → │ Gate 10 │
│Integrate│   │   Docs  │   │   Deps  │   │   Size  │   │  Final  │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
```

## Usage Patterns

**Sequential Gates** (default):
```typescript
const pipeline = new ValidationPipeline(gates, { mode: 'sequential' });
// Stops on first failure
```

**Parallel Gates**:
```typescript
const pipeline = new ValidationPipeline(gates, { mode: 'parallel' });
// Runs all, reports all failures
```

**Conditional Gates**:
```typescript
Gate.tests({ runIf: (ctx) => ctx.hasTests })
```

## Configuration

```typescript
interface GateConfig {
  name: string;
  enabled: boolean;
  required: boolean;      // Fail pipeline if this gate fails
  timeout: number;        // ms
  retry: number;          // Retry attempts
  condition?: (ctx) => boolean;
}
```

## Results Format

```typescript
interface ValidationResult {
  passed: boolean;
  gates: GateResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  artifacts: Map<string, unknown>;
}
```

## Best Practices

1. **Order matters** - Fast checks first (syntax, lint)
2. **Required vs Optional** - Only block on critical gates
3. **Caching** - Cache results of unchanged files
4. **Incremental** - Run only affected gates on partial changes

## Integration

- CI/CD pipelines
- Pre-commit hooks
- Pull request checks
- Deployment approvals

See [templates/pipeline.ts](templates/pipeline.ts) and [examples/ci-integration.ts](examples/ci-integration.ts) for complete examples.
