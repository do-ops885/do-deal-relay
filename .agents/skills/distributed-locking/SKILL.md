---
name: distributed-locking
description: Distributed coordination with TTL for preventing race conditions across multiple workers or agents. Use for mutual exclusion, leader election, rate limiting, and concurrent access control in distributed systems.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
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
