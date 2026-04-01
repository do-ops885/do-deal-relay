# Failure Handling in Stateful Pipelines

## Overview

The stateful-pipeline skill provides three failure handling strategies:

1. **`revert`** - Rollback to previous state
2. **`quarantine`** - Mark suspicious data, continue with clean
3. **`concurrency_abort`** - Abort due to concurrent execution

## Revert Strategy

### When to Use
- Critical data integrity requirements
- Partial updates would leave system inconsistent
- Transaction-like semantics needed

### Implementation

```typescript
const pipeline = createPipeline(phases, {
  onFailure: 'revert'
});

// On failure:
// 1. Stop execution
// 2. Restore last snapshot
// 3. Clean up partial changes
// 4. Return failure with details
```

### Example: Database Transaction

```typescript
async function publishToDatabase(data) {
  const pipeline = createPipeline([
    'validate',
    'begin_transaction',
    'insert_records',
    'commit'
  ], {
    onFailure: 'revert'
  });

  // If 'insert_records' fails:
  // 1. Transaction is rolled back
  // 2. Database state restored
  // 3. Error returned to caller
}
```

## Quarantine Strategy

### When to Use
- Non-critical data quality issues
- Can continue with clean subset
- Want to flag for later review

### Implementation

```typescript
const pipeline = createPipeline(phases, {
  onFailure: 'quarantine'
});

// On failure:
// 1. Mark suspicious items
// 2. Filter to clean data only
// 3. Continue with remaining
// 4. Report quarantined items
```

### Example: Data Import

```typescript
async function importRecords(records) {
  const pipeline = createPipeline([
    'parse',
    'validate',
    'insert'
  ], {
    onFailure: 'quarantine'
  });

  // Invalid records are quarantined
  // Valid records continue to insertion
  // Quarantine report generated
}
```

## Concurrency Abort Strategy

### When to Use
- Detected concurrent modification
- Distributed locking conflict
- Idempotency check failed

### Implementation

```typescript
const pipeline = createPipeline(phases, {
  onFailure: 'concurrency_abort'
});

// On conflict:
// 1. Immediately abort
// 2. Release any locks
// 3. Return conflict details
// 4. Caller can retry
```

## Best Practices

1. **Choose based on impact**: Use `revert` for critical data, `quarantine` for quality issues
2. **Always log failures**: Include phase, error, and context
3. **Implement alerts**: Notify on repeated failures
4. **Test failure paths**: Include failure scenarios in tests
5. **Document expected failures**: Some failures are expected (e.g., validation)
