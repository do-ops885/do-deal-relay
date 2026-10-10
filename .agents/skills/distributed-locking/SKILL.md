---
name: distributed-locking
description: Distributed coordination with TTL for preventing race conditions across multiple workers or agents. Use for mutual exclusion, leader election, rate limiting, and concurrent access control in distributed systems.
---

# Distributed Locking

Implement reliable distributed coordination with automatic expiration and deadlock prevention.

## Quick Start

```typescript
import { DistributedLock } from './distributed-locking';

const lock = new DistributedLock({
  backend: 'kv',           // KV, Redis, or custom
  ttl: 30000,              // 30 second lease
  retry: { attempts: 3, delay: 100 }
});

await lock.acquire('resource-id', async () => {
  // Exclusive access to resource
  await processCriticalSection();
});
// Lock automatically released
```

## Core Concepts

**Lock Properties**:
- **Owner**: Unique identifier (worker ID, session ID)
- **TTL**: Time-to-live prevents deadlocks
- **Renewal**: Extend lease while working
- **Fairness**: FIFO or priority ordering

## Lock Types

| Type | Use Case | Behavior |
|------|----------|----------|
| Exclusive | Single writer | One holder at a time |
| Shared | Multiple readers | Concurrent reads, exclusive writes |
| Spin | Quick operations | Retry with backoff |
| TryOnce | Fire-and-forget | Fail immediately if unavailable |

## Implementation

**Basic Lock**:
```typescript
const lock = new DistributedLock({
  backend: kv,
  ttl: 30000,
  autoRenew: true,         // Renew while active
  renewalInterval: 10000,  // Renew every 10s
});
```

**With Options**:
```typescript
await lock.acquire('key', {
  timeout: 5000,           // Wait max 5s
  ttl: 60000,            // 1 minute lease
  retry: exponentialBackoff({ max: 5 })
}, async () => {
  // Work
});
```

## Backends

**Cloudflare KV**:
```typescript
new DistributedLock({
  backend: 'kv',
  kv: env.LOCKS_KV,
  prefix: 'lock:'
});
```

**Durable Objects**:
```typescript
new DistributedLock({
  backend: 'do',
  doNamespace: env.LOCKS_DO,
  idFromName: (key) => env.LOCKS_DO.idFromName(key)
});
```

## Patterns

**Leader Election**:
```typescript
const isLeader = await lock.tryAcquire('leader', { ttl: 60000 });
if (isLeader) {
  setInterval(() => lock.renew('leader'), 30000);
  runLeaderTasks();
}
```

**Rate Limiting**:
```typescript
await lock.acquire(`rate:${userId}`, { ttl: 1000 }, async () => {
  await processRequest();
});
```

**Semaphore**:
```typescript
const sem = new Semaphore(kv, { maxConcurrency: 5 });
await sem.acquire(async () => {
  // Max 5 concurrent
});
```

## Safety Features

1. **Automatic expiration** - TTL prevents stuck locks
2. **Owner validation** - Only owner can release
3. **Deadlock detection** - Circular wait detection
4. **Lock poisoning** - Mark failed holders

## Configuration

```typescript
interface LockConfig {
  backend: 'kv' | 'do' | 'redis' | 'custom';
  ttl: number;                    // Default lease duration
  autoRenew?: boolean;
  renewalInterval?: number;
  retry?: RetryConfig;
  fair?: boolean;                 // FIFO ordering
  metrics?: boolean;              // Track lock metrics
}
```

See [templates/lock.ts](templates/lock.ts) and [examples/leader-election.ts](examples/leader-election.ts) for complete implementations.

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "The PipelineLock DO and the D1 CAS do the same thing, so keep only the D1 path." | `worker/lib/lock.ts` makes the DO the primary serialization point and treats a definitive `false` as final; ADR-022 keeps D1 only as an automatic fallback for a missing binding, RPC rejection, or `PIPELINE_LOCK_RPC_TIMEOUT_MS` overrun. |
| "I can call `acquireLock()` and ignore the boolean it returns." | The return value gates the critical section. When another trace owns the row the D1 `INSERT OR IGNORE`/UPDATE CAS leaves ownership untouched, so proceeding runs two pipelines against one `pipeline:lock` row. |
| "Renewal always succeeds once I hold the lock." | `extendLock` throws the non-retryable `ConcurrencyError` in `worker/durable-objects/pipeline-lock.ts` and `worker/lib/lock-d1.ts` when `trace_id` no longer owns the row; assuming success corrupts a stolen lease. |
| "A shorter TTL is safer than renewing." | `DEFAULT_LOCK_TTL_SECONDS` is 300. If TTL drops below the critical-section duration the expiry branch of the D1 CAS hands the row to the next run mid-flight. |

## Red Flags

- [ ] `acquireLock()` result discarded instead of gating the section it protects.
- [ ] `releaseLock()` or `extendLock()` called with a `trace_id` that never acquired the lock.
- [ ] A definitive DO `false` retried against D1 as if it were an infrastructure fault (ADR-022 says contention is not a fallback trigger).
- [ ] Lock TTL set below the expected critical-section duration with no `extendLock()` call.
- [ ] `releaseLock()` skipped on the error path, leaving the row to clear only when TTL expires.
