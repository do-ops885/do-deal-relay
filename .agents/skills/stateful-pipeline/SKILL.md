---
name: stateful-pipeline
description: Framework for complex data processing pipelines with state machine, retry logic, failure handling, and rollback capability. Use when building multi-phase data workflows.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# Stateful Pipeline Skill

Build production-grade data processing pipelines with state management, failure recovery, and observability.

## When to Use

- Multi-phase data workflows (ingest → transform → validate → publish)
- Need retry logic with exponential backoff
- Require rollback capability on failure
- Want per-phase metrics and logging
- Building ETL pipelines, data sync, or batch processing

## Quick Start

```typescript
import { createPipeline, Phase } from "stateful-pipeline";

const pipeline = createPipeline(
  ["discover", "normalize", "validate", "publish"],
  {
    maxRetries: 3,
    onFailure: "revert", // or 'quarantine', 'abort'
    enableMetrics: true,
    enableStructuredLogging: true,
  },
);

const result = await pipeline.execute(initialData);
// result: { success: true, metrics: {...}, phases: [...] }
```

## Core Concepts

### State Machine

```
init → discover → normalize → dedupe → validate → score → stage → publish → verify → finalize
```

Each phase:

1. Receives context from previous phase
2. Performs transformation/validation
3. Updates context for next phase
4. Records metrics and logs

### Failure Paths

- **`revert`**: Rollback to previous state, restore snapshot
- **`quarantine`**: Mark suspicious data, continue with clean data
- **`concurrency_abort`**: Abort due to concurrent execution

### Retry Logic

```typescript
// Automatic retry with exponential backoff
if (error.retryable && retryCount < maxRetries) {
  await sleep(1000 * retryCount); // 1s, 2s, 3s
  retryCount++;
  continue; // Retry same phase
}
```

## Templates

See `templates/` for:

- `state-machine.ts` - Generic state machine implementation
- `pipeline-context.ts` - Context management and data flow
- `phase-handlers.ts` - Example phase implementations

## Examples

See `examples/` for:

- `data-pipeline-example.ts` - ETL pipeline with 4 phases
- `deal-processing-example.ts` - Multi-source deal ingestion

## Reference

- `reference/failure-handling.md` - Deep dive on failure paths
- `reference/rollback-patterns.md` - Rollback strategies
- `reference/metrics-integration.md` - Metrics and observability
