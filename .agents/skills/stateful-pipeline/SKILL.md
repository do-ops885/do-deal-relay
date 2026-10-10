---
name: stateful-pipeline
description: Framework for complex data processing pipelines with state machine, retry logic, failure handling, and rollback capability. Use when building multi-phase data workflows.
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
import { createPipeline, Phase } from 'stateful-pipeline';

const pipeline = createPipeline([
  'discover',
  'normalize',
  'validate',
  'publish'
], {
  maxRetries: 3,
  onFailure: 'revert', // or 'quarantine', 'abort'
  enableMetrics: true,
  enableStructuredLogging: true
});

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

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| Retry every failure uniformly; classifying retryable vs not is overhead. | The retry branch only re-runs while error.retryable is true and retryCount < maxRetries; re-running a validation error just spends the backoff window. |
| On any failure, abort the run; snapshotting for rollback is too costly. | onFailure: 'revert' restores the last snapshot and cleans partial writes; aborting mid-publish leaves downstream state half-written. |
| Per-phase metrics are noise; the final success flag tells the story. | Every phase records its own metrics and log entry so a regression can be pinned to discover, normalize, validate, or publish. |
| Concurrent execution is rare, so concurrency_abort is dead code. | The state machine lists concurrency_abort as a first-class failure path because two pipelines writing the same target corrupt shared state. |

## Red Flags

- [ ] A phase mutates shared context without capturing a snapshot first, leaving revert nothing to restore.
- [ ] Retry logic re-runs a phase regardless of error.retryable or ignores maxRetries.
- [ ] A failing phase advances without selecting revert, quarantine, or concurrency_abort.
- [ ] Phases execute without emitting per-phase metrics or a structured log entry.
- [ ] The init-to-finalize chain is bypassed by invoking a later phase directly.
